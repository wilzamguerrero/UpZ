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
 * Forwards a single file chunk to Notion's file upload endpoint.
 *
 * The browser sends the chunk as the raw request body (Content-Type: application/octet-stream)
 * with metadata in custom headers. We re-wrap it as multipart/form-data and forward to Notion.
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
    // Use the request body directly as the multipart "file" part.
    // Cloudflare Workers supports passing a ReadableStream as fetch body,
    // and Notion accepts multipart/form-data with a streaming body.
    // We construct a minimal multipart envelope around the raw stream.
    const fileStream = context.request.body;
    if (!fileStream) {
      return json({ error: "No se proporcionó el chunk de archivo." }, 400);
    }

    const boundary = "----Nu" + crypto.randomUUID().replace(/-/g, "");
    const enc = new TextEncoder();

    // Build the multipart body as a stream. part_number goes FIRST so Notion's
    // parser finds it in the first few KB of the body.
    const partNumberHeader = partNumber
      ? enc.encode(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="part_number"\r\n\r\n` +
          `${partNumber}\r\n`
        )
      : null;
    const fileHeader = enc.encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${uploadName.replace(/"/g, "")}"\r\n` +
      `Content-Type: ${fileContentType}\r\n\r\n`
    );
    const closing = enc.encode(`\r\n--${boundary}--\r\n`);

    const bodyStream = new ReadableStream({
      start(controller) {
        if (partNumberHeader) controller.enqueue(partNumberHeader);
        controller.enqueue(fileHeader);
        const reader = fileStream.getReader();
        const pump = (): any => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.enqueue(closing);
              controller.close();
              return;
            }
            controller.enqueue(value);
            return pump();
          });
        };
        return pump();
      },
    });

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
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
