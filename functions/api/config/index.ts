import { json, cleanNotionId, type Env } from "../../_shared/notion";

/** GET /api/config – returns masked credential state from env vars + optional KV override */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { NOTION_SECRET, NOTION_ID_PAGE, SUBMISSIONS_KV } = context.env;

  let notionSecret = NOTION_SECRET || "";
  let parentPageId = NOTION_ID_PAGE || "";

  // Allow KV overrides if the binding is available
  if (SUBMISSIONS_KV) {
    try {
      const override = await SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
        if (cfg.parentPageId) parentPageId = cfg.parentPageId;
      }
    } catch {
      // Ignore KV errors, fall back to env vars
    }
  }

  return json({
    success: true,
    isConfigured: !!(notionSecret && parentPageId),
    hasSecret: !!notionSecret,
    hasParentId: !!parentPageId,
    parentPageId: cleanNotionId(parentPageId),
    maskedSecret: notionSecret ? `••••••••${notionSecret.slice(-4)}` : "",
  });
};

/** POST /api/config – saves credentials to KV override (if binding available) */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  let body: { notionSecret?: string; parentPageId?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { notionSecret, parentPageId } = body;
  if (!notionSecret || !parentPageId) {
    return json({ error: "Faltan datos de configuración" }, 400);
  }

  if (SUBMISSIONS_KV) {
    const cleanedId = cleanNotionId(parentPageId);
    await SUBMISSIONS_KV.put("config", JSON.stringify({ notionSecret, parentPageId: cleanedId }));
    return json({ success: true, message: "Configuración guardada correctamente" });
  }

  // No KV binding – credentials must be set in Cloudflare dashboard as env vars
  return json({
    success: false,
    message:
      "Para cambiar credenciales en producción, actualízalas en el panel de Cloudflare Pages > Variables and secrets.",
  });
};
