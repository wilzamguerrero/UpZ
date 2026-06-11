const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

export interface Env {
  NOTION_SECRET: string;
  NOTION_ID_PAGE: string;
  SUBMISSIONS_KV?: KVNamespace;
  FILES_BUCKET?: R2Bucket;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function notionFetch(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<any> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    (init as any).body = JSON.stringify(body);
  }
  const res = await fetch(`${NOTION_BASE}${path}`, init);
  return res.json();
}

/** List children blocks of a Notion block/page */
export async function listChildren(blockId: string, token: string): Promise<any> {
  return notionFetch("GET", `/blocks/${blockId}/children`, token);
}

/** Append children blocks to a Notion block/page */
export async function appendChildren(blockId: string, children: unknown[], token: string): Promise<any> {
  return notionFetch("POST", `/blocks/${blockId}/children`, token, { children });
}

/** Update a Notion block */
export async function updateBlock(blockId: string, update: unknown, token: string): Promise<any> {
  return notionFetch("PATCH", `/blocks/${blockId}`, token, update);
}

/** Delete a Notion block */
export async function deleteBlock(blockId: string, token: string): Promise<any> {
  return notionFetch("DELETE", `/blocks/${blockId}`, token);
}
