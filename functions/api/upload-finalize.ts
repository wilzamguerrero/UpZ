import { json, type Env, NOTION_VERSION, NOTION_BASE, resolveUploadMeta } from "../_shared/notion";

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
 * POST /api/upload-finalize
 * After the file is fully uploaded to R2, this endpoint:
 * 1. Creates a Notion file upload with mode=external_url pointing to the R2 public URL
 * 2. Returns the Notion file upload ID for attaching to a page/block
 *
 * Body: { r2Key: string, uploadName: string, contentType: string }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  const bucket = context.env.FILES_BUCKET;
  if (!bucket) {
    return json({ error: "R2 no está configurado." }, 400);
  }

  let body: { r2Key?: string; uploadName?: string; contentType?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const { r2Key, uploadName, contentType } = body || {};
  if (!r2Key || !uploadName) {
    return json({ error: "Se requiere r2Key y uploadName." }, 400);
  }

  try {
    // Verify the file exists in R2
    const r2Object = await bucket.head(r2Key);
    if (!r2Object) {
      return json({ error: "El archivo no se encuentra en R2." }, 404);
    }

    // Build the public URL for the R2 object.
    // This requires the R2 bucket to have a public URL configured (custom domain or workers.dev).
    // We use the current request's origin to construct the URL.
    const url = new URL(context.request.url);
    const publicUrl = `${url.origin}/uploads/${encodeURIComponent(r2Key.split("/").slice(1).join("/"))}`;

    // Create a Notion file upload with mode=external_url
    const createRes = await fetch(`${NOTION_BASE}/file_uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "external_url",
        external_url: publicUrl,
        filename: uploadName,
        content_type: contentType || "application/octet-stream",
      }),
    });

    const upload = (await createRes.json()) as any;
    if (!upload.id) {
      throw new Error(`Notion rechazó el upload: ${JSON.stringify(upload)}`);
    }

    // Wait for Notion to download the file (it can take a few seconds for large files)
    // Poll the file upload status until it's no longer "pending"
    let status = upload.status;
    let attempts = 0;
    const maxAttempts = 60; // 60 × 5s = 5 min max wait
    while ((status === "pending") && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5000));
      const checkRes = await fetch(`${NOTION_BASE}/file_uploads/${upload.id}`, {
        headers: {
          Authorization: `Bearer ${notionSecret}`,
          "Notion-Version": NOTION_VERSION,
        },
      });
      const checkData = (await checkRes.json()) as any;
      status = checkData.status;
      attempts++;
    }

    if (status !== "uploaded") {
      // If still pending or failed, return the ID anyway — the frontend can retry later
      return json({
        success: false,
        id: upload.id,
        status,
        error: `El archivo no se pudo importar a Notion (estado: ${status}).`,
      });
    }

    // Clean up: delete the file from R2 since Notion has it now
    await bucket.delete(r2Key);

    return json({
      success: true,
      id: upload.id,
      status,
    });
  } catch (err: any) {
    return json(
      { error: `Error al finalizar upload: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
