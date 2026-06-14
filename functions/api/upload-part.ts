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
 * POST /api/upload-part
 * Sends a single file chunk to Notion's file upload endpoint.
 * For single-part uploads, this is the only call needed after init.
 * For multi-part uploads, call this once per chunk.
 *
 * FormData fields:
 *   - file: the binary chunk
 *   - upload_id: Notion file upload ID
 *   - part_number: (multi-part only) 1-indexed part number
 *   - content_type: the standardized MIME type to use
 *   - upload_name: the filename to use in the upload
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
  const uploadId = formData.get("upload_id") as string | null;
  const partNumber = formData.get("part_number") as string | null;
  const contentType = formData.get("content_type") as string | null;
  const uploadName = formData.get("upload_name") as string | null;

  if (!file) {
    return json({ error: "No se proporcionó el chunk de archivo." }, 400);
  }
  if (!uploadId) {
    return json({ error: "Se requiere upload_id." }, 400);
  }

  const sendUrl = `${NOTION_BASE}/file_uploads/${uploadId}/send`;

  try {
    // Re-wrap the chunk as a Blob with the correct content type
    const chunkBuffer = await file.arrayBuffer();
    const chunkBlob = new Blob([chunkBuffer], { type: contentType || "application/octet-stream" });

    const notionForm = new FormData();
    if (partNumber) {
      notionForm.append("part_number", partNumber);
    }
    notionForm.append("file", chunkBlob, uploadName || "file");

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
      },
      body: notionForm,
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Notion rechazó el chunk: ${sendRes.status} - ${errText}`);
    }

    const result = (await sendRes.json()) as any;

    return json({
      success: true,
      status: result.status,
      partNumber: partNumber ? parseInt(partNumber, 10) : 1,
    });
  } catch (err: any) {
    return json(
      { error: `Error al enviar chunk: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
