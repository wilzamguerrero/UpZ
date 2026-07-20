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
 * Deletes a submission from Notion (the per-person toggle block + optional
 * database row) AND from the KV log, so removing it here removes it everywhere.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;
  const { id } = context.params as { id: string };

  if (!id) {
    return json({ error: "El ID del envío es obligatorio." }, 400);
  }
  if (!SUBMISSIONS_KV) {
    return json({ error: "Almacenamiento KV no configurado." }, 500);
  }

  let submissions: any[] = [];
  try {
    const raw = await SUBMISSIONS_KV.get("submissions");
    submissions = raw ? JSON.parse(raw) : [];
  } catch {
    submissions = [];
  }

  const record = submissions.find((s) => s.id === id);
  const notionSecret = await getSecret(context.env);

  // Best-effort delete from Notion (ignore if already gone).
  if (record && notionSecret) {
    if (record.notionBlockId) {
      try {
        await deleteBlock(record.notionBlockId, notionSecret);
      } catch {
        // Already deleted in Notion or not accessible — continue.
      }
    }
    if (record.dbPageId) {
      try {
        await deleteBlock(record.dbPageId, notionSecret);
      } catch {
        // Non-critical.
      }
    }
  }

  // Remove from KV log + per-person key.
  const kept = submissions.filter((s) => s.id !== id);
  try {
    await SUBMISSIONS_KV.put("submissions", JSON.stringify(kept));
  } catch {
    return json({ error: "No se pudo actualizar el registro de envíos." }, 500);
  }
  if (record?.projectId) {
    try {
      await SUBMISSIONS_KV.delete(`person:${record.projectId}:${id}`);
    } catch {
      // Non-critical
    }
  }

  return json({ success: true, message: "Envío eliminado de Notion y del panel." });
};
