const NOTION_VERSION = "2026-03-11";
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

const NOTION_MIME_TYPES: Record<string, string> = {
  // Archives & Compressed
  zip: "application/zip",
  gz: "application/gzip",
  gzip: "application/gzip",
  tar: "application/x-tar",
  "7z": "application/x-7z-compressed",
  bz2: "application/x-bzip2",
  rar: "application/vnd.rar",

  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  ico: "image/vnd.microsoft.icon",
  heic: "image/heic",
  avif: "image/avif",
  apng: "image/apng",
  // Creative / Design image formats
  psd: "image/vnd.adobe.photoshop",
  psb: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  eps: "application/postscript",
  indd: "application/x-indesign",
  raw: "image/x-raw",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  dng: "image/x-adobe-dng",
  xcf: "image/x-xcf",
  sketch: "application/zip",
  fig: "application/octet-stream",

  // Audio
  aac: "audio/aac",
  adts: "audio/aac",
  mid: "audio/midi",
  midi: "audio/midi",
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  weba: "audio/webm",
  flac: "audio/x-flac",

  // Video
  amv: "video/x-amv",
  asf: "video/x-ms-asf",
  wmv: "video/x-ms-asf",
  avi: "video/x-msvideo",
  f4v: "video/x-f4v",
  flv: "video/x-flv",
  gifv: "video/mp4",
  m4v: "video/mp4",
  mp4: "video/mp4",
  mkv: "video/webm",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime",
  mpeg: "video/mpeg",
  ogv: "video/ogg",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",

  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  dot: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  xls: "application/vnd.ms-excel",
  xlt: "application/vnd.ms-excel",
  xla: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  ppt: "application/vnd.ms-powerpoint",
  pot: "application/vnd.ms-powerpoint",
  pps: "application/vnd.ms-powerpoint",
  ppa: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
  rtf: "application/rtf",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  epub: "application/epub+zip",
  xml: "text/xml",
  css: "text/css",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  ics: "text/calendar",
  yaml: "text/yaml",
  yml: "text/yaml",
  tsv: "text/tab-separated-values",

  // CAD / 3D
  dwg: "application/acad",
  dxf: "application/dxf",
  stl: "model/stl",
  obj: "model/obj",
  fbx: "application/octet-stream",
  blend: "application/x-blender",

  // Programming / data
  js: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  java: "text/x-java",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c",
  rs: "text/x-rust",
  go: "text/x-go",
  rb: "text/x-ruby",
  php: "text/x-php",
  swift: "text/x-swift",
  kt: "text/x-kotlin",
  sql: "application/sql",
  sh: "application/x-sh",
  bat: "application/x-bat",
  ps1: "application/x-powershell",
  log: "text/plain",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  toml: "text/plain",
};

/**
 * Compute upload name and content type.
 *
 * - Known extensions → use standardized MIME from our map
 * - Unknown extensions → add .zip suffix and use application/zip
 *   (Notion rejects unknown extensions; the frontend compresses these to real ZIPs
 *    using JSZip before uploading, so the .zip extension is truthful)
 */
function resolveUploadMeta(filename: string, mimeType: string): { uploadName: string; contentType: string; extModified: boolean } {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = filename;
  let contentType = mimeType || "application/octet-stream";
  let extModified = false;

  const standardMime = NOTION_MIME_TYPES[ext];
  if (standardMime) {
    // Use the standardized MIME type (avoids browser variations like x-zip-compressed)
    contentType = standardMime;
  } else {
    // Notion rejects unknown extensions — wrap as .zip
    uploadName = filename + ".zip";
    contentType = "application/zip";
    extModified = true;
  }
  // else: keep the browser-provided MIME type

  return { uploadName, contentType, extModified };
}

// Re-export for use in upload-init.ts and other modules
export { resolveUploadMeta, NOTION_VERSION, NOTION_BASE };

/**
 * Upload a small file (≤ 20MB) directly to Notion using single-part upload.
 * Step 1: create the upload object → Step 2: send the file content.
 *
 * The file is re-wrapped as a Blob with the standardized content type to
 * prevent MIME type mismatch errors from the Notion API.
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

  // Step 2: send the file content — re-wrap as Blob with correct MIME
  const fileBuffer = await file.arrayBuffer();
  const fileBlob = new Blob([fileBuffer], { type: contentType });

  const sendForm = new FormData();
  sendForm.append("file", fileBlob, uploadName);

  const sendUrl = upload.upload_url || `${NOTION_BASE}/file_uploads/${upload.id}/send`;

  const sendRes = await fetch(sendUrl, {
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
 * NOTE: This function is used by the Express server (server.ts) where the full
 *       file is available in memory. For Cloudflare Pages, browser-side chunking
 *       is used instead (upload-init / upload-part / upload-complete endpoints).
 */
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MiB per chunk

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

  // Construct URLs — fall back to standard pattern if not in response
  const uploadUrl = upload.upload_url || `${NOTION_BASE}/file_uploads/${upload.id}/send`;
  const completeUrl = upload.complete_url || `${NOTION_BASE}/file_uploads/${upload.id}/complete`;

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
