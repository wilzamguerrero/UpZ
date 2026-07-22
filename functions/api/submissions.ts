import { json, notionFetch, cleanNotionId, type Env } from "../_shared/notion";
import { collectSubmissions, type ListChildrenFn } from "../_shared/submissions";

/** Reads the effective Notion credentials (KV override > env vars). */
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

/**
 * GET /api/submissions[?projectId=xxx]
 * Rebuilds the submissions list straight from Notion (source of truth), so it
 * works the same on any platform without depending on KV.
 * - Without projectId: light list of every submission (for counts).
 * - With projectId: that project's submissions INCLUDING files + grades.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { notionSecret, parentPageId } = await getConfig(context.env);

  if (!notionSecret || !parentPageId) {
    return json({ success: true, submissions: [] });
  }

  const url = new URL(context.request.url);
  const projectId = url.searchParams.get("projectId") || undefined;

  const list: ListChildrenFn = (blockId: string) => listAllChildren(blockId, notionSecret);

  try {
    const submissions = await collectSubmissions(parentPageId, list, {
      filesForProjectId: projectId,
    });
    return json({ success: true, submissions });
  } catch (err: any) {
    return json({ success: true, submissions: [], error: err?.message });
  }
};
