import { json, listChildren, appendChildren, updateBlock, type Env } from "../_shared/notion";
import { FEEDBACK_MARKER } from "../_shared/submissions";

/** Reads and parses a code(json) block's content, or null. */
function parseJsonBlock(block: any): any {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
}

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
    // Find the grade JSON code block (a code(json) block WITHOUT the feedback marker).
    const data = await listChildren(submissionId, notionSecret);
    const codeBlock = data.results?.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonBlock(b);
      return !(parsed && Array.isArray(parsed[FEEDBACK_MARKER]));
    }) as any;

    let merged: Record<string, string> = {};
    if (codeBlock) {
      const existing = parseJsonBlock(codeBlock);
      if (existing && typeof existing === "object" && !Array.isArray(existing[FEEDBACK_MARKER])) merged = existing;
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
