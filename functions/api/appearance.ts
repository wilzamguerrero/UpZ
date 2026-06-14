import { json, type Env } from "../_shared/notion";

/** GET /api/appearance – returns saved appearance config from KV */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;
  if (SUBMISSIONS_KV) {
    try {
      const raw = await SUBMISSIONS_KV.get("appearance");
      if (raw) {
        return json({ success: true, appearance: JSON.parse(raw) });
      }
    } catch {
      // Fall through
    }
  }
  return json({ success: true, appearance: null });
};

/** POST /api/appearance – saves themeId + accentColor to KV */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { themeId, accentColor } = body;
  if (!themeId || !accentColor) {
    return json({ error: "Faltan datos de apariencia (themeId, accentColor)." }, 400);
  }

  // Only accept known theme IDs
  const allowedThemes = ["brutal"];
  if (!allowedThemes.includes(themeId)) {
    return json({ error: "ID de tema no reconocido." }, 400);
  }

  if (SUBMISSIONS_KV) {
    await SUBMISSIONS_KV.put("appearance", JSON.stringify({ themeId, accentColor }));
    return json({ success: true, message: "Apariencia guardada correctamente." });
  }

  return json({ error: "Sin almacenamiento KV disponible." }, 500);
};
