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

const ALLOWED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff",
  "mp4", "m4v", "ogv", "webm", "mov",
  "mp3", "wav", "m4a", "ogg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "html", "css", "js", "ts", "json", "xml", "md",
  "zip", "rar", "tar", "gz"
]);

/**
 * Upload a file directly to Notion using the file upload API.
 * Step 1: create the upload object → Step 2: send the file content.
 * Returns the file_upload id and info.
 */
export async function uploadFileToNotion(
  file: File,
  token: string
): Promise<{ id: string; finalName: string; originalName: string; extModified: boolean }> {
  const dotIndex = file.name.lastIndexOf(".");
  const ext = dotIndex !== -1 ? file.name.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = file.name;
  let contentType = file.type || "application/octet-stream";
  let extModified = false;

  // If file doesn't have a supported extension, change it so Notion won't reject it
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    uploadName = file.name + ".zip";
    contentType = "application/zip";
    extModified = true;
  }

  // Step 1: create the file upload
  const createRes = await fetch(`${NOTION_BASE}/file_uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: uploadName,
      content_type: contentType,
    }),
  });

  const upload = await createRes.json();
  if (!upload.id) {
    throw new Error(`No se pudo crear el upload en Notion: ${JSON.stringify(upload)}`);
  }

  // Step 2: send the file content
  const sendForm = new FormData();
  sendForm.append("file", file, uploadName);

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

  return {
    id: upload.id as string,
    finalName: uploadName,
    originalName: file.name,
    extModified
  };
}

/** Clean a Notion ID from any dirty pasted text or URL */
export function cleanNotionId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const uuidWithDashesRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  const matchDashes = trimmed.match(uuidWithDashesRegex);
  if (matchDashes) {
    return matchDashes[0];
  }
  const uuidPlainRegex = /[a-f0-9]{32}/i;
  const matchPlain = trimmed.match(uuidPlainRegex);
  if (matchPlain) {
    return matchPlain[0];
  }
  return trimmed;
}

