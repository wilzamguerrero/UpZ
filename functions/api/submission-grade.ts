import { json, listChildren, appendChildren, updateBlock, type Env } from "../_shared/notion";

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
 * PATCH /api/submission-grade
 * Body: { submissionId, controlValues }
 * Persists grading/control values (nota, estado, comentarios...) for a no-database
 * submission INSIDE its Notion toggle (as a JSON code block), so it's the source
 * of truth on any platform. `submissionId` is the toggle block id.
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  let body: { submissionId?: string; controlValues?: Record<string, string> };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { submissionId, controlValues = {} } = body;
  if (!submissionId) return json({ error: "submissionId es obligatorio." }, 400);

  const notionSecret = await getSecret(context.env);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    // Find an existing JSON code block inside the submission toggle.
    const data = await listChildren(submissionId, notionSecret);
    const codeBlock = data.results?.find(
      (b: any) => b.type === "code" && b.code?.language === "json"
    ) as any;

    let merged: Record<string, string> = {};
    if (codeBlock?.code?.rich_text) {
      try {
        const existing = JSON.parse(
          codeBlock.code.rich_text.map((rt: any) => rt.plain_text).join("").trim()
        );
        if (existing && typeof existing === "object") merged = existing;
      } catch {
        // Ignore malformed JSON.
      }
    }
    merged = { ...merged, ...controlValues };
    const jsonString = JSON.stringify(merged, null, 2);

    if (codeBlock) {
      await updateBlock(
        codeBlock.id,
        { code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" } },
        notionSecret
      );
    } else {
      await appendChildren(
        submissionId,
        [{
          object: "block",
          type: "code",
          code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
        }],
        notionSecret
      );
    }

    return json({ success: true });
  } catch (err: any) {
    return json(
      { error: `No se pudo guardar la calificación: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};
