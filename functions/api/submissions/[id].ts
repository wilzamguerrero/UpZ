import { json, deleteBlock, type Env } from "../../_shared/notion";

/** Reads the effective Notion secret (KV override > env). */
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

/**
 * DELETE /api/submissions/:id
 * The id is the submission's Notion toggle block id. Deletes that block in
 * Notion (source of truth). If a KV log exists, it's cleaned up too (optional).
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;
  const { id } = context.params as { id: string };

  if (!id) {
    return json({ error: "El ID del envío es obligatorio." }, 400);
  }

  const notionSecret = await getSecret(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  // Delete the toggle block in Notion (source of truth).
  try {
    await deleteBlock(id, notionSecret);
  } catch {
    // Already deleted or not accessible — treat as success so the UI updates.
  }

  // Optional: keep any legacy KV log in sync.
  if (SUBMISSIONS_KV) {
    try {
      const raw = await SUBMISSIONS_KV.get("submissions");
      if (raw) {
        const list = JSON.parse(raw);
        const kept = list.filter((s: any) => s.id !== id && s.notionBlockId !== id);
        if (kept.length !== list.length) {
          await SUBMISSIONS_KV.put("submissions", JSON.stringify(kept));
        }
      }
    } catch {
      // Non-critical
    }
  }

  return json({ success: true, message: "Envío eliminado de Notion." });
};
