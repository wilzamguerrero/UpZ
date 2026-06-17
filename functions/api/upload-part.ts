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

  // Forward the chunk to Notion. Retry transient Notion errors (429/5xx) here on the edge,
  // so a single hiccup doesn't bubble up to the browser as a hard failure.
  const TRANSIENT = new Set([429, 500, 502, 503, 504, 529]);
  const MAX_RETRIES = 4;

  try {
    // Re-wrap the chunk as a Blob with the correct content type.
    // Stream straight from the uploaded File (no full arrayBuffer copy) to keep the
    // Function's memory/CPU footprint low — important on the free plan.
    const chunkBlob = file.slice(0, file.size, contentType || "application/octet-stream");

    let lastStatus = 0;
    let lastBody = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

      if (sendRes.ok) {
        const result = (await sendRes.json()) as any;
        return json({
          success: true,
          status: result.status,
          partNumber: partNumber ? parseInt(partNumber, 10) : 1,
        });
      }

      lastStatus = sendRes.status;
      lastBody = await sendRes.text();

      // Only retry transient errors; client errors (4xx except 429) fail fast.
      if (!TRANSIENT.has(sendRes.status) || attempt === MAX_RETRIES) {
        break;
      }

      // Honor Retry-After when present, else exponential backoff (0.5s, 1s, 2s).
      const retryAfter = parseInt(sendRes.headers.get("Retry-After") || "", 10);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    return json(
      { error: `Notion rechazó el chunk: ${lastStatus} - ${lastBody}` },
      // Surface a 503 so the browser knows this is retryable.
      TRANSIENT.has(lastStatus) ? 503 : 502
    );
  } catch (err: any) {
    return json(
      { error: `Error al enviar chunk: ${err.message || "Error desconocido"}` },
      503
    );
  }
};
