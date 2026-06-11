import { json, appendChildren, uploadFileToNotion, type Env } from "../_shared/notion";

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

  // Process each file with high-capacity hybrid logic
  const fileRecords: {
    name: string;
    finalName: string;
    size: number;
    uploadId: string;
    extModified: boolean;
    isLocalFallback: boolean;
    localUrl: string;
  }[] = [];

  for (const file of files) {
    let uploadId = "";
    let finalName = file.name;
    let extModified = false;
    let isLocalFallback = false;
    let localUrl = "";

    // 20 MiB is 20971520 bytes
    const IS_TOO_LARGE_FOR_NOTION = file.size > 20971520;

    if (!IS_TOO_LARGE_FOR_NOTION) {
      try {
        const res = await uploadFileToNotion(file, notionSecret);
        uploadId = res.id;
        finalName = res.finalName;
        extModified = res.extModified;
      } catch (err: any) {
        console.warn(`Notion direct upload failed for "${file.name}", falling back to local server storage:`, err);
        isLocalFallback = true;
      }
    } else {
      isLocalFallback = true;
    }

    if (isLocalFallback) {
      try {
        const appUrl = new URL(context.request.url).origin;
        const uploadForm = new FormData();
        uploadForm.append("file", file, file.name);

        const uploadRes = await fetch(`${appUrl}/api/fallback-upload`, {
          method: "POST",
          body: uploadForm,
        });

        if (!uploadRes.ok) {
          throw new Error(`Respuesta no exitosa del servidor (${uploadRes.status}): ${await uploadRes.text()}`);
        }

        const uploadData = (await uploadRes.json()) as any;
        if (!uploadData.success) {
          throw new Error(uploadData.error || "Fallo en el guardado de respaldo.");
        }
        localUrl = uploadData.url;
      } catch (err: any) {
        return json(
          { error: `Error al subir "${file.name}" usando almacenamiento de respaldo: ${err.message || err}` },
          500
        );
      }
    }

    fileRecords.push({
      name: file.name,
      finalName,
      size: file.size,
      uploadId,
      extModified,
      isLocalFallback,
      localUrl,
    });
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
      if (f.isLocalFallback) {
        return {
          object: "block",
          type: "file",
          file: {
            type: "external",
            external: {
              url: f.localUrl,
            },
            caption: [
              {
                type: "text",
                text: {
                  content: `💾 Hospedado externamente por límite de tamaño o cuenta. Nombre: ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`
                }
              }
            ]
          },
        };
      } else {
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
          fileObj.caption = [
            {
              type: "text",
              text: {
                content: `✅ Subido de forma nativa a Notion. Nombre original: ${f.name}`
              }
            }
          ];
        }
        return {
          object: "block",
          type: "file",
          file: fileObj,
        };
      }
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
      isLocalFallback: f.isLocalFallback,
      url: f.isLocalFallback ? f.localUrl : `(Subido a Notion: ${f.finalName})`
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
