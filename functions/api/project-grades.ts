import { json, appendChildren, updateBlock, deleteBlock, notionFetch, cleanNotionId, type Env } from "../_shared/notion";

/** Marker that identifies a grades JSON code block (one per project, all placed
 *  at the parent page level so several projects can be read together). */
const GRADES_MARKER = "__envi_grades__";

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

const parseJsonBlock = (block: any): any => {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
};

/** Notion caps each rich_text item at 2000 chars, so split long JSON into chunks. */
function toRichTextChunks(content: string) {
  const chunks: any[] = [];
  for (let i = 0; i < content.length; i += 2000) {
    chunks.push({ type: "text", text: { content: content.slice(i, i + 2000) } });
  }
  return chunks.length ? chunks : [{ type: "text", text: { content: "" } }];
}

/** Lists ALL children of a block, following pagination. */
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

/** Reads the parent container id of a block (the project's parent page/toggle). */
async function getParentId(blockId: string, token: string): Promise<string> {
  try {
    const block = await notionFetch("GET", `/blocks/${blockId}`, token);
    const p = block?.parent;
    if (!p) return "";
    if (p.type === "page_id") return p.page_id || "";
    if (p.type === "block_id") return p.block_id || "";
    if (p.type === "database_id") return p.database_id || "";
    return "";
  } catch {
    return "";
  }
}

/** Finds this project's grades code block among a container's children (matched by projectId). */
async function findGradesBlock(containerId: string, token: string, projectId: string): Promise<any | null> {
  const children = await listAllChildren(containerId, token);
  return (
    children.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonBlock(b);
      return parsed && parsed[GRADES_MARKER] && parsed[GRADES_MARKER].projectId === projectId;
    }) || null
  );
}

/**
 * POST /api/project-grades
 * Body: { projectId, projectName, rows: [{ order, name, email, note, status }] }
 * Stores a compact grades summary as a JSON code block placed in the project's
 * PARENT container (a sibling of the project, not inside it and not at the root),
 * with a caption "<projectName> data". Upserts the block for this project.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: { projectId?: string; projectName?: string; parentId?: string; rows?: unknown[] };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const projectId = String(body.projectId || "").trim();
  const projectName = String(body.projectName || "Proyecto").trim();
  const parentIdHint = String(body.parentId || "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!projectId) return json({ error: "Falta el identificador del proyecto." }, 400);

  const { notionSecret, parentPageId } = await getConfig(context.env);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  const payload = {
    [GRADES_MARKER]: {
      projectId,
      projectName,
      updatedAt: new Date().toISOString(),
      rows,
    },
  };
  const content = JSON.stringify(payload, null, 2);
  const codeBody = {
    code: {
      rich_text: toRichTextChunks(content),
      language: "json",
      caption: [{ type: "text", text: { content: `${projectName} data` } }],
    },
  };

  try {
    // Save in the project's parent container: prefer the logical parent from the
    // app tree, then the Notion parent, then the project itself as a last resort.
    const containerId = parentIdHint || (await getParentId(projectId, notionSecret)) || projectId;
    const existing = await findGradesBlock(containerId, notionSecret, projectId);
    let keptId = "";
    if (existing) {
      await updateBlock(existing.id, codeBody, notionSecret);
      keptId = existing.id;
    } else {
      const appendRes = await appendChildren(containerId, [{ object: "block", type: "code", ...codeBody }], notionSecret);
      keptId = appendRes?.results?.[0]?.id || "";
    }

    // Clean up stale blocks left by earlier versions (root page / inside the project).
    const staleContainers = [parentPageId, projectId].filter((c) => c && c !== containerId);
    for (const c of staleContainers) {
      try {
        const stale = await findGradesBlock(c, notionSecret, projectId);
        if (stale && stale.id !== keptId) await deleteBlock(stale.id, notionSecret);
      } catch {
        // Ignore cleanup failures.
      }
    }

    return json({ success: true, blockId: keptId, updated: !!existing });
  } catch (err: any) {
    return json({ error: `No se pudo guardar la tabla: ${err.message || "error desconocido"}.` }, 500);
  }
};

/**
 * GET /api/project-grades?projectId=<id>
 * Reads back this project's stored grades summary (for future features).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const projectId = url.searchParams.get("projectId") || "";
  if (!projectId) return json({ error: "Falta el identificador del proyecto." }, 400);

  const { notionSecret } = await getConfig(context.env);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    const containerId = (await getParentId(projectId, notionSecret)) || projectId;
    const existing = await findGradesBlock(containerId, notionSecret, projectId);
    const parsed = existing ? parseJsonBlock(existing)?.[GRADES_MARKER] : null;
    return json({ success: true, data: parsed || null, blockId: existing?.id || null });
  } catch (err: any) {
    return json({ error: `No se pudo leer la tabla: ${err.message || "error desconocido"}.` }, 500);
  }
};
