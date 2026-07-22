import { json, notionFetch, appendChildren, updateBlock, cleanNotionId, type Env } from "../_shared/notion";

const DEFAULT_APPEARANCE = {
  themeId: "brutal",
  accentColor: "#f5f011",
  homeTitle: "ENVI",
  homeTitleSize: 56,
  homeMessage: "ENVI agiliza la entrega de archivos por proyecto. Desarrollado por wilzamguerrero.",
  homeIcon: "Sparkles",
  homeBgColor: "#050505",
};

// Marker used to recognize the appearance JSON block on the parent page.
const APPEARANCE_MARKER = "__envi_appearance__";

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

function normalizeAppearance(body: any) {
  const allowedThemes = ["brutal"];
  return {
    themeId: allowedThemes.includes(body?.themeId) ? body.themeId : DEFAULT_APPEARANCE.themeId,
    accentColor: normalizeColor(body?.accentColor, DEFAULT_APPEARANCE.accentColor),
    homeTitle: normalizeText(body?.homeTitle, DEFAULT_APPEARANCE.homeTitle, 140),
    homeTitleSize: normalizeTitleSize(body?.homeTitleSize, DEFAULT_APPEARANCE.homeTitleSize),
    homeMessage: normalizeText(body?.homeMessage, DEFAULT_APPEARANCE.homeMessage, 400),
    homeIcon: normalizeText(body?.homeIcon, DEFAULT_APPEARANCE.homeIcon, 64),
    homeBgColor: normalizeColor(body?.homeBgColor, DEFAULT_APPEARANCE.homeBgColor),
  };
}

async function getConfig(env: Env): Promise<{ notionSecret: string; parentPageId: string }> {
  let notionSecret = env.NOTION_SECRET || "";
  let parentPageId = env.NOTION_ID_PAGE || "";
  if (env.SUBMISSIONS_KV) {
    try {
      const override = await env.SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
        if (cfg.parentPageId) parentPageId = cfg.parentPageId;
      }
    } catch {
      // Ignore
    }
  }
  return { notionSecret, parentPageId: cleanNotionId(parentPageId) };
}

/** Finds the appearance JSON code block among the parent page's direct children. */
async function findAppearanceBlock(parentPageId: string, token: string): Promise<{ id: string; value: any } | null> {
  let cursor: string | undefined;
  do {
    const q = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : `?page_size=100`;
    const data = await notionFetch("GET", `/blocks/${parentPageId}/children${q}`, token);
    for (const b of data.results || []) {
      if (b.type === "code" && b.code?.language === "json") {
        try {
          const parsed = JSON.parse((b.code.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
          if (parsed && parsed[APPEARANCE_MARKER]) {
            return { id: b.id, value: parsed };
          }
        } catch {
          // Ignore malformed JSON.
        }
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return null;
}

/** GET /api/appearance – reads appearance from Notion (source of truth), else KV. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { notionSecret, parentPageId } = await getConfig(context.env);

  if (notionSecret && parentPageId) {
    try {
      const found = await findAppearanceBlock(parentPageId, notionSecret);
      if (found) {
        const { [APPEARANCE_MARKER]: _omit, ...appearance } = found.value;
        return json({ success: true, appearance });
      }
    } catch {
      // Fall through to KV.
    }
  }

  if (context.env.SUBMISSIONS_KV) {
    try {
      const raw = await context.env.SUBMISSIONS_KV.get("appearance");
      if (raw) return json({ success: true, appearance: JSON.parse(raw) });
    } catch {
      // Fall through
    }
  }
  return json({ success: true, appearance: null });
};

/** POST /api/appearance – saves appearance to Notion (source of truth) + KV cache. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const appearance = normalizeAppearance(body);
  const { notionSecret, parentPageId } = await getConfig(context.env);

  if (notionSecret && parentPageId) {
    try {
      const payload = { [APPEARANCE_MARKER]: true, ...appearance };
      const jsonString = JSON.stringify(payload, null, 2);
      const found = await findAppearanceBlock(parentPageId, notionSecret);
      if (found) {
        await updateBlock(
          found.id,
          { code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" } },
          notionSecret
        );
      } else {
        await appendChildren(
          parentPageId,
          [{
            object: "block",
            type: "code",
            code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
          }],
          notionSecret
        );
      }
    } catch {
      // Non-critical: still cache in KV below.
    }
  }

  if (context.env.SUBMISSIONS_KV) {
    try {
      await context.env.SUBMISSIONS_KV.put("appearance", JSON.stringify(appearance));
    } catch {
      // Non-critical
    }
  }

  return json({ success: true, message: "Apariencia guardada correctamente." });
};
