import { json, appendChildren, type Env } from "../../_shared/notion";

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
 * Accepts multipart/form-data with fields: senderName, senderEmail, projectId, projectName, files[]
 * - Stores files in R2 (FILES_BUCKET) if configured and serves them from /uploads/:filename
 * - Creates a Notion toggle entry in the project block
 * - Saves submission record to SUBMISSIONS_KV
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  const { FILES_BUCKET, SUBMISSIONS_KV } = context.env;

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

  // Upload files to R2 (if available) and build attachment records
  const origin = new URL(context.request.url).origin;
  const fileAttachments: { name: string; size: number; url: string }[] = [];

  for (const file of files) {
    if (FILES_BUCKET) {
      const ext = file.name.split(".").pop() || "bin";
      const uniqueName = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await FILES_BUCKET.put(uniqueName, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      fileAttachments.push({
        name: file.name,
        size: file.size,
        url: `${origin}/uploads/${uniqueName}`,
      });
    } else {
      // No R2: record file metadata only (no download link)
      fileAttachments.push({
        name: file.name,
        size: file.size,
        url: "",
      });
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

  // Build Notion child blocks
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
    ...fileAttachments.map((file) =>
      file.url
        ? {
            object: "block",
            type: "file",
            file: { type: "external", external: { url: file.url } },
          }
        : {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: `📎 ${file.name} (${Math.round(file.size / 1024)} KB) — sin enlace de descarga` },
                },
              ],
            },
          }
    ),
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

  // Save submission log to KV
  const submissionId = `sub_${Date.now()}`;
  const submissionRecord = {
    id: submissionId,
    projectId,
    projectName,
    senderName,
    senderEmail,
    timestamp: new Date().toISOString(),
    files: fileAttachments,
  };

  if (SUBMISSIONS_KV) {
    try {
      const raw = await SUBMISSIONS_KV.get("submissions");
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(submissionRecord);
      await SUBMISSIONS_KV.put("submissions", JSON.stringify(list));
    } catch {
      // Non-critical – Notion entry already created
    }
  }

  return json({
    success: true,
    message: FILES_BUCKET
      ? "¡Archivos subidos y registrados en Notion con éxito!"
      : "¡Entrega registrada en Notion! (Los archivos no se almacenaron porque R2 no está configurado.)",
    submission: submissionRecord,
  });
};
