import { json, type Env } from "../_shared/notion";

/** GET /api/submissions – returns logged submissions from KV */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  if (!SUBMISSIONS_KV) {
    // No KV binding configured – return empty list gracefully
    return json({ success: true, submissions: [] });
  }

  try {
    const raw = await SUBMISSIONS_KV.get("submissions");
    const submissions = raw ? JSON.parse(raw) : [];
    return json({ success: true, submissions });
  } catch {
    return json({ success: true, submissions: [] });
  }
};
