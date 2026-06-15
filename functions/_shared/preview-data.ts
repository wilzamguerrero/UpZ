import { listChildren, type Env } from "./notion";
import { normalizeAppearance, type PreviewAppearance, type PreviewProject, type PreviewProjectMeta } from "./preview";

function cleanNotionId(input: string) {
  if (!input) return "";

  const trimmed = input.trim();
  const uuidWithDashesRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  const matchDashes = trimmed.match(uuidWithDashesRegex);
  if (matchDashes) {
    return matchDashes[0];
  }

  const uuidPlainRegex = /[a-f0-9]{32}/i;
  const matchPlain = trimmed.match(uuidPlainRegex);
  if (matchPlain) {
    return matchPlain[0];
  }

  return trimmed;
}

export async function getPreviewCredentials(env: Env) {
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
      // Ignore config cache failures.
    }
  }

  return {
    notionSecret,
    parentPageId: cleanNotionId(parentPageId),
  };
}

export async function getPreviewAppearance(env: Env): Promise<PreviewAppearance> {
  if (env.SUBMISSIONS_KV) {
    try {
      const raw = await env.SUBMISSIONS_KV.get("appearance");
      if (raw) {
        return normalizeAppearance(JSON.parse(raw));
      }
    } catch {
      // Ignore appearance cache failures.
    }
  }

  return normalizeAppearance(null);
}

export async function getPreviewMetaMap(env: Env): Promise<Record<string, PreviewProjectMeta>> {
  if (env.SUBMISSIONS_KV) {
    try {
      const raw = await env.SUBMISSIONS_KV.get("project-meta");
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Ignore metadata cache failures.
    }
  }

  return {};
}

export async function listPreviewProjects(env: Env): Promise<PreviewProject[]> {
  const { notionSecret, parentPageId } = await getPreviewCredentials(env);
  if (!notionSecret || !parentPageId) {
    return [];
  }

  const data = await listChildren(parentPageId, notionSecret);

  return (data.results || [])
    .filter((block: any) => block.type === "toggle" || block.type === "child_page")
    .map((block: any) => {
      if (block.type === "toggle") {
        const name = block.toggle.rich_text.map((rt: any) => rt.plain_text).join("").trim();
        return {
          id: block.id,
          name: name || "Proyecto sin titulo",
        };
      }

      return {
        id: block.id,
        name: block.child_page.title || "Proyecto sin titulo",
      };
    });
}