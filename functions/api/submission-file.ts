import { notionFetch, type Env } from "../_shared/notion";

/** Reads the effective Notion secret (KV override > env). */
async function getSecret(env: Env): Promise<string> {
  let notionSecret = env.NOTION_SECRET || "";
  if (env.SUBMISSIONS_KV) {
    try {
      const override = await env.SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
      }
    } catch {
      // Ignore
    }
  }
  return notionSecret;
}

/**
 * Reads the real (signed, temporary) file URLs stored inside a submission's
 * toggle block, in document order.
 */
async function listToggleFileUrls(toggleId: string, token: string): Promise<string[]> {
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : `?page_size=100`;
    const data = await notionFetch("GET", `/blocks/${toggleId}/children${query}`, token);
    for (const block of data.results || []) {
      if (block?.type === "image" && block.image) {
        const url = block.image.file?.url || block.image.external?.url;
        if (url) urls.push(url);
      } else if (block?.type === "file" && block.file) {
        const url = block.file.file?.url || block.file.external?.url;
        if (url) urls.push(url);
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return urls;
}

/**
 * GET /api/submission-file?block=<toggleId>&i=<index>[&download=1]
 * Resolves the fresh, short-lived Notion file URL for the given submission
 * toggle + file index and proxies the bytes (same-origin, with Range support)
 * so files can be viewed inline without CORS or URL-expiry problems.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const block = url.searchParams.get("block") || "";
  const index = parseInt(url.searchParams.get("i") || "0", 10) || 0;
  const download = url.searchParams.get("download") === "1";

  if (!block) {
    return new Response("Falta el identificador del envío.", { status: 400 });
  }

  const notionSecret = await getSecret(context.env);
  if (!notionSecret) {
    return new Response("Notion no está configurado.", { status: 400 });
  }

  let fileUrl = "";
  try {
    const urls = await listToggleFileUrls(block, notionSecret);
    fileUrl = urls[index] || "";
  } catch {
    return new Response("No se pudo resolver el archivo.", { status: 502 });
  }

  if (!fileUrl) {
    return new Response("Archivo no encontrado.", { status: 404 });
  }

  // Proxy the file, forwarding Range so media seeking keeps working.
  const range = context.request.headers.get("range");
  const upstream = await fetch(fileUrl, {
    headers: range ? { Range: range } : {},
  });

  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
  headers.set("Cache-Control", "private, max-age=60");
  if (download) headers.set("Content-Disposition", "attachment");

  return new Response(upstream.body, { status: upstream.status, headers });
};
