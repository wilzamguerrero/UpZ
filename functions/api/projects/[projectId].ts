import { json, deleteBlock, type Env } from "../../_shared/notion";

/** DELETE /api/projects/:projectId – archive/delete the block in Notion */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { projectId } = context.params as { projectId: string };
  const { NOTION_SECRET, SUBMISSIONS_KV } = context.env;

  let notionSecret = NOTION_SECRET || "";
  if (SUBMISSIONS_KV) {
    try {
      const override = await SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
      }
    } catch {
      // Ignore
    }
  }

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
