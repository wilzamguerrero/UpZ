import { json, appendChildren, type Env } from "../_shared/notion";

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
  } = body;

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

  const innerBlocks: any[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Informacion de la entrega:\n- Remitente: ${senderName}\n- Correo: ${senderEmail}\n- Fecha de envio: ${dateStr}\n- Archivos totales: ${fileRecords.length}`,
            },
          },
        ],
        icon: { type: "emoji", emoji: "📬" },
        color: "blue_background",
      },
    },
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

  try {
    await appendChildren(
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
  } catch (err: any) {
    return json(
      { error: `Error al guardar envio en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }

  const submissionId = `sub_${Date.now()}`;
  const submissionRecord = {
    id: submissionId,
    projectId,
    projectName,
    senderName,
    senderEmail,
    timestamp: new Date().toISOString(),
    files: fileRecords.map((f: FileRecord) => ({
      name: f.name,
      size: f.size,
      url: `(Subido a Notion: ${f.finalName})`,
    })),
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
  }

  return json({
    success: true,
    message: "Archivos subidos y registrados en Notion con exito!",
    submission: submissionRecord,
  });
};
