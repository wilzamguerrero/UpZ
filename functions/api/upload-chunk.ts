import { json, type Env } from "../_shared/notion";

/**
 * POST /api/upload-chunk
 * Uploads a single chunk to R2 using multipart upload.
 *
 * The browser sends the chunk as the raw request body (Content-Type: application/octet-stream)
 * with metadata in custom headers.
 *
 * Headers:
 *   - X-R2-Key: the R2 object key (from upload-init)
 *   - X-Upload-Id: the R2 multipart upload ID
 *   - X-Part-Number: 1-indexed part number
 *   - X-Content-Type: the standardized MIME type
 *
 * Flow:
 *   1. First call (no X-Upload-Id): initiates a multipart upload, returns uploadId
 *   2. Subsequent calls: uploads the part, returns the ETag
 *   3. Last call (X-Complete: true): completes the multipart upload
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const bucket = context.env.FILES_BUCKET;
  if (!bucket) {
    return json({ error: "R2 no está configurado." }, 400);
  }

  const r2Key = context.request.headers.get("x-r2-key");
  const uploadId = context.request.headers.get("x-upload-id");
  const partNumber = context.request.headers.get("x-part-number");
  const isComplete = context.request.headers.get("x-complete") === "true";

  if (!r2Key) {
    return json({ error: "Se requiere x-r2-key." }, 400);
  }

  try {
    // Step 1: Initiate multipart upload
    if (!uploadId) {
      const mpUpload = await bucket.createMultipartUpload(r2Key, {
        httpMetadata: {
          contentType: context.request.headers.get("x-content-type") || "application/octet-stream",
        },
      });
      return json({
        success: true,
        action: "init",
        uploadId: mpUpload.uploadId,
        r2Key,
      });
    }

    // Step 2: Upload a part
    if (!isComplete && partNumber) {
      const mpUpload = bucket.resumeMultipartUpload(r2Key, uploadId);
      const body = context.request.body;
      if (!body) {
        return json({ error: "No se proporcionó el chunk." }, 400);
      }

      // Collect the stream into an ArrayBuffer for R2 part upload
      const chunks: Uint8Array[] = [];
      const reader = body.getReader();
      let totalSize = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalSize += value.length;
      }

      // Combine chunks into a single ArrayBuffer
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const part = await mpUpload.uploadPart(Number(partNumber), combined);

      return json({
        success: true,
        action: "part",
        partNumber: Number(partNumber),
        etag: part.etag,
      });
    }

    // Step 3: Complete multipart upload
    if (isComplete) {
      // We need to collect all parts. The frontend sends them in the body.
      const body = await context.request.json() as { parts: { partNumber: number; etag: string }[] };
      const mpUpload = bucket.resumeMultipartUpload(r2Key, uploadId);
      const parts = body.parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag,
      }));
      await mpUpload.complete(parts);

      return json({
        success: true,
        action: "complete",
        r2Key,
      });
    }

    return json({ error: "Acción no reconocida." }, 400);
  } catch (err: any) {
    return json(
      { error: `Error en R2: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
