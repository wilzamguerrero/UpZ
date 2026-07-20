import { json, deleteBlock, updateBlock, notionFetch, cleanNotionId, type Env } from "../../_shared/notion";

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
