import { json, listChildren, appendChildren, cleanNotionId, type Env } from "../../_shared/notion";

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

/** GET /api/projects – list active toggle/child_page blocks from Notion */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { notionSecret, parentPageId } = await getConfig(context.env);

  if (!notionSecret || !parentPageId) {
    return json(
      { error: "Notion no está configurado. Por favor, ve al panel de administración." },
      400
    );
  }

  try {
    const data = await listChildren(parentPageId, notionSecret);

    const projects = (data.results || [])
      .filter((block: any) => block.type === "toggle" || block.type === "child_page")
      .map((block: any) => {
        if (block.type === "toggle") {
          const name = block.toggle.rich_text.map((rt: any) => rt.plain_text).join("").trim();
          return {
            id: block.id,
            name: name || "Proyecto sin título",
            type: "toggle",
            url: `https://notion.so/${parentPageId.replace(/-/g, "")}#${block.id.replace(/-/g, "")}`,
            isActive: true,
          };
        } else {
          return {
            id: block.id,
            name: block.child_page.title || "Proyecto sin título",
            type: "page",
            url: `https://notion.so/${block.id.replace(/-/g, "")}`,
            isActive: true,
          };
        }
      });

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

/** POST /api/projects – create a new toggle block in Notion */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret, parentPageId } = await getConfig(context.env);

  let body: { name?: string };
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

  try {
    const result = await appendChildren(
      parentPageId,
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
