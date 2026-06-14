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

interface DbColumn {
  id: string;
  name: string;
  type: "text" | "number" | "select" | "checkbox" | "date";
  options?: string[];
}

/** Build a Notion database properties object from control columns + submitter fields. */
function buildProperties(columns: DbColumn[], submitterFields: string[] = []): Record<string, any> {
  // Title property is mandatory in every Notion database.
  const properties: Record<string, any> = {
    Nombre: { title: {} },
    Correo: { email: {} },
    "Fecha de envío": { date: {} },
    Archivos: { rich_text: {} },
  };

  // Submitter-filled custom fields become rich_text columns.
  for (const label of submitterFields) {
    if (label && !properties[label]) {
      properties[label] = { rich_text: {} };
    }
  }

  for (const col of columns) {
    if (!col.name) continue;
    switch (col.type) {
      case "number":
        properties[col.name] = { number: {} };
        break;
      case "select":
        properties[col.name] = {
          select: {
            options: (col.options || []).map((o) => ({ name: o })),
          },
        };
        break;
      case "checkbox":
        properties[col.name] = { checkbox: {} };
        break;
      case "date":
        properties[col.name] = { date: {} };
        break;
      default:
        properties[col.name] = { rich_text: {} };
    }
  }
  return properties;
}

/**
 * POST /api/projects/create-db
 * Body: { projectId, title, dbColumns }
 * Creates a native Notion database as a child of the project page/toggle.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { notionSecret } = await getCredentials(context.env);

  let body: { projectId?: string; title?: string; dbColumns?: DbColumn[]; submitterFields?: string[] };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const projectId = cleanNotionId(body.projectId || "");
  const title = (body.title || "Entregas").trim();
  const dbColumns = Array.isArray(body.dbColumns) ? body.dbColumns : [];
  const submitterFields = Array.isArray(body.submitterFields) ? body.submitterFields : [];

  if (!projectId) return json({ error: "El ID del proyecto es obligatorio." }, 400);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    const database = await notionFetch("POST", "/databases", notionSecret, {
      parent: { type: "page_id", page_id: projectId },
      title: [{ type: "text", text: { content: `${title} — Entregas` } }],
      properties: buildProperties(dbColumns, submitterFields),
    });

    return json({ success: true, databaseId: database.id });
  } catch (err: any) {
    return json(
      { error: `No se pudo crear la base de datos en Notion: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};
