import { json, appendChildren, uploadFileToNotion, uploadLargeFileToNotion, type Env } from "../_shared/notion";

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

/**
 * POST /api/submit
 * Accepts multipart/form-data: senderName, senderEmail, projectId, projectName, files[]
 * Files are uploaded directly to Notion — no external storage needed.
 * Files ≤ 20MB use single-part upload. Files > 20MB use multi-part chunked upload.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  const { SUBMISSIONS_KV } = context.env;

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return json({ error: "No se pudo leer el formulario." }, 400);
  }

  const senderName = (formData.get("senderName") as string | null)?.trim() || "";
  const senderEmail = (formData.get("senderEmail") as string | null)?.trim() || "";
  const projectId = (formData.get("projectId") as string | null)?.trim() || "";
  const projectName = (formData.get("projectName") as string | null)?.trim() || "Proyecto de Notion";

  if (!senderName || !senderEmail || !projectId) {
    return json({ error: "Faltan campos obligatorios (nombre, correo o proyecto)" }, 400);
  }

  const files = formData.getAll("files") as File[];
  if (!files || files.length === 0) {
    return json({ error: "No se han subido archivos" }, 400);
  }

  if (!notionSecret) {
    return json({ error: "Notion no está configurado en el servidor." }, 400);
  }

  // 5 GiB limit for paid workspaces
  const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
  // 20 MiB threshold for multi-part uploads
  const MULTI_PART_THRESHOLD = 20 * 1024 * 1024;

  // Process each file — all uploads go directly to Notion
  const fileRecords: {
    name: string;
    finalName: string;
    size: number;
    uploadId: string;
    extModified: boolean;
    isMultiPart: boolean;
  }[] = [];

  for (const file of files) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return json(
        { error: `El archivo "${file.name}" excede el límite de 5 GB permitido por Notion.` },
        400
      );
    }

    try {
      let result: { id: string; finalName: string; originalName: string; extModified: boolean };

      if (file.size > MULTI_PART_THRESHOLD) {
        // Large file: use multi-part chunked upload
        result = await uploadLargeFileToNotion(file, notionSecret);
      } else {
        // Small file: use single-part upload
        result = await uploadFileToNotion(file, notionSecret);
      }

      fileRecords.push({
        name: file.name,
        finalName: result.finalName,
        size: file.size,
        uploadId: result.id,
        extModified: result.extModified,
        isMultiPart: file.size > MULTI_PART_THRESHOLD,
      });
    } catch (err: any) {
      return json(
        { error: `Error al subir "${file.name}" a Notion: ${err.message || err}` },
        500
      );
    }
  }

  // Build date string
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

  // Build Notion child blocks — use file_upload references or external static references
  const innerBlocks: any[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Información de la entrega:\n• Remitente: ${senderName}\n• Correo: ${senderEmail}\n• Fecha de envío: ${dateStr}\n• Archivos totales: ${files.length}`,
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
    ...fileRecords.map((f) => {
      const fileObj: any = {
        type: "file_upload",
        file_upload: { id: f.uploadId },
      };
      if (f.extModified) {
        fileObj.caption = [
          {
            type: "text",
            text: {
              content: `⚠️ .zip agregado por compatibilidad. Nombre original: ${f.name} (renombrar o quitar .zip al descargar)`
            }
          }
        ];
      } else {
        const sizeLabel = (f.size / (1024 * 1024)).toFixed(2);
        const uploadType = f.isMultiPart ? "multi-part" : "directo";
        fileObj.caption = [
          {
            type: "text",
            text: {
              content: `✅ Subido de forma nativa a Notion (${uploadType}). ${f.name} — ${sizeLabel} MB`
            }
          }
        ];
      }
      return {
        object: "block",
        type: "file",
        file: fileObj,
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
      { error: `Error al guardar envío en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }

  // Save submission log to KV (optional — best effort)
  const submissionId = `sub_${Date.now()}`;
  const submissionRecord = {
    id: submissionId,
    projectId,
    projectName,
    senderName,
    senderEmail,
    timestamp: new Date().toISOString(),
    files: fileRecords.map((f) => ({
      name: f.name,
      size: f.size,
      isMultiPart: f.isMultiPart,
      url: `(Subido a Notion: ${f.finalName})`
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
    message: "¡Archivos subidos y registrados en Notion con éxito!",
    submission: submissionRecord,
  });
};
