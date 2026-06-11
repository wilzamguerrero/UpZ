import { json, type Env } from "../../../_shared/notion";

/**
 * POST /api/projects/upload-bg
 * Uploads a background image.
 * - If FILES_BUCKET (R2) binding is configured: stores in R2 and returns URL served via /uploads/:filename.
 * - Otherwise: returns an error with setup instructions.
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

  if (!FILES_BUCKET) {
    return json(
      {
        error:
          "El almacenamiento de archivos (R2) no está configurado. " +
          "En el panel de Cloudflare Pages, agrega un binding de tipo R2 con el nombre FILES_BUCKET.",
      },
      503
    );
  }

  const ext = file.name.split(".").pop() || "bin";
  const uniqueName = `bg-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  await FILES_BUCKET.put(uniqueName, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const url = new URL(context.request.url);
  const fileUrl = `${url.origin}/uploads/${uniqueName}`;

  return json({ success: true, url: fileUrl });
};
