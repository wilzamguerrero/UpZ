import { json, listChildren, appendChildren, deleteBlock, uploadFileToNotion, buildNotionFileBlocks, type Env } from "../_shared/notion";
import { FEEDBACK_DRAFT_MARKER } from "../_shared/submissions";

const MAX_STORE_PER_FILE = 20 * 1024 * 1024; // Notion single-part upload limit (~20MB)

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

const parseJsonBlock = (block: any): any => {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
};

/** Finds the saved-draft JSON code block inside a submission toggle (if any). */
async function findDraftBlock(toggleId: string, token: string): Promise<any | null> {
  const data = await listChildren(toggleId, token);
  return (
    data.results?.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonBlock(b);
      return parsed && parsed[FEEDBACK_DRAFT_MARKER] && typeof parsed[FEEDBACK_DRAFT_MARKER] === "object";
    }) || null
  );
}

/** Removes the draft (block + its stored files container) from a toggle. */
async function clearDraft(toggleId: string, token: string): Promise<void> {
  const block = await findDraftBlock(toggleId, token);
  if (!block) return;
  const parsed = parseJsonBlock(block);
  const draft = parsed?.[FEEDBACK_DRAFT_MARKER];
  if (draft?.filesBlockId) {
    try { await deleteBlock(draft.filesBlockId, token); } catch { /* already gone */ }
  }
  try { await deleteBlock(block.id, token); } catch { /* already gone */ }
}

/**
 * POST /api/feedback-draft  (multipart/form-data)
 * Fields: submissionId, comment, note, files[]
 * Saves the feedback as a draft in Notion WITHOUT sending any email. Replaces any
 * previous draft for the same submission.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: "Formato de solicitud inválido." }, 400);
  }

  const comment = String(form.get("comment") || "");
  const note = String(form.get("note") || "");
  const submissionId = String(form.get("submissionId") || "").trim();

  if (!submissionId) {
    return json({ error: "Falta el identificador del envío." }, 400);
  }
  if (!comment.trim() && !note.trim() && !form.getAll("files").length) {
    return json({ error: "Escribe un comentario, una nota o adjunta un archivo." }, 400);
  }

  const notionSecret = await getSecret(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  // Read attached files.
  const fileObjects: File[] = [];
  for (const entry of form.getAll("files")) {
    const file = entry as unknown as File;
    if (file && typeof file.arrayBuffer === "function") fileObjects.push(file);
  }

  try {
    // Remove any previous draft (and its files) first so we don't leave orphans.
    await clearDraft(submissionId, notionSecret);

    // Upload the current files to Notion inside a per-draft container toggle.
    let filesBlockId = "";
    let entryFiles: { name: string; size: number }[] = fileObjects.map((f) => ({ name: f.name || "archivo", size: f.size || 0 }));
    if (fileObjects.length > 0) {
      const records: { uploadId: string; name: string; size: number; mimeType: string; extModified: boolean }[] = [];
      for (const f of fileObjects) {
        if ((f.size || 0) > MAX_STORE_PER_FILE) continue;
        const up = await uploadFileToNotion(f, notionSecret);
        records.push({
          uploadId: up.id,
          name: up.originalName,
          size: f.size || 0,
          mimeType: f.type || "application/octet-stream",
          extModified: up.extModified,
        });
      }
      if (records.length > 0) {
        const container = {
          object: "block",
          type: "toggle",
          toggle: {
            rich_text: [{ type: "text", text: { content: `📝 Borrador — ${new Date().toLocaleString("es-ES")}` } }],
            children: buildNotionFileBlocks(records),
          },
        };
        const appendRes = await appendChildren(submissionId, [container], notionSecret);
        filesBlockId = appendRes?.results?.[0]?.id || "";
        entryFiles = records.map((r) => ({ name: r.name, size: r.size }));
      }
    }

    const draft = { comment, note, files: entryFiles, filesBlockId, savedAt: new Date().toISOString() };
    const jsonString = JSON.stringify({ [FEEDBACK_DRAFT_MARKER]: draft }, null, 2);
    await appendChildren(
      submissionId,
      [{
        object: "block",
        type: "code",
        code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
      }],
      notionSecret
    );

    return json({ success: true, message: "Borrador guardado.", draft });
  } catch (err: any) {
    return json({ error: `No se pudo guardar el borrador: ${err.message || "error desconocido"}.` }, 500);
  }
};

/**
 * DELETE /api/feedback-draft?submissionId=<toggleId>
 * Removes the saved draft (and its files) from Notion.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const submissionId = url.searchParams.get("submissionId") || "";

  if (!submissionId) {
    return json({ error: "Parámetros inválidos." }, 400);
  }

  const notionSecret = await getSecret(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  try {
    await clearDraft(submissionId, notionSecret);
    return json({ success: true });
  } catch (err: any) {
    return json({ error: `No se pudo eliminar el borrador: ${err.message || "error desconocido"}.` }, 500);
  }
};
