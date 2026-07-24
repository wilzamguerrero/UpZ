import { json, deleteBlock, updateBlock, notionFetch, cleanNotionId, type Env } from "../../_shared/notion";

const parseJsonBlock = (block: any): any => {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
};

/** Reads the parent container id of a block. */
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

/** Lists ALL children of a block (paginated). */
async function listAllChildren(blockId: string, token: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : `?page_size=100`;
    const data = await notionFetch("GET", `/blocks/${blockId}/children${q}`, token);
    for (const b of data.results || []) out.push(b);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** Removes this project's "<name> data" grades block from its parent (cleanup on delete). */
async function deleteGradesBlockFor(projectId: string, token: string): Promise<void> {
  try {
    const parentId = await getParentId(projectId, token);
    if (!parentId) return;
    const children = await listAllChildren(parentId, token);
    const gradesBlock = children.find(
      (b: any) => b.type === "code" && b.code?.language === "json" && parseJsonBlock(b)?.["__envi_grades__"]?.projectId === projectId
    );
    if (gradesBlock) await deleteBlock(gradesBlock.id, token);
  } catch {
    // Non-critical cleanup.
  }
}

async function getSecret(env: Env): Promise<string> {
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
  return notionSecret;
}

/** DELETE /api/projects/:projectId – archive/delete the block in Notion */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { projectId } = context.params as { projectId: string };
  const notionSecret = await getSecret(context.env);

  if (!projectId) {
    return json({ error: "El ID del proyecto es obligatorio para su eliminación." }, 400);
  }
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  try {
    // Clean up this project's grades "<name> data" block in the parent first.
    await deleteGradesBlockFor(projectId, notionSecret);
    await deleteBlock(projectId, notionSecret);
    return json({ success: true, message: "Proyecto eliminado en Notion exitosamente." });
  } catch (err: any) {
    return json(
      { error: `Error al eliminar proyecto en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};

/**
 * PATCH /api/projects/:projectId – rename the project/folder.
 * Body: { name: string, type?: "toggle" | "page" }
 * Toggles update their rich_text; child pages update their title property.
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { projectId } = context.params as { projectId: string };
  const notionSecret = await getSecret(context.env);

  let body: { name?: string; type?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const name = (body.name || "").trim();
  if (!projectId) return json({ error: "El ID del proyecto es obligatorio." }, 400);
  if (!name) return json({ error: "El nombre es obligatorio." }, 400);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    if (body.type === "page") {
      await notionFetch("PATCH", `/pages/${cleanNotionId(projectId)}`, notionSecret, {
        properties: { title: { title: [{ type: "text", text: { content: name } }] } },
      });
    } else {
      await updateBlock(
        projectId,
        { toggle: { rich_text: [{ type: "text", text: { content: name } }] } },
        notionSecret
      );
    }
    return json({ success: true, message: "Proyecto renombrado exitosamente." });
  } catch (err: any) {
    return json(
      { error: `Error al renombrar proyecto en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};
