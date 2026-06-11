import { json, uploadFileToNotion, type Env } from "../../../_shared/notion";

/**
 * POST /api/projects/upload-bg
 * Uploads a background image directly to Notion and returns its hosted URL.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
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
    return json({ error: "Notion no está configurado." }, 400);
  }

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

  try {
    const uploadId = await uploadFileToNotion(file, notionSecret);
    // Notion's hosted file URL pattern for file_upload objects
    const fileUrl = `https://file.notion.so/f/f/${uploadId}/${encodeURIComponent(file.name)}`;
    return json({ success: true, url: fileUrl, uploadId });
  } catch (err: any) {
    return json({ error: `Error al subir imagen a Notion: ${err.message || "Error desconocido"}` }, 500);
  }
};
