import { json, type Env } from "../_shared/notion";

const DEFAULT_APPEARANCE = {
  themeId: "brutal",
  accentColor: "#f5f011",
  homeTitle: "ENVI",
  homeTitleSize: 56,
  homeMessage: "ENVI agiliza la entrega de archivos por proyecto. Desarrollado por wilzamguerrero.",
  homeIcon: "Sparkles",
  homeBgColor: "#050505",
};

const normalizeColor = (value: unknown, fallback: string) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : fallback;
};

const normalizeText = (value: unknown, fallback: string, maxLength: number) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return (raw || fallback).slice(0, maxLength);
};

const normalizeTitleSize = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(96, Math.max(36, Math.round(parsed)));
};

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

/** POST /api/appearance – saves global theme + homepage settings to KV */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }
  // Only accept known theme IDs
  const allowedThemes = ["brutal"];
  const themeId = allowedThemes.includes(body?.themeId) ? body.themeId : DEFAULT_APPEARANCE.themeId;
  const accentColor = normalizeColor(body?.accentColor, DEFAULT_APPEARANCE.accentColor);
  const homeTitle = normalizeText(body?.homeTitle, DEFAULT_APPEARANCE.homeTitle, 140);
  const homeTitleSize = normalizeTitleSize(body?.homeTitleSize, DEFAULT_APPEARANCE.homeTitleSize);
  const homeMessage = normalizeText(body?.homeMessage, DEFAULT_APPEARANCE.homeMessage, 400);
  const homeIcon = normalizeText(body?.homeIcon, DEFAULT_APPEARANCE.homeIcon, 64);
  const homeBgColor = normalizeColor(body?.homeBgColor, DEFAULT_APPEARANCE.homeBgColor);

  const appearance = {
    themeId,
    accentColor,
    homeTitle,
    homeTitleSize,
    homeMessage,
    homeIcon,
    homeBgColor,
  };

  if (SUBMISSIONS_KV) {
    await SUBMISSIONS_KV.put("appearance", JSON.stringify(appearance));
    return json({ success: true, message: "Apariencia guardada correctamente." });
  }

  return json({ error: "Sin almacenamiento KV disponible." }, 500);
};
