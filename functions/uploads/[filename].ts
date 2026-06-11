import { type Env } from "../_shared/notion";

/**
 * GET /uploads/:filename
 * Serves files stored in R2 (FILES_BUCKET).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { FILES_BUCKET } = context.env;
  const { filename } = context.params as { filename: string };

  if (!FILES_BUCKET) {
    return new Response("Almacenamiento de archivos no configurado.", { status: 503 });
  }

  const object = await FILES_BUCKET.get(filename);
  if (!object) {
    return new Response("Archivo no encontrado.", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
};
