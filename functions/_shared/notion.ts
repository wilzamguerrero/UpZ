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
  // Images
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "tif", "ico", "heic", "avif", "apng",
  // Video
  "mp4", "m4v", "ogv", "webm", "mov", "avi", "mkv", "flv", "3gp", "3g2", "mpeg", "amv", "asf", "wmv", "f4v", "gifv", "qt",
  // Audio
  "mp3", "wav", "m4a", "ogg", "aac", "mid", "midi", "mpga", "m4b", "oga", "opus", "wma", "weba", "flac",
  // Documents
  "pdf", "doc", "docx", "dot", "dotx", "xls", "xlsx", "xlt", "xltx", "xla", "ppt", "pptx", "pot", "potx", "pps", "ppa",
  "txt", "csv", "html", "htm", "css", "js", "ts", "json", "xml", "md", "markdown", "rtf", "epub",
  "odt", "ods", "odp", "ics", "yaml", "yml", "tsv",
  // Archives
  "zip", "rar", "tar", "gz", "gzip", "7z", "bz2",
]);

/** Compute upload name and content type, adding .zip for unsupported extensions */
function resolveUploadMeta(filename: string, mimeType: string): { uploadName: string; contentType: string; extModified: boolean } {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = filename;
  let contentType = mimeType || "application/octet-stream";
  let extModified = false;

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    uploadName = filename + ".zip";
    contentType = "application/zip";
    extModified = true;
  }

  return { uploadName, contentType, extModified };
}

/**
 * Upload a small file (≤ 20MB) directly to Notion using single-part upload.
 * Step 1: create the upload object → Step 2: send the file content.
 */
export async function uploadFileToNotion(
  file: File,
  token: string
): Promise<{ id: string; finalName: string; originalName: string; extModified: boolean }> {
  const { uploadName, contentType, extModified } = resolveUploadMeta(file.name, file.type);

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

  const upload = (await createRes.json()) as any;
  if (!upload.id) {
    throw new Error(`No se pudo crear el upload en Notion: ${JSON.stringify(upload)}`);
  }

  // Step 2: send the file content
  const sendForm = new FormData();
  sendForm.append("file", file, uploadName);

  const sendRes = await fetch(upload.upload_url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: sendForm,
  });

  const sent = (await sendRes.json()) as any;
  if (sent.status !== "uploaded" && sent.status !== "complete") {
    throw new Error(`Error al enviar archivo a Notion: ${JSON.stringify(sent)}`);
  }

  return {
    id: upload.id as string,
    finalName: uploadName,
    originalName: file.name,
    extModified,
  };
}

/**
 * Upload a large file (> 20MB, up to 5GB) to Notion using multi-part upload.
 *
 * Flow:
 *   1. Create a multi_part file upload → get upload_url and complete_url
 *   2. Split file into chunks of ~10MB, send each with part_number
 *   3. POST to complete_url to finalize
 */
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MiB per chunk (Notion recommends 10MB, min 5MB max 20MB)

export async function uploadLargeFileToNotion(
  file: File,
  token: string
): Promise<{ id: string; finalName: string; originalName: string; extModified: boolean }> {
  const { uploadName, contentType, extModified } = resolveUploadMeta(file.name, file.type);

  const totalSize = file.size;
  const numberOfParts = Math.ceil(totalSize / CHUNK_SIZE);

  // Step 1: Create multi-part file upload
  const createRes = await fetch(`${NOTION_BASE}/file_uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "multi_part",
      number_of_parts: numberOfParts,
      filename: uploadName,
      content_type: contentType,
    }),
  });

  const upload = (await createRes.json()) as any;
  if (!upload.id) {
    throw new Error(`No se pudo crear el upload multi-part en Notion: ${JSON.stringify(upload)}`);
  }

  const uploadUrl = upload.upload_url;
  const completeUrl = upload.complete_url;

  if (!uploadUrl || !completeUrl) {
    throw new Error(`Notion no devolvió upload_url o complete_url: ${JSON.stringify(upload)}`);
  }

  // Step 2: Upload each chunk sequentially
  const fileBuffer = await file.arrayBuffer();

  for (let partNumber = 1; partNumber <= numberOfParts; partNumber++) {
    const start = (partNumber - 1) * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = fileBuffer.slice(start, end);

    const partForm = new FormData();
    partForm.append("part_number", String(partNumber));
    partForm.append(
      "file",
      new Blob([chunk], { type: contentType }),
      uploadName
    );

    const partRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
      body: partForm,
    });

    if (!partRes.ok) {
      const errText = await partRes.text();
      throw new Error(
        `Error al enviar parte ${partNumber}/${numberOfParts} de "${file.name}": ${partRes.status} - ${errText}`
      );
    }
  }

  // Step 3: Complete the multi-part upload
  const completeRes = await fetch(completeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });

  const completed = (await completeRes.json()) as any;
  if (completed.status !== "uploaded" && completed.status !== "complete") {
    throw new Error(`Error al completar upload multi-part en Notion: ${JSON.stringify(completed)}`);
  }

  return {
    id: upload.id as string,
    finalName: uploadName,
    originalName: file.name,
    extModified,
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

