import { json, appendChildren, notionFetch, cleanNotionId, type Env } from "../_shared/notion";
import { sendGmailMessage, buildReceiptEmail, hasGmailCredentials } from "../_shared/gmail";
import { SUBMISSION_COMMENT_MARKER } from "../_shared/submissions";

async function getCredentials(env: Env): Promise<{ notionSecret: string }> {
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
  return { notionSecret };
}

interface FileRecord {
  name: string;
  finalName: string;
  size: number;
  uploadId: string;
  extModified: boolean;
  mimeType: string;
}

const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/webp", "image/svg+xml", "image/bmp", "image/tiff",
]);

/**
 * POST /api/submit
 * Accepts JSON body with pre-uploaded file records (uploadIds from /api/upload-file).
 * Creates a toggle block in Notion with images displayed inline and files as attachments.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  const { SUBMISSIONS_KV } = context.env;

  let body: {
    senderName?: string;
    senderEmail?: string;
    projectId?: string;
    projectName?: string;
    fileRecords?: FileRecord[];
    customValues?: Record<string, string>;
    customFields?: { id: string; label: string }[];
    useDatabase?: boolean;
    databaseId?: string;
    bgColor?: string;
    comment?: string;
  };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud invalido." }, 400);
  }

  const {
    senderName = "",
    senderEmail = "",
    projectId = "",
    projectName = "Proyecto",
    fileRecords = [],
    customValues = {},
    customFields = [],
    useDatabase = false,
    databaseId = "",
    bgColor = "",
    comment = "",
  } = body;
  const trimmedComment = String(comment || "").trim();

  if (!senderName || !senderEmail || !projectId) {
    return json({ error: "Faltan campos obligatorios (nombre, correo o proyecto)." }, 400);
  }
  if (fileRecords.length === 0) {
    return json({ error: "No se han subido archivos." }, 400);
  }
  if (!notionSecret) {
    return json({ error: "Notion no esta configurado en el servidor." }, 400);
  }

  const dateStr =
    new Date().toLocaleString("es-ES", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC";

  const toggleHeader = `👤 ${senderName} (${senderEmail}) — ${dateStr}`;

  // Render custom field lines for the callout block.
  const customLines = (customFields || [])
    .map((cf) => {
      const val = customValues?.[cf.id];
      if (!val) return "";
      return `\n- ${cf.label}: ${val}`;
    })
    .join("");

  const innerBlocks: any[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Informacion de la entrega:\n- Remitente: ${senderName}\n- Correo: ${senderEmail}\n- Fecha de envio: ${dateStr}\n- Archivos totales: ${fileRecords.length}${customLines}${trimmedComment ? `\n- Comentario: ${trimmedComment}` : ""}`,
            },
          },
        ],
        icon: { type: "emoji", emoji: "📬" },
        color: "blue_background",
      },
    },
    // Machine-readable copy of the submitter's message so it can be read back
    // from Notion (source of truth) and shown in the admin.
    ...(trimmedComment
      ? [{
          object: "block",
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: JSON.stringify({ [SUBMISSION_COMMENT_MARKER]: trimmedComment }, null, 2) } }],
            language: "json",
          },
        }]
      : []),
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Archivos adjuntos" } }],
      },
    },
    ...fileRecords.map((f: FileRecord) => {
      const isImage = IMAGE_TYPES.has(f.mimeType);
      const sizeLabel = (f.size / (1024 * 1024)).toFixed(2) + " MB";
      const caption = f.extModified
        ? [{ type: "text", text: { content: `⚠️ .zip agregado. Nombre original: ${f.name} (${sizeLabel})` } }]
        : [{ type: "text", text: { content: `${isImage ? "🖼️" : "📄"} ${f.name} (${sizeLabel})` } }];

      if (isImage) {
        return {
          object: "block",
          type: "image",
          image: {
            type: "file_upload",
            file_upload: { id: f.uploadId },
            caption,
          },
        };
      }

      return {
        object: "block",
        type: "file",
        file: {
          type: "file_upload",
          file_upload: { id: f.uploadId },
          caption,
        },
      };
    }),
  ];

  // Always create the per-person toggle (works for both modes).
  // Capture the created toggle's block id so submissions can be reconciled with
  // (and deleted from) Notion later — Notion is the source of truth.
  let notionBlockId = "";
  try {
    const appendResult = await appendChildren(
      projectId,
      [
        {
          object: "block",
          type: "toggle",
          toggle: {
            rich_text: [{ type: "text", text: { content: toggleHeader } }],
            children: innerBlocks,
          },
        },
      ],
      notionSecret
    );
    notionBlockId = appendResult?.results?.[0]?.id || "";
  } catch (err: any) {
    return json(
      { error: `Error al guardar envio en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }

  // Database mode: also insert a row into the project's Notion database.
  const cleanDbId = cleanNotionId(databaseId || "");
  let dbPageId = "";
  if (useDatabase && cleanDbId) {
    const fileNames = fileRecords.map((f) => f.name).join(", ");
    const dbProperties: Record<string, any> = {
      Nombre: { title: [{ type: "text", text: { content: senderName } }] },
      Correo: { email: senderEmail },
      "Fecha de envío": { date: { start: new Date().toISOString() } },
      Archivos: { rich_text: [{ type: "text", text: { content: fileNames } }] },
    };
    if (trimmedComment) {
      dbProperties["Comentario"] = { rich_text: [{ type: "text", text: { content: trimmedComment } }] };
    }
    // Map custom field values as rich_text columns (best-effort).
    for (const cf of customFields || []) {
      const val = customValues?.[cf.id];
      if (val) {
        dbProperties[cf.label] = { rich_text: [{ type: "text", text: { content: val } }] };
      }
    }
    try {
      const rowRes = await notionFetch("POST", "/pages", notionSecret, {
        parent: { type: "database_id", database_id: cleanDbId },
        properties: dbProperties,
      });
      dbPageId = rowRes?.id || "";
    } catch {
      // Non-critical: toggle already created; ignore database insert failure.
    }
  }

  const submissionId = `sub_${Date.now()}`;
  const submissionRecord = {
    id: submissionId,
    projectId,
    projectName,
    senderName,
    senderEmail,
    timestamp: new Date().toISOString(),
    // Notion references used to mirror deletions and delete from the admin panel.
    notionBlockId,
    dbPageId,
    files: fileRecords.map((f: FileRecord) => ({
      name: f.name,
      size: f.size,
      url: `(Subido a Notion: ${f.finalName})`,
    })),
    comment: trimmedComment,
    customValues: customValues || {},
    controlValues: {},
  };

  if (SUBMISSIONS_KV) {
    try {
      const raw = await SUBMISSIONS_KV.get("submissions");
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(submissionRecord);
      await SUBMISSIONS_KV.put("submissions", JSON.stringify(list));
    } catch {
      // Non-critical
    }

    // Per-person JSON storage (used by the no-database mode for grading later).
    try {
      const personKey = `person:${projectId}:${submissionId}`;
      await SUBMISSIONS_KV.put(personKey, JSON.stringify(submissionRecord));
    } catch {
      // Non-critical
    }
  }

  // Enviar comprobante por correo al remitente (Gmail API). Best-effort: no
  // bloquea la respuesta ni hace fallar el envío si el correo no se puede mandar.
  const gmailCreds = {
    clientId: context.env.GMAIL_CLIENT_ID || "",
    clientSecret: context.env.GMAIL_CLIENT_SECRET || "",
    refreshToken: context.env.GMAIL_REFRESH_TOKEN || "",
    sender: context.env.GMAIL_SENDER || "",
    senderName: context.env.MAIL_FROM_NAME || "ENVI",
  };
  if (hasGmailCredentials(gmailCreds)) {
    const { subject, html, text } = buildReceiptEmail({
      senderName,
      senderEmail,
      projectName,
      timestamp: submissionRecord.timestamp,
      files: submissionRecord.files.map((f) => ({ name: f.name, size: f.size })),
      accentColor: bgColor,
    });
    context.waitUntil(
      sendGmailMessage(gmailCreds, { to: senderEmail, toName: senderName, subject, html, text }).catch(
        (err) => console.error("No se pudo enviar el comprobante por correo:", err)
      )
    );
  }

  return json({
    success: true,
    message: "Archivos subidos y registrados en Notion con exito!",
    submission: submissionRecord,
  });
};
