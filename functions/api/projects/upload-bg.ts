import { json, notionFetch, uploadFileToNotion, listChildren, appendChildren, deleteBlock, type Env } from "../../_shared/notion";

const BG_BLOCK_CAPTION = "__UPZBG__";

/**
 * POST /api/projects/upload-bg?projectId=<id>
 * Persists a background image so it can be reused reliably.
 *
 * Preferred: store in R2 (FILES_BUCKET) → permanent public URL.
 *
 * Fallback (Notion): upload via File Upload API, append the result as an
 * image block inside the project's toggle, and return a stable proxy URL
 * (/api/projects/bg-image?blockId=…) that always fetches the current
 * Notion-signed URL on demand — no more expiring direct URLs.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { FILES_BUCKET } = context.env;

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return json({ error: "No se pudo leer el formulario de carga." }, 400);
  }

  const file = formData.get("bgImage") as unknown as File | null;
  if (!file || typeof file === "string") {
    return json({ error: "No se seleccionó o cargó ninguna imagen." }, 400);
  }

  // ── Preferred path: store in R2 for a permanent URL ──
  if (FILES_BUCKET) {
    try {
      const dotIndex = file.name.lastIndexOf(".");
      const ext = dotIndex !== -1 ? file.name.slice(dotIndex) : "";
      const safeBase = file.name
        .slice(0, dotIndex === -1 ? undefined : dotIndex)
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 40);
      const key = `bg-${Date.now()}-${safeBase}${ext}`;

      await FILES_BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });

      const url = `/uploads/${encodeURIComponent(key)}`;
      return json({ success: true, url, key });
    } catch (err: any) {
      return json(
        { error: `Error al guardar la imagen en el almacenamiento: ${err.message || "Error desconocido"}` },
        500
      );
    }
  }

  // ── Fallback: upload to Notion and store as an image block ──
  let notionSecret = context.env.NOTION_SECRET || "";
  if (context.env.SUBMISSIONS_KV) {
    try {
      const override = await context.env.SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
      }
    } catch { /* ignore */ }
  }

  if (!notionSecret) {
    return json({ error: "No hay almacenamiento configurado (ni R2 ni Notion)." }, 400);
  }

  try {
    // Step 1: upload the binary to Notion's File Upload API
    const { id: uploadId } = await uploadFileToNotion(file, notionSecret);

    // Step 2: if we have a projectId, store the image as a block inside the
    //         project so it gets a stable block ID we can proxy through.
    const projectId = new URL(context.request.url).searchParams.get("projectId");
    if (projectId) {
      // Remove any previous bg image block for this project
      try {
        const children = await listChildren(projectId, notionSecret);
        const old = (children.results || []).find(
          (b: any) =>
            b.type === "image" &&
            (b.image?.caption || []).map((t: any) => t.plain_text).join("") === BG_BLOCK_CAPTION
        );
        if (old) await deleteBlock(old.id, notionSecret);
      } catch { /* ignore cleanup errors */ }

      // Append a new image block that references the file upload
      try {
        const appendResp: any = await appendChildren(
          projectId,
          [
            {
              object: "block",
              type: "image",
              image: {
                type: "file_upload",
                file_upload: { id: uploadId },
                caption: [{ type: "text", text: { content: BG_BLOCK_CAPTION } }],
              },
            } as any,
          ],
          notionSecret
        );
        const blockId: string | undefined = appendResp.results?.[0]?.id;
        if (blockId) {
          const proxyUrl = `/api/projects/bg-image?blockId=${encodeURIComponent(blockId)}`;
          return json({ success: true, url: proxyUrl, blockId });
        }
      } catch { /* fall through to direct URL */ }
    }

    // Last resort: return the direct (potentially-expiring) Notion URL
    const fileUrl = `https://file.notion.so/f/f/${uploadId}/${encodeURIComponent(file.name)}`;
    return json({ success: true, url: fileUrl, uploadId });
  } catch (err: any) {
    return json({ error: `Error al subir imagen a Notion: ${err.message || "Error desconocido"}` }, 500);
  }
};
