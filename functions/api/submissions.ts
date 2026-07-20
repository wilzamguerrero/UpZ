import { json, notionFetch, type Env } from "../_shared/notion";

/** Reads the effective Notion secret (KV override > env). */
async function getSecret(env: Env): Promise<string> {
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
  return notionSecret;
}

/** Lists ALL child block ids of a Notion block/page, following pagination. */
async function listAllChildBlockIds(blockId: string, token: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : `?page_size=100`;
    const data = await notionFetch("GET", `/blocks/${blockId}/children${query}`, token);
    for (const block of data.results || []) {
      if (block?.id) ids.add(block.id);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return ids;
}

/**
 * GET /api/submissions
 * Returns logged submissions from KV, RECONCILED against Notion so the admin
 * view mirrors Notion: submissions whose toggle block was deleted in Notion are
 * removed from the list (and pruned from KV). Legacy records without a stored
 * notionBlockId are kept as-is (cannot be verified).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  if (!SUBMISSIONS_KV) {
    return json({ success: true, submissions: [] });
  }

  let submissions: any[] = [];
  try {
    const raw = await SUBMISSIONS_KV.get("submissions");
    submissions = raw ? JSON.parse(raw) : [];
  } catch {
    return json({ success: true, submissions: [] });
  }

  const notionSecret = await getSecret(context.env);
  if (!notionSecret || submissions.length === 0) {
    return json({ success: true, submissions });
  }

  // Group verifiable submissions (those with a notionBlockId) by project.
  const byProject: Record<string, any[]> = {};
  for (const sub of submissions) {
    if (sub?.notionBlockId && sub?.projectId) {
      (byProject[sub.projectId] ||= []).push(sub);
    }
  }

  // Fetch the current set of block ids for each involved project.
  const existingByProject: Record<string, Set<string> | null> = {};
  await Promise.all(
    Object.keys(byProject).map(async (projectId) => {
      try {
        existingByProject[projectId] = await listAllChildBlockIds(projectId, notionSecret);
      } catch {
        // On error we cannot verify this project — keep its submissions untouched.
        existingByProject[projectId] = null;
      }
    })
  );

  const removedIds: string[] = [];
  const kept = submissions.filter((sub) => {
    if (!sub?.notionBlockId || !sub?.projectId) return true; // legacy / unverifiable → keep
    const existing = existingByProject[sub.projectId];
    if (!existing) return true; // couldn't verify this project → keep
    if (existing.has(sub.notionBlockId)) return true; // still in Notion → keep
    removedIds.push(sub.id); // deleted in Notion → drop
    return false;
  });

  // Persist the pruned list + clean up per-person keys.
  if (removedIds.length > 0) {
    try {
      await SUBMISSIONS_KV.put("submissions", JSON.stringify(kept));
    } catch {
      // Non-critical
    }
    for (const sub of submissions) {
      if (removedIds.includes(sub.id)) {
        try {
          await SUBMISSIONS_KV.delete(`person:${sub.projectId}:${sub.id}`);
        } catch {
          // Non-critical
        }
      }
    }
  }

  return json({ success: true, submissions: kept });
};
