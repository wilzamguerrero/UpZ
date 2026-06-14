import { json, uploadFileToNotion, uploadLargeFileToNotion, type Env } from "../_shared/notion";

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

// 95 MiB — safely under Cloudflare's 100 MB body limit per request
const MAX_FILE_SIZE = 95 * 1024 * 1024;

/**
 * POST /api/upload-file
 * Accepts multipart/form-data with a single "file" field.
 * Uploads it to Notion and returns the upload ID + metadata.
 * Called once per file from the browser before submitting metadata.
 *
 * Files ≤ 20MB use single-part upload; files > 20MB use multi-part chunked upload.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);

  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return json({ error: "No se pudo leer el formulario." }, 400);
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return json({ error: "No se proporcionó ningún archivo." }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return json(
      {
        error: `"${file.name}" excede el límite de 95 MB por archivo. Comprime el archivo antes de enviarlo.`,
      },
      413
    );
  }

  // 20 MiB threshold for multi-part uploads
  const MULTI_PART_THRESHOLD = 20 * 1024 * 1024;

  try {
    let result: { id: string; finalName: string; originalName: string; extModified: boolean };

    if (file.size > MULTI_PART_THRESHOLD) {
      // Large file: use multi-part chunked upload
      result = await uploadLargeFileToNotion(file, notionSecret);
    } else {
      // Small file: use single-part upload
      result = await uploadFileToNotion(file, notionSecret);
    }

    return json({
      success: true,
      id: result.id,
      finalName: result.finalName,
      extModified: result.extModified,
      mimeType: file.type,
      size: file.size,
    });
  } catch (err: any) {
    return json(
      { error: `Error al subir "${file.name}" a Notion: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
