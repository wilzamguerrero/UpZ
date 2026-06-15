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
 * Streams a single file chunk directly to Notion's file upload endpoint.
 *
 * The browser sends the chunk as the raw request body (Content-Type: application/octet-stream)
 * with metadata in custom headers. We wrap it in a multipart/form-data stream and forward
 * to Notion. This avoids buffering the chunk in memory (Cloudflare Workers has a 128 MB
 * memory limit) and keeps CPU usage minimal.
 *
 * Headers:
 *   - X-Upload-Id: Notion file upload ID
 *   - X-Part-Number: (multi-part only) 1-indexed part number
 *   - X-Content-Type: the standardized MIME type to use
 *   - X-Upload-Name: the filename to use in the upload
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  const uploadId = context.request.headers.get("x-upload-id");
  const partNumber = context.request.headers.get("x-part-number");
  const fileContentType = context.request.headers.get("x-content-type") || "application/octet-stream";
  const uploadName = context.request.headers.get("x-upload-name") || "file";

  if (!uploadId) {
    return json({ error: "Se requiere upload_id." }, 400);
  }

  const sendUrl = `${NOTION_BASE}/file_uploads/${uploadId}/send`;

  try {
    const fileStream = context.request.body;
    if (!fileStream) {
      return json({ error: "No se proporcionó el chunk de archivo." }, 400);
    }

    // Build a new multipart body that wraps the incoming stream as the "file" part.
    const newBoundary = "----NotionUpload" + crypto.randomUUID().replace(/-/g, "");
    const preamble = new TextEncoder().encode(
      `--${newBoundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${uploadName.replace(/"/g, "")}"\r\n` +
      `Content-Type: ${fileContentType}\r\n\r\n`
    );
    const partNumberPart = partNumber
      ? new TextEncoder().encode(
          `--${newBoundary}\r\n` +
          `Content-Disposition: form-data; name="part_number"\r\n\r\n` +
          `${partNumber}\r\n`
        )
      : null;
    const closing = new TextEncoder().encode(`\r\n--${newBoundary}--\r\n`);

    // Compose the body as a ReadableStream — no buffering of the 8 MB chunk.
    const bodyStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(preamble);
        if (partNumberPart) {
          controller.enqueue(partNumberPart);
        }
        const reader = fileStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
        }
        controller.enqueue(closing);
        controller.close();
      },
    });

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": `multipart/form-data; boundary=${newBoundary}`,
      },
      body: bodyStream,
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
