import { json, listChildren, appendChildren, updateBlock, deleteBlock, uploadFileToNotion, buildNotionFileBlocks, type Env } from "../_shared/notion";
import { sendGmailMessage, buildFeedbackEmail, hasGmailCredentials, type MailAttachment } from "../_shared/gmail";
import { FEEDBACK_MARKER } from "../_shared/submissions";

const MAX_STORE_PER_FILE = 20 * 1024 * 1024; // Notion single-part upload limit (~20MB)

const MAX_TOTAL_ATTACHMENTS = 24 * 1024 * 1024; // ~24MB (Gmail attachment limit ~25MB)

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

/** Appends a feedback entry to the submission toggle's feedback JSON code block. */
async function persistFeedback(
  toggleId: string,
  token: string,
  entry: { comment: string; note?: string; files: { name: string; size: number }[]; filesBlockId?: string; sentAt: string }
): Promise<void> {
  const data = await listChildren(toggleId, token);
  const block = data.results?.find((b: any) => {
    if (b.type !== "code" || b.code?.language !== "json") return false;
    const parsed = parseJsonBlock(b);
    return parsed && Array.isArray(parsed[FEEDBACK_MARKER]);
  }) as any;

  const history: any[] = block ? parseJsonBlock(block)?.[FEEDBACK_MARKER] || [] : [];
  history.push(entry);
  const jsonString = JSON.stringify({ [FEEDBACK_MARKER]: history }, null, 2);

  if (block) {
    await updateBlock(
      block.id,
      { code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" } },
      token
    );
  } else {
    await appendChildren(
      toggleId,
      [{
        object: "block",
        type: "code",
        code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
      }],
      token
    );
  }
}

/**
 * POST /api/send-feedback  (multipart/form-data)
 * Fields: recipientEmail, recipientName, projectName, comment, note, bgColor,
 *         submissionId (toggle to store history in), files[]
 * Emails the feedback and stores it in Notion so it can be reviewed later.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: "Formato de solicitud inválido." }, 400);
  }

  const recipientEmail = String(form.get("recipientEmail") || "").trim();
  const recipientName = String(form.get("recipientName") || "").trim() || "Remitente";
  const projectName = String(form.get("projectName") || "Proyecto").trim();
  const comment = String(form.get("comment") || "");
  const note = String(form.get("note") || "");
  const bgColor = String(form.get("bgColor") || "");
  const submissionId = String(form.get("submissionId") || "").trim();

  if (!recipientEmail) {
    return json({ error: "Falta el correo del destinatario." }, 400);
  }
  if (!comment.trim() && !note.trim() && !form.getAll("files").length) {
    return json({ error: "Escribe un comentario, una nota o adjunta un archivo." }, 400);
  }

  const gmailCreds = {
    clientId: context.env.GMAIL_CLIENT_ID || "",
    clientSecret: context.env.GMAIL_CLIENT_SECRET || "",
    refreshToken: context.env.GMAIL_REFRESH_TOKEN || "",
    sender: context.env.GMAIL_SENDER || "",
    senderName: context.env.MAIL_FROM_NAME || "ENVI",
  };
  if (!hasGmailCredentials(gmailCreds)) {
    return json({ error: "El correo no está configurado en el servidor." }, 400);
  }

  // Read attached files (keep the File objects so we can also store them in Notion).
  const fileObjects: File[] = [];
  const attachments: MailAttachment[] = [];
  let total = 0;
  for (const entry of form.getAll("files")) {
    const file = entry as unknown as File;
    if (file && typeof file.arrayBuffer === "function") {
      const buf = new Uint8Array(await file.arrayBuffer());
      total += buf.byteLength;
      if (total > MAX_TOTAL_ATTACHMENTS) {
        return json({ error: "Los archivos adjuntos superan el límite de 24 MB." }, 400);
      }
      fileObjects.push(file);
      attachments.push({
        filename: file.name || "archivo",
        contentType: file.type || "application/octet-stream",
        content: buf,
      });
    }
  }

  const { subject, html, text } = buildFeedbackEmail({
    recipientName,
    projectName,
    comment,
    note,
    files: fileObjects.map((f) => ({ name: f.name || "archivo" })),
    accentColor: bgColor,
  });

  try {
    await sendGmailMessage(gmailCreds, {
      to: recipientEmail,
      toName: recipientName,
      subject,
      html,
      text,
      attachments,
    });
  } catch (err: any) {
    return json({ error: `No se pudo enviar el correo: ${err.message || "error desconocido"}.` }, 500);
  }

  // Store the feedback (and its files) in Notion so it can be reviewed/previewed later.
  const notionSecret = await getSecret(context.env);
  let filesBlockId = "";
  let entryFiles: { name: string; size: number }[] = fileObjects.map((f) => ({ name: f.name || "archivo", size: f.size || 0 }));

  if (notionSecret && submissionId && fileObjects.length > 0) {
    try {
      const records: { uploadId: string; name: string; size: number; mimeType: string; extModified: boolean }[] = [];
      for (const f of fileObjects) {
        if ((f.size || 0) > MAX_STORE_PER_FILE) continue; // too large for single-part storage
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
            rich_text: [{ type: "text", text: { content: `💬 Retroalimentación — ${new Date().toLocaleString("es-ES")}` } }],
            children: buildNotionFileBlocks(records),
          },
        };
        const appendRes = await appendChildren(submissionId, [container], notionSecret);
        filesBlockId = appendRes?.results?.[0]?.id || "";
        // Align entry files with the stored blocks (same order) for correct previews.
        entryFiles = records.map((r) => ({ name: r.name, size: r.size }));
      }
    } catch {
      // Non-critical: the email was already sent.
    }
  }

  const entry = { comment, note, files: entryFiles, filesBlockId, sentAt: new Date().toISOString() };
  if (notionSecret && submissionId) {
    try {
      await persistFeedback(submissionId, notionSecret, entry);
    } catch {
      // Non-critical: the email was already sent.
    }
  }

  return json({ success: true, message: "Retroalimentación enviada por correo.", entry });
};

/**
 * DELETE /api/send-feedback?submissionId=<toggleId>&index=<n>
 * Removes a feedback entry (and its stored files) from Notion.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const submissionId = url.searchParams.get("submissionId") || "";
  const index = parseInt(url.searchParams.get("index") || "-1", 10);

  if (!submissionId || Number.isNaN(index) || index < 0) {
    return json({ error: "Parámetros inválidos." }, 400);
  }

  const notionSecret = await getSecret(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  try {
    const data = await listChildren(submissionId, notionSecret);
    const block = data.results?.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonBlock(b);
      return parsed && Array.isArray(parsed[FEEDBACK_MARKER]);
    }) as any;

    if (!block) return json({ success: true });

    const history: any[] = parseJsonBlock(block)?.[FEEDBACK_MARKER] || [];
    const entry = history[index];
    if (!entry) return json({ success: true });

    // Delete the entry's stored files container (if any).
    if (entry.filesBlockId) {
      try { await deleteBlock(entry.filesBlockId, notionSecret); } catch { /* already gone */ }
    }

    history.splice(index, 1);
    if (history.length === 0) {
      try { await deleteBlock(block.id, notionSecret); } catch { /* already gone */ }
    } else {
      await updateBlock(
        block.id,
        { code: { rich_text: [{ type: "text", text: { content: JSON.stringify({ [FEEDBACK_MARKER]: history }, null, 2) } }], language: "json" } },
        notionSecret
      );
    }
    return json({ success: true });
  } catch (err: any) {
    return json({ error: `No se pudo eliminar: ${err.message || "error desconocido"}.` }, 500);
  }
};
