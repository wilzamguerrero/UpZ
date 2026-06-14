import { json, uploadFileToNotion, type Env } from "../../_shared/notion";

/**
 * POST /api/projects/upload-bg
 * Persists a background image so it can be reused reliably.
 *
 * Preferred: store in R2 (FILES_BUCKET) and serve via /uploads/:filename,
 * which returns a permanent, publicly cacheable URL.
 *
 * Fallback: if no R2 bucket is configured, upload to Notion (note: Notion file
 * URLs are signed/temporary and may expire).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { FILES_BUCKET } = context.env;

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return json({ error: "No se pudo leer el formulario de carga." }, 400);
  }

  const file = formData.get("bgImage") as File | null;
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

  // ── Fallback: upload to Notion (URL may be temporary) ──
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
    const { id: uploadId, finalName } = await uploadFileToNotion(file, notionSecret);
    const fileUrl = `https://file.notion.so/f/f/${uploadId}/${encodeURIComponent(finalName)}`;
    return json({ success: true, url: fileUrl, uploadId });
  } catch (err: any) {
    return json({ error: `Error al subir imagen a Notion: ${err.message || "Error desconocido"}` }, 500);
  }
};
