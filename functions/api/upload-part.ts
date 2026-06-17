import { json, type Env, NOTION_VERSION, NOTION_BASE } from "../_shared/notion";

async function getCredentials(env: Env): Promise<{ notionSecret: string }> {
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
  return { notionSecret };
}

/**
 * POST /api/upload-part?upload_id=<id>
 * Streams a single multipart/form-data chunk straight through to Notion's
 * file_uploads "send" endpoint.
 *
 * IMPORTANT (Cloudflare free plan has a 10ms CPU limit per request):
 * This function does NOT parse the body with formData(). Parsing/re-serializing a
 * 10 MiB multipart payload burns far more than 10ms of CPU and gets the invocation
 * killed (Error 1102 → 503). Instead, the browser sends a body that Notion already
 * understands (a multipart form with just `file` and `part_number`), and we pipe the
 * raw request body to Notion unchanged, only adding the auth headers. Piping a stream
 * uses almost no CPU, so this stays well under the limit regardless of chunk size.
 *
 * The upload id is passed as a query param so we never need to read the body.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  const url = new URL(context.request.url);
  const uploadId = url.searchParams.get("upload_id");
  if (!uploadId) {
    return json({ error: "Se requiere upload_id." }, 400);
  }

  const contentType = context.request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json({ error: "Content-Type debe ser multipart/form-data." }, 400);
  }

  const sendUrl = `${NOTION_BASE}/file_uploads/${uploadId}/send`;

  try {
    // Pipe the raw request body straight to Notion. No buffering, no re-encoding.
    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        // Preserve the original multipart boundary so Notion can parse the parts.
        "Content-Type": contentType,
      },
      body: context.request.body,
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      // Surface transient Notion errors as 503 so the browser retries that part.
      const transient = [429, 500, 502, 503, 504, 529].includes(sendRes.status);
      return json(
        { error: `Notion rechazó el chunk: ${sendRes.status} - ${errText}` },
        transient ? 503 : 502
      );
    }

    const result = (await sendRes.json()) as any;
    return json({ success: true, status: result.status });
  } catch (err: any) {
    return json(
      { error: `Error al enviar chunk: ${err.message || "Error desconocido"}` },
      503
    );
  }
};
