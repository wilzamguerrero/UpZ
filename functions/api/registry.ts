import { json, appendChildren, updateBlock, notionFetch, cleanNotionId, type Env } from "../_shared/notion";

/** Marker for the people-registry JSON block stored inside a PARENT project. */
const REGISTRY_MARKER = "__envi_registry__";

async function getConfig(env: Env): Promise<{ notionSecret: string; parentPageId: string }> {
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
  return { notionSecret, parentPageId: cleanNotionId(parentPageId) };
}

const parseJsonBlock = (block: any): any => {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
};

/** Notion caps each rich_text item at 2000 chars, so split long JSON into chunks. */
function toRichTextChunks(content: string) {
  const chunks: any[] = [];
  for (let i = 0; i < content.length; i += 2000) {
    chunks.push({ type: "text", text: { content: content.slice(i, i + 2000) } });
  }
  return chunks.length ? chunks : [{ type: "text", text: { content: "" } }];
}

/** Lists ALL children of a block, following pagination. */
async function listAllChildren(blockId: string, token: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor
      ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100`
      : `?page_size=100`;
    const data = await notionFetch("GET", `/blocks/${blockId}/children${q}`, token);
    for (const b of data.results || []) out.push(b);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

export interface RegistryPerson {
  document: string;
  name: string;
  email: string;
  phone: string;
  registeredAt: string;
}

/** A registered person keyed by document (identity across all child activities). */
function normalizePerson(body: any): Omit<RegistryPerson, "registeredAt"> {
  return {
    document: String(body?.document || "").trim(),
    name: String(body?.name || "").trim(),
    email: String(body?.email || "").trim(),
    phone: String(body?.phone || "").trim(),
  };
}

/** Finds the registry code block among a parent's direct children. */
function findRegistryBlock(children: any[]): any | null {
  return (
    children.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonBlock(b);
      return parsed && parsed[REGISTRY_MARKER] && typeof parsed[REGISTRY_MARKER] === "object";
    }) || null
  );
}

/** True when this parent's meta JSON block has registrationMode enabled. */
function isRegistrationOn(children: any[]): boolean {
  return children.some((b: any) => {
    if (b.type !== "code" || b.code?.language !== "json") return false;
    const parsed = parseJsonBlock(b);
    return parsed && parsed.registrationMode === true;
  });
}

function readPeople(block: any): RegistryPerson[] {
  const data = block ? parseJsonBlock(block)?.[REGISTRY_MARKER] : null;
  const people = data && Array.isArray(data.people) ? data.people : [];
  return people as RegistryPerson[];
}

async function writeRegistry(
  parentId: string,
  parentName: string,
  people: RegistryPerson[],
  existingBlock: any | null,
  token: string
): Promise<void> {
  const payload = { [REGISTRY_MARKER]: { parentId, parentName, updatedAt: new Date().toISOString(), people } };
  const codeBody = {
    code: {
      rich_text: toRichTextChunks(JSON.stringify(payload, null, 2)),
      language: "json",
      caption: [{ type: "text", text: { content: `${parentName} registro` } }],
    },
  };
  if (existingBlock) {
    await updateBlock(existingBlock.id, codeBody, token);
  } else {
    await appendChildren(parentId, [{ object: "block", type: "code", ...codeBody }], token);
  }
}

/**
 * POST /api/registry  — self-registration into a parent project's roster.
 * Body: { parentId, parentName?, name, document, email, phone? }
 * Upserts the person by document. Requires the parent to be in registration mode.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const parentId = String(body.parentId || "").trim();
  const parentName = String(body.parentName || "Registro").trim();
  const person = normalizePerson(body);

  if (!parentId) return json({ error: "Falta el proyecto padre." }, 400);
  if (!person.document) return json({ error: "El documento es obligatorio." }, 400);
  if (!person.name) return json({ error: "El nombre es obligatorio." }, 400);
  if (!person.email) return json({ error: "El correo es obligatorio." }, 400);

  const { notionSecret } = await getConfig(context.env);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    const children = await listAllChildren(parentId, notionSecret);
    if (!isRegistrationOn(children)) {
      return json({ error: "Este proyecto no está en modo registro." }, 400);
    }

    const block = findRegistryBlock(children);
    const people = readPeople(block);

    const key = person.document.toLowerCase();
    const idx = people.findIndex((p) => (p.document || "").trim().toLowerCase() === key);
    let saved: RegistryPerson;
    if (idx >= 0) {
      // Update existing person (keep original registeredAt).
      saved = { ...people[idx], ...person, registeredAt: people[idx].registeredAt || new Date().toISOString() };
      people[idx] = saved;
    } else {
      saved = { ...person, registeredAt: new Date().toISOString() };
      people.push(saved);
    }

    await writeRegistry(parentId, parentName, people, block, notionSecret);
    return json({ success: true, person: saved, updated: idx >= 0 });
  } catch (err: any) {
    return json({ error: `No se pudo registrar: ${err.message || "error desconocido"}.` }, 500);
  }
};

/**
 * GET /api/registry?parentId=<id>[&document=<doc>]
 * - With document: returns the single matching person (for child autofill).
 * - Without: returns the full roster (for the admin consolidated table).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const parentId = (url.searchParams.get("parentId") || "").trim();
  const document = (url.searchParams.get("document") || "").trim();
  if (!parentId) return json({ error: "Falta el proyecto padre." }, 400);

  const { notionSecret } = await getConfig(context.env);
  if (!notionSecret) return json({ error: "Notion no está configurado." }, 400);

  try {
    const children = await listAllChildren(parentId, notionSecret);
    const people = readPeople(findRegistryBlock(children));
    if (document) {
      const key = document.toLowerCase();
      const person = people.find((p) => (p.document || "").trim().toLowerCase() === key) || null;
      return json({ success: true, person });
    }
    return json({ success: true, people });
  } catch (err: any) {
    return json({ error: `No se pudo leer el registro: ${err.message || "error desconocido"}.` }, 500);
  }
};
