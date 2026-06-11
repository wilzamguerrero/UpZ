const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

export interface Env {
  NOTION_SECRET: string;
  NOTION_ID_PAGE: string;
  SUBMISSIONS_KV?: KVNamespace;
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
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.code || `HTTP ${res.status}`;
    throw new Error(`Notion API error (${res.status}): ${msg}`);
  }
  return data;
}

/** List children blocks of a Notion block/page */
export async function listChildren(blockId: string, token: string): Promise<any> {
  return notionFetch("GET", `/blocks/${blockId}/children`, token);
}

/** Append children blocks to a Notion block/page */
export async function appendChildren(blockId: string, children: unknown[], token: string): Promise<any> {
  return notionFetch("PATCH", `/blocks/${blockId}/children`, token, { children });
}

/** Update a Notion block */
export async function updateBlock(blockId: string, update: unknown, token: string): Promise<any> {
  return notionFetch("PATCH", `/blocks/${blockId}`, token, update);
}

/** Delete a Notion block */
export async function deleteBlock(blockId: string, token: string): Promise<any> {
  return notionFetch("DELETE", `/blocks/${blockId}`, token);
}

/**
 * Upload a file directly to Notion using the file upload API.
 * Step 1: create the upload object → Step 2: send the file content.
 * Returns the file_upload id to reference in blocks.
 */
export async function uploadFileToNotion(
  file: File,
  token: string
): Promise<string> {
  // Step 1: create the file upload
  const createRes = await fetch(`${NOTION_BASE}/file_uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || "application/octet-stream",
    }),
  });

  const upload = await createRes.json();
  if (!upload.id) {
    throw new Error(`No se pudo crear el upload en Notion: ${JSON.stringify(upload)}`);
  }

  // Step 2: send the file content
  const sendForm = new FormData();
  sendForm.append("file", file, file.name);

  const sendRes = await fetch(`${NOTION_BASE}/file_uploads/${upload.id}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      // NO Content-Type header — browser sets it with boundary for multipart
    },
    body: sendForm,
  });

  const sent = await sendRes.json();
  if (sent.status !== "uploaded" && sent.status !== "complete") {
    throw new Error(`Error al enviar archivo a Notion: ${JSON.stringify(sent)}`);
  }

  return upload.id as string;
}
