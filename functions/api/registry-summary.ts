import { json, notionFetch, type Env } from "../_shared/notion";

const REGISTRY_MARKER = "__envi_registry__";
const GRADES_MARKER = "__envi_grades__";

async function getConfig(env: Env): Promise<{ notionSecret: string }> {
  let notionSecret = env.NOTION_SECRET || "";
  if (env.SUBMISSIONS_KV) {
    try {
      const override = await env.SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
      }
    } catch {
      // Ignore
    }
  }
  return { notionSecret };
}

const parseJsonBlock = (block: any): any => {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
};

async function listAllChildren(blockId: string, token: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor
      ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100`
      : `?page_size=100`;
    const data = await notionFetch("GET", `/blocks/${blockId}/children${q}`, token);
    for (const b of data.results || []) out.push(b);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

/**
 * GET /api/registry-summary?parentId=<id>
 * Consolidated view for a registration-mode parent: the roster (people) plus the
 * note each person got in each child activity, joined by document. The registry
 * and the per-child grades blocks all live as direct children of the parent, so
 * this reads the parent once and builds the matrix.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const parentId = (url.searchParams.get("parentId") || "").trim();
  if (!parentId) return json({ error: "Falta el proyecto padre." }, 400);

  const { notionSecret } = await getConfig(context.env);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    const children = await listAllChildren(parentId, notionSecret);

    // Roster (people) from the registry block.
    let people: any[] = [];
    let parentName = "Registro";
    for (const b of children) {
      if (b.type !== "code" || b.code?.language !== "json") continue;
      const parsed = parseJsonBlock(b);
      if (parsed && parsed[REGISTRY_MARKER]) {
        const reg = parsed[REGISTRY_MARKER];
        people = Array.isArray(reg.people) ? reg.people : [];
        parentName = reg.parentName || parentName;
        break;
      }
    }

    // Map email → document to rescue rows that only carry the email.
    const emailToDoc: Record<string, string> = {};
    for (const p of people) {
      if (p?.email) emailToDoc[String(p.email).toLowerCase()] = String(p.document || "").trim();
    }

    // Notes matrix: { [document]: { [projectId]: { note, status } } } from the
    // per-child grades blocks (each is a direct child of the parent).
    const activities: { projectId: string; projectName: string }[] = [];
    const notes: Record<string, Record<string, { note: string; status: string; pending: boolean }>> = {};
    for (const b of children) {
      if (b.type !== "code" || b.code?.language !== "json") continue;
      const g = parseJsonBlock(b)?.[GRADES_MARKER];
      if (!g || !g.projectId) continue;
      activities.push({ projectId: g.projectId, projectName: g.projectName || "Actividad" });
      for (const row of Array.isArray(g.rows) ? g.rows : []) {
        const doc = String(row.document || "").trim() || emailToDoc[String(row.email || "").toLowerCase()] || "";
        if (!doc) continue;
        (notes[doc] = notes[doc] || {})[g.projectId] = { note: String(row.note || ""), status: String(row.status || ""), pending: !!row.pending };
      }
    }

    return json({ success: true, parentName, people, activities, notes });
  } catch (err: any) {
    return json({ error: `No se pudo leer el resumen: ${err.message || "error desconocido"}.` }, 500);
  }
};
