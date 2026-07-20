import { json, notionFetch, appendChildren, cleanNotionId, type Env } from "../../_shared/notion";

/** Reads the effective Notion credentials (KV override > env vars) */
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

// Max nesting depth to walk (folders → projects → sub-projects...).
const MAX_TREE_DEPTH = 4;

/** A submission toggle's header always starts with the 👤 emoji (see submit.ts). */
const isSubmissionTitle = (name: string): boolean => name.trim().startsWith("👤");

/** List ALL children of a block, following pagination. */
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
 * Recursively collect the project tree from Notion.
 * A "project" (or folder — same thing here) is a toggle or child_page. Submission
 * toggles (👤 ...) and content blocks (code/quote/callout/image/file...) are ignored.
 * Nested projects/folders get their container's id as `parentId`; top-level ones "".
 */
async function collectProjects(
  blockId: string,
  parentKey: string,
  parentPageId: string,
  token: string,
  depth: number,
  acc: any[]
): Promise<void> {
  if (depth > MAX_TREE_DEPTH) return;

  let children: any[];
  try {
    children = await listAllChildren(blockId, token);
  } catch {
    return; // stop descending on error
  }

  for (const block of children) {
    if (block.type === "toggle") {
      const name = (block.toggle?.rich_text || [])
        .map((rt: any) => rt.plain_text)
        .join("")
        .trim();
      if (isSubmissionTitle(name)) continue; // it's a submission, not a project

      acc.push({
        id: block.id,
        name: name || "Proyecto sin título",
        type: "toggle",
        parentId: parentKey,
        hasChildren: !!block.has_children,
        url: `https://notion.so/${parentPageId.replace(/-/g, "")}#${block.id.replace(/-/g, "")}`,
        isActive: true,
      });

      if (block.has_children) {
        await collectProjects(block.id, block.id, parentPageId, token, depth + 1, acc);
      }
    } else if (block.type === "child_page") {
      acc.push({
        id: block.id,
        name: block.child_page?.title || "Proyecto sin título",
        type: "page",
        parentId: parentKey,
        hasChildren: !!block.has_children,
        url: `https://notion.so/${block.id.replace(/-/g, "")}`,
        isActive: true,
      });

      if (block.has_children) {
        await collectProjects(block.id, block.id, parentPageId, token, depth + 1, acc);
      }
    }
    // Any other block type (code/quote/callout/image/file/heading...) is ignored.
  }
}

/** GET /api/projects – full project tree (flat list with parentId) from Notion */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { notionSecret, parentPageId } = await getConfig(context.env);

  if (!notionSecret || !parentPageId) {
    return json(
      { error: "Notion no está configurado. Por favor, ve al panel de administración." },
      400
    );
  }

  try {
    const projects: any[] = [];
    await collectProjects(parentPageId, "", parentPageId, notionSecret, 0, projects);
    return json({ success: true, projects });
  } catch (err: any) {
    return json(
      {
        error: `Error al conectar con Notion: ${err.message || "Error desconocido"}. Verifica tu token e ID de la página principal.`,
      },
      500
    );
  }
};

/**
 * POST /api/projects – create a new toggle block.
 * Body: { name: string, parentId?: string }
 * If parentId is provided the project is created INSIDE that folder/project;
 * otherwise it is created at the root parent page.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret, parentPageId } = await getConfig(context.env);

  let body: { name?: string; parentId?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { name } = body;
  if (!name || !name.trim()) {
    return json({ error: "El nombre del proyecto es obligatorio" }, 400);
  }

  if (!notionSecret || !parentPageId) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  // Target parent: a folder/project id if provided, else the root page.
  const targetParent = cleanNotionId(body.parentId || "") || parentPageId;

  try {
    const result = await appendChildren(
      targetParent,
      [
        {
          object: "block",
          type: "toggle",
          toggle: {
            rich_text: [{ type: "text", text: { content: name.trim() } }],
          },
        },
      ],
      notionSecret
    );

    const newBlock = result.results?.[0] as any;
    const blockIdClean = newBlock?.id?.replace(/-/g, "") || "";

    return json({
      success: true,
      project: {
        id: newBlock?.id,
        name: name.trim(),
        parentId: targetParent === parentPageId ? "" : targetParent,
        url: `https://notion.so/${parentPageId.replace(/-/g, "")}#${blockIdClean}`,
      },
    });
  } catch (err: any) {
    return json(
      { error: `Error al crear proyecto en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};
