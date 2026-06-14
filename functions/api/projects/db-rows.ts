import { json, notionFetch, cleanNotionId, type Env } from "../../_shared/notion";

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

/** Flatten a Notion page property into a plain string/value for the UI table. */
function readProp(prop: any): any {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title || []).map((t: any) => t.plain_text).join("");
    case "rich_text":
      return (prop.rich_text || []).map((t: any) => t.plain_text).join("");
    case "email":
      return prop.email || "";
    case "number":
      return prop.number ?? "";
    case "select":
      return prop.select?.name || "";
    case "checkbox":
      return !!prop.checkbox;
    case "date":
      return prop.date?.start || "";
    default:
      return "";
  }
}

/**
 * GET /api/projects/db-rows?databaseId=xxx
 * Returns all rows of a project's Notion database as flat objects.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);
  const url = new URL(context.request.url);
  const databaseId = cleanNotionId(url.searchParams.get("databaseId") || "");

  if (!databaseId) return json({ error: "databaseId es obligatorio." }, 400);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    const data = await notionFetch("POST", `/databases/${databaseId}/query`, notionSecret, {});
    const rows = (data.results || []).map((page: any) => {
      const values: Record<string, any> = {};
      for (const [key, prop] of Object.entries(page.properties || {})) {
        values[key] = readProp(prop);
      }
      return { pageId: page.id, values };
    });
    return json({ success: true, rows });
  } catch (err: any) {
    return json(
      { error: `No se pudieron leer las filas: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};

/**
 * PATCH /api/projects/db-rows
 * Body: { pageId, updates: { propName: { type, value } } }
 * Updates control columns (nota, estado, comentarios...) of a row.
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);

  let body: { pageId?: string; updates?: Record<string, { type: string; value: any }> };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const pageId = cleanNotionId(body.pageId || "");
  const updates = body.updates || {};

  if (!pageId) return json({ error: "pageId es obligatorio." }, 400);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  const properties: Record<string, any> = {};
  for (const [name, { type, value }] of Object.entries(updates)) {
    switch (type) {
      case "number":
        properties[name] = { number: value === "" || value === null ? null : Number(value) };
        break;
      case "select":
        properties[name] = { select: value ? { name: String(value) } : null };
        break;
      case "checkbox":
        properties[name] = { checkbox: !!value };
        break;
      case "date":
        properties[name] = { date: value ? { start: String(value) } : null };
        break;
      default:
        properties[name] = { rich_text: [{ type: "text", text: { content: String(value ?? "") } }] };
    }
  }

  try {
    await notionFetch("PATCH", `/pages/${pageId}`, notionSecret, { properties });
    return json({ success: true });
  } catch (err: any) {
    return json(
      { error: `No se pudo actualizar la fila: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};
