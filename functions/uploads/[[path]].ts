import { type Env } from "../_shared/notion";

/**
 * GET /uploads/*
 * Serves files stored in R2 (FILES_BUCKET).
 * The catch-all route captures paths like /uploads/{uuid}/{filename}.
 * The R2 key is "uploads/{uuid}/{filename}".
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { FILES_BUCKET } = context.env;
  const path = (context.params as { path: string[] }).path;

  if (!FILES_BUCKET) {
    return new Response("Almacenamiento de archivos no configurado.", { status: 503 });
  }

  // Reconstruct the R2 key from the path segments
  const r2Key = path.join("/");
  const object = await FILES_BUCKET.get(r2Key);
  if (!object) {
    return new Response("Archivo no encontrado.", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  // Allow Notion to download the file (CORS)
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "Range, Content-Type");

  return new Response(object.body, { headers });
};

/** Handle CORS preflight for /uploads/* */
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "Range, Content-Type",
      "access-control-max-age": "86400",
    },
  });
};
