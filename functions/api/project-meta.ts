import { json, listChildren, appendChildren, updateBlock, type Env } from "../../_shared/notion";

async function getCredentials(env: Env): Promise<{ notionSecret: string; parentPageId: string }> {
  let notionSecret = env.NOTION_SECRET || "";
  let parentPageId = env.NOTION_ID_PAGE || "";

  if (env.SUBMISSIONS_KV) {
    try {
      const override = await env.SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
        if (cfg.parentPageId) parentPageId = cfg.parentPageId;
      }
    } catch {
      // Ignore
    }
  }
  return { notionSecret, parentPageId };
}

/**
 * GET /api/project-meta
 * ?projectId=xxx – reads metadata from child blocks of that project page in Notion
 * (no projectId)  – returns all cached metas from KV, or empty object
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  const { SUBMISSIONS_KV } = context.env;

  const url = new URL(context.request.url);
  const projectId = url.searchParams.get("projectId");

  if (projectId && notionSecret) {
    try {
      const data = await listChildren(projectId, notionSecret);

      const codeBlock = data.results?.find(
        (b: any) => b.type === "code" && b.code?.language === "json"
      ) as any;
      const quoteBlock = data.results?.find((b: any) => b.type === "quote") as any;

      let expirationDate = "";
      if (quoteBlock?.quote?.rich_text) {
        const text = quoteBlock.quote.rich_text.map((rt: any) => rt.plain_text).join("");
        const match = text.match(/vencimiento:\s*([^\n\r]+)/i);
        if (match) expirationDate = match[1].trim();
      }

      if (codeBlock?.code?.rich_text) {
        const jsonText = codeBlock.code.rich_text.map((rt: any) => rt.plain_text).join("").trim();
        try {
          const data = JSON.parse(jsonText);
          return json({
            success: true,
            meta: {
              title: data.title || "",
              description: data.description || "",
              step1: data.step1 || "",
              step2: data.step2 || "",
              step3: data.step3 || "",
              expirationDate: data.expirationDate || expirationDate,
              backgroundImage: data.backgroundImage || "",
              isActive: data.isActive !== undefined ? !!data.isActive : true,
            },
          });
        } catch {
          // Malformed JSON in block, fall through
        }
      }

      if (expirationDate) {
        return json({ success: true, meta: { expirationDate, backgroundImage: "" } });
      }
    } catch (err: any) {
      // Fall through to KV cache
    }
  }

  // Fallback: return all cached metas from KV
  if (SUBMISSIONS_KV) {
    try {
      const cached = await SUBMISSIONS_KV.get("project-meta");
      if (cached) {
        return json({ success: true, meta: JSON.parse(cached) });
      }
    } catch {
      // Ignore
    }
  }

  return json({ success: true, meta: {} });
};

/**
 * POST /api/project-meta
 * Saves metadata to Notion code + quote blocks and to KV cache.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  const { SUBMISSIONS_KV } = context.env;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { projectId, title, description, step1, step2, step3, expirationDate, backgroundImage, isActive } = body;

  if (!projectId) {
    return json({ error: "El ID del proyecto es obligatorio." }, 400);
  }

  const metaPayload = {
    title: (title || "").trim(),
    description: (description || "").trim(),
    step1: (step1 || "").trim(),
    step2: (step2 || "").trim(),
    step3: (step3 || "").trim(),
    expirationDate: (expirationDate || "").trim(),
    backgroundImage: (backgroundImage || "").trim(),
    isActive: isActive !== undefined ? !!isActive : true,
  };

  if (notionSecret) {
    try {
      const data = await listChildren(projectId, notionSecret);

      const codeBlock = data.results?.find(
        (b: any) => b.type === "code" && b.code?.language === "json"
      ) as any;
      const quoteBlock = data.results?.find((b: any) => b.type === "quote") as any;

      const jsonString = JSON.stringify(metaPayload, null, 2);

      if (codeBlock) {
        await updateBlock(codeBlock.id, {
          code: {
            rich_text: [{ type: "text", text: { content: jsonString } }],
            language: "json",
          },
        }, notionSecret);
      } else {
        await appendChildren(projectId, [{
          object: "block",
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: jsonString } }],
            language: "json",
          },
        }], notionSecret);
      }

      const quoteText = `⏳ Fecha de vencimiento: ${expirationDate?.trim() || "Sin fecha límite asignada"}`;
      if (quoteBlock) {
        await updateBlock(quoteBlock.id, {
          quote: { rich_text: [{ type: "text", text: { content: quoteText } }] },
        }, notionSecret);
      } else {
        await appendChildren(projectId, [{
          object: "block",
          type: "quote",
          quote: { rich_text: [{ type: "text", text: { content: quoteText } }] },
        }], notionSecret);
      }

      // Also update KV cache
      if (SUBMISSIONS_KV) {
        const cached = await SUBMISSIONS_KV.get("project-meta").catch(() => null);
        const allMeta = cached ? JSON.parse(cached) : {};
        allMeta[projectId] = metaPayload;
        await SUBMISSIONS_KV.put("project-meta", JSON.stringify(allMeta));
      }

      return json({ success: true, message: "Información sincronizada en Notion exitosamente." });
    } catch (err: any) {
      // Fall through to KV-only save
    }
  }

  // Fallback: save only in KV
  if (SUBMISSIONS_KV) {
    const cached = await SUBMISSIONS_KV.get("project-meta").catch(() => null);
    const allMeta = cached ? JSON.parse(cached) : {};
    allMeta[projectId] = metaPayload;
    await SUBMISSIONS_KV.put("project-meta", JSON.stringify(allMeta));
    return json({ success: true, message: "Textos guardados localmente (caché)." });
  }

  return json({ error: "No se pudo guardar: Notion no configurado y sin almacenamiento KV." }, 500);
};
