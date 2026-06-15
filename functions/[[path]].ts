import { injectPreviewIntoHtml, isRootLikePath, resolvePreview } from "./_shared/preview";
import { getPreviewAppearance, getPreviewMetaMap, listPreviewProjects } from "./_shared/preview-data";
import type { Env } from "./_shared/notion";

type AssetEnv = Env & { ASSETS: Fetcher };

const STATIC_ASSET_PATH = /\.[a-z0-9]+$/i;

export const onRequest: PagesFunction<AssetEnv> = async (context) => {
  const { request, env } = context;
  if (request.method !== "GET") {
    return context.next();
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
    return context.next();
  }

  if (STATIC_ASSET_PATH.test(url.pathname) && !url.pathname.endsWith(".html")) {
    return context.next();
  }

  const assetUrl = new URL("/index.html", url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!assetResponse.ok) {
    return assetResponse;
  }

  const template = await assetResponse.text();
  const appearance = await getPreviewAppearance(env);
  const metaMap = await getPreviewMetaMap(env);
  const projects = isRootLikePath(url.pathname) ? [] : await listPreviewProjects(env).catch(() => []);
  const preview = resolvePreview(url.pathname, appearance, projects, metaMap);
  const imageUrl = new URL(`/api/og?path=${encodeURIComponent(url.pathname || "/")}`, url.origin).toString();
  const html = injectPreviewIntoHtml(template, preview, url.toString(), imageUrl);

  const headers = new Headers(assetResponse.headers);
  headers.set("Content-Type", "text/html; charset=UTF-8");
  headers.delete("Content-Length");

  return new Response(html, {
    status: assetResponse.status,
    headers,
  });
};