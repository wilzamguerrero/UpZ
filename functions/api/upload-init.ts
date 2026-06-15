import { json, type Env, NOTION_VERSION, NOTION_BASE, resolveUploadMeta } from "../_shared/notion";

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
 * POST /api/upload-init
 * Creates a Notion file upload using mode=external_url.
 * The file is first uploaded to R2, then Notion downloads it from the R2 public URL.
 *
 * Body: { filename: string, mimeType: string, fileSize: number }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  const bucket = context.env.FILES_BUCKET;
  if (!bucket) {
    return json({ error: "R2 no está configurado." }, 400);
  }

  let body: { filename?: string; mimeType?: string; fileSize?: number };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const { filename, mimeType = "", fileSize = 0 } = body || {};
  if (!filename) {
    return json({ error: "Se requiere el nombre del archivo." }, 400);
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (Notion paid workspace limit)
  if (fileSize > MAX_FILE_SIZE) {
    return json({ error: `El archivo excede el límite de 5 GB de Notion.` }, 413);
  }

  const { uploadName, contentType } = resolveUploadMeta(filename, mimeType);

  // Generate a unique R2 key for this upload
  const r2Key = `uploads/${crypto.randomUUID()}/${uploadName}`;

  return json({
    success: true,
    r2Key,
    uploadName,
    contentType,
    fileSize,
  });
};
