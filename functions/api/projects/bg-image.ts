import { json, notionFetch, type Env } from "../../_shared/notion";

/**
 * GET /api/projects/bg-image?blockId=<id>
 *
 * Proxy endpoint for background images stored in Notion image blocks.
 * Notion's file URLs are short-lived S3 signed URLs — this endpoint retrieves
 * the current signed URL from the block on every request and streams the image
 * back to the browser, so the image always works regardless of expiry.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const blockId = new URL(context.request.url).searchParams.get("blockId");
  if (!blockId) {
    return json({ error: "blockId es requerido." }, 400);
  }

  // Resolve Notion credentials (KV override → env vars)
  let notionSecret = context.env.NOTION_SECRET || "";
  if (context.env.SUBMISSIONS_KV) {
    try {
      const override = await context.env.SUBMISSIONS_KV.get("config");
      if (override) {
        const cfg = JSON.parse(override);
        if (cfg.notionSecret) notionSecret = cfg.notionSecret;
      }
    } catch { /* ignore */ }
  }

  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  try {
    const block: any = await notionFetch("GET", `/blocks/${encodeURIComponent(blockId)}`, notionSecret);
    const imageUrl: string =
      block?.image?.file?.url ||
      block?.image?.external?.url ||
      "";

    if (!imageUrl) {
      return json({ error: "Imagen no encontrada en este bloque de Notion." }, 404);
    }

    // Proxy the image — fetch the signed S3 URL and stream it directly
    const upstream = await fetch(imageUrl);
    if (!upstream.ok || !upstream.body) {
      return json({ error: "No se pudo descargar la imagen desde Notion." }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        // No caching — Notion signed URLs expire, always fetch fresh
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return json({ error: err.message || "Error interno al recuperar la imagen." }, 500);
  }
};
