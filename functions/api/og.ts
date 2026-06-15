import { buildPreviewSvg, isRootLikePath, resolvePreview } from "../_shared/preview";
import { getPreviewAppearance, getPreviewMetaMap, listPreviewProjects } from "../_shared/preview-data";
import type { Env } from "../_shared/notion";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const requestedPath = url.searchParams.get("path") || "/";
  const normalizedPath = requestedPath.startsWith("/") ? requestedPath : `/${requestedPath}`;

  try {
    const appearance = await getPreviewAppearance(context.env);
    const metaMap = await getPreviewMetaMap(context.env);
    const projects = isRootLikePath(normalizedPath) ? [] : await listPreviewProjects(context.env).catch(() => []);
    const preview = resolvePreview(normalizedPath, appearance, projects, metaMap);
    const svg = await buildPreviewSvg(preview);

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=UTF-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return new Response("No se pudo generar la vista previa.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
    });
  }
};