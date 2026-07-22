import express from "express";
import path from "path";
import fs from "fs";
import { Readable } from "node:stream";
import multer from "multer";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { Client } from "@notionhq/client";
import {
  buildPreviewSvg,
  injectPreviewIntoHtml,
  isRootLikePath,
  normalizeAppearance,
  resolvePreview,
  type PreviewProject,
} from "./functions/_shared/preview";
import { sendGmailMessage, buildReceiptEmail, hasGmailCredentials } from "./functions/_shared/gmail";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Middleware for parsing JSON and URL encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Paths
const CONFIG_FILE = path.join(process.cwd(), "notion-config.json");
const SUBMISSIONS_FILE = path.join(process.cwd(), "submissions.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded files statically
app.use("/uploads", express.static(UPLOADS_DIR));

// Helper: clean Notion page/block ID if user pasted a URL
function cleanNotionId(input: string): string {
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

const BG_IMG_BLOCK_CAPTION = "__CERT_BG_IMG__";
const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VER = "2026-03-11";

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
  sql: "application/sql",
  sh: "application/x-sh",
  log: "text/plain",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  toml: "text/plain",
};

function resolveUploadMeta(filename: string, mimeType: string): { uploadName: string; contentType: string; extModified: boolean } {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = filename;
  let contentType = mimeType || "application/octet-stream";
  let extModified = false;

  const standardMime = NOTION_MIME_TYPES[ext];
  if (standardMime) {
    contentType = standardMime;
  } else {
    uploadName = filename + ".zip";
    contentType = "application/zip";
    extModified = true;
  }

  return { uploadName, contentType, extModified };
}

// Helper: upload background image to Notion as a native Notion image block
async function uploadBgImageToNotion(
  notionSecret: string,
  toggleBlockId: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ blockId: string; imageUrl: string } | null> {
  try {
    const notion = new Client({ auth: notionSecret });

    const { uploadName, contentType } = resolveUploadMeta(filename, mimeType);

    // Step 1: Init single-part file upload
    const initResp = await fetch(`${NOTION_API_BASE_URL}/file_uploads`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_API_VER,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "single_part", filename: uploadName, content_type: contentType }),
    });
    if (!initResp.ok) {
      console.error("Notion file upload init failed:", await initResp.text());
      return null;
    }
    const initData = (await initResp.json()) as any;
    const { id: uploadId, upload_url } = initData;

    // Step 2: Upload binary content via multipart form
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: contentType }), uploadName);
    const uploadResp = await fetch(upload_url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_API_VER,
      },
      body: formData,
    });
    if (!uploadResp.ok) {
      console.error("Notion file upload content failed:", await uploadResp.text());
      return null;
    }

    // Step 3: Remove old bg image blocks in that toggle list block
    const existingChildren = await notion.blocks.children.list({ block_id: toggleBlockId });
    const existingBlocks: any[] = existingChildren.results || [];
    const oldImgBlocks = existingBlocks.filter((b: any) =>
      b.type === "image" &&
      (b.image?.caption || []).map((t: any) => t.plain_text).join("") === BG_IMG_BLOCK_CAPTION
    );
    for (const block of oldImgBlocks) {
      await notion.blocks.delete({ block_id: block.id }).catch(() => null);
    }

    // Step 4: Append image block referencing the uploaded file
    const appendResp = await notion.blocks.children.append({
      block_id: toggleBlockId,
      children: [{
        object: "block",
        type: "image",
        image: {
          type: "file_upload",
          file_upload: { id: uploadId },
          caption: [{ type: "text", text: { content: BG_IMG_BLOCK_CAPTION } }],
        } as any,
      } as any],
    });
    const newBlockId = (appendResp.results as any[])[0]?.id;
    if (!newBlockId) return null;

    // Step 5: Retrieve the block to get the fresh signed URL (retry up to 5 times)
    let imageUrl = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 400 + attempt * 600));
      try {
        const blockDetail: any = await notion.blocks.retrieve({ block_id: newBlockId });
        imageUrl = blockDetail?.image?.file?.url || blockDetail?.image?.external?.url || "";
        if (imageUrl) break;
      } catch { /* retry */ }
    }

    return { blockId: newBlockId, imageUrl };
  } catch (e: any) {
    console.error("uploadBgImageToNotion error:", e.message);
    return null;
  }
}

// Helper: upload a generic file block to Notion returning the upload ID (single-part, ≤ 20MB)
async function uploadFileObjectToNotion(
  notionSecret: string,
  pathname: string,
  originalname: string,
  mimeType: string
): Promise<{ id: string; finalName: string; extModified: boolean }> {
  const { uploadName, contentType, extModified } = resolveUploadMeta(originalname, mimeType);

  // Step 1: Init single-part file upload
  const initResp = await fetch(`${NOTION_API_BASE_URL}/file_uploads`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionSecret}`,
      "Notion-Version": NOTION_API_VER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "single_part", filename: uploadName, content_type: contentType }),
  });
  if (!initResp.ok) {
    const errText = await initResp.text();
    throw new Error(`Init upload failed: ${errText}`);
  }
  const initData = (await initResp.json()) as any;
  const { id: uploadId, upload_url } = initData;

  // Step 2: Upload binary content
  const fileBuffer = fs.readFileSync(pathname);
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(fileBuffer)], { type: contentType }), uploadName);

  const uploadResp = await fetch(upload_url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionSecret}`,
      "Notion-Version": NOTION_API_VER,
    },
    body: formData,
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`Content upload failed: ${errText}`);
  }

  return {
    id: uploadId,
    finalName: uploadName,
    extModified,
  };
}

// Helper: upload a large file (> 20MB) to Notion using multi-part chunked upload
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MiB per chunk

async function uploadLargeFileObjectToNotion(
  notionSecret: string,
  pathname: string,
  originalname: string,
  mimeType: string
): Promise<{ id: string; finalName: string; extModified: boolean }> {
  const { uploadName, contentType, extModified } = resolveUploadMeta(originalname, mimeType);

  const fileBuffer = fs.readFileSync(pathname);
  const totalSize = fileBuffer.length;
  const numberOfParts = Math.ceil(totalSize / CHUNK_SIZE);

  // Step 1: Create multi-part file upload
  const initResp = await fetch(`${NOTION_API_BASE_URL}/file_uploads`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionSecret}`,
      "Notion-Version": NOTION_API_VER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "multi_part",
      number_of_parts: numberOfParts,
      filename: uploadName,
      content_type: contentType,
    }),
  });
  if (!initResp.ok) {
    const errText = await initResp.text();
    throw new Error(`Init multi-part upload failed: ${errText}`);
  }
  const initData = (await initResp.json()) as any;
  const { id: uploadId, upload_url, complete_url } = initData;

  // Construct URLs — fall back to standard pattern if not in response
  const uploadUrl = upload_url || `${NOTION_API_BASE_URL}/file_uploads/${uploadId}/send`;
  const completeUrl = complete_url || `${NOTION_API_BASE_URL}/file_uploads/${uploadId}/complete`;

  if (!uploadUrl) {
    throw new Error(`Notion did not return upload_url or complete_url: ${JSON.stringify(initData)}`);
  }

  // Step 2: Upload each chunk sequentially
  for (let partNumber = 1; partNumber <= numberOfParts; partNumber++) {
    const start = (partNumber - 1) * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = fileBuffer.subarray(start, end);

    const partForm = new FormData();
    partForm.append("part_number", String(partNumber));
    partForm.append(
      "file",
      new Blob([new Uint8Array(chunk)], { type: contentType }),
      uploadName
    );

    const partResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_API_VER,
      },
      body: partForm,
    });

    if (!partResp.ok) {
      const errText = await partResp.text();
      throw new Error(`Error uploading part ${partNumber}/${numberOfParts}: ${partResp.status} - ${errText}`);
    }
  }

  // Step 3: Complete the multi-part upload
  const completeResp = await fetch(completeUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionSecret}`,
      "Notion-Version": NOTION_API_VER,
      "Content-Type": "application/json",
    },
  });
  if (!completeResp.ok) {
    const errText = await completeResp.text();
    throw new Error(`Error completing multi-part upload: ${completeResp.status} - ${errText}`);
  }

  return {
    id: uploadId,
    finalName: uploadName,
    extModified,
  };
}

// Helper: load credentials
function loadConfig() {
  let notionSecret = process.env.NOTION_SECRET || "";
  let parentPageId = process.env.NOTION_ID_PAGE || process.env.NOTION_PARENT_PAGE_ID || "";

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (saved.notionSecret) notionSecret = saved.notionSecret;
      if (saved.parentPageId) parentPageId = saved.parentPageId;
    } catch (e) {
      console.error("Error reading config file:", e);
    }
  }

  parentPageId = cleanNotionId(parentPageId);
  return { notionSecret, parentPageId };
}

// Helper: save credentials
function saveConfig(config: { notionSecret: string; parentPageId: string }) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// Project Meta (copywriting customization per project) helper functions
const PROJECT_META_FILE = path.join(process.cwd(), "project-meta.json");
const APPEARANCE_FILE = path.join(process.cwd(), "appearance.json");
const DEFAULT_APPEARANCE = {
  themeId: "brutal",
  accentColor: "#f5f011",
  homeTitle: "ENVI",
  homeTitleSize: 56,
  homeMessage: "ENVI agiliza la entrega de archivos por proyecto. Desarrollado por wilzamguerrero.",
  homeIcon: "Sparkles",
  homeBgColor: "#050505",
};

function normalizeAppearanceColor(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : fallback;
}

function normalizeAppearanceText(value: unknown, fallback: string, maxLength: number) {
  const raw = typeof value === "string" ? value.trim() : "";
  return (raw || fallback).slice(0, maxLength);
}

function normalizeAppearanceTitleSize(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(96, Math.max(36, Math.round(parsed)));
}

function normalizeAppearance(payload: any) {
  return {
    themeId: payload?.themeId === "brutal" ? payload.themeId : DEFAULT_APPEARANCE.themeId,
    accentColor: normalizeAppearanceColor(payload?.accentColor, DEFAULT_APPEARANCE.accentColor),
    homeTitle: normalizeAppearanceText(payload?.homeTitle, DEFAULT_APPEARANCE.homeTitle, 140),
    homeTitleSize: normalizeAppearanceTitleSize(payload?.homeTitleSize, DEFAULT_APPEARANCE.homeTitleSize),
    homeMessage: normalizeAppearanceText(payload?.homeMessage, DEFAULT_APPEARANCE.homeMessage, 400),
    homeIcon: normalizeAppearanceText(payload?.homeIcon, DEFAULT_APPEARANCE.homeIcon, 64),
    homeBgColor: normalizeAppearanceColor(payload?.homeBgColor, DEFAULT_APPEARANCE.homeBgColor),
  };
}

function loadAppearance() {
  if (fs.existsSync(APPEARANCE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(APPEARANCE_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading appearance file:", e);
    }
  }
  return null;
}

function saveAppearance(appearance: any) {
  fs.writeFileSync(APPEARANCE_FILE, JSON.stringify(appearance, null, 2), "utf-8");
}

function loadProjectMeta() {
  if (fs.existsSync(PROJECT_META_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROJECT_META_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading project meta file:", e);
    }
  }
  return {};
}

function saveProjectMeta(meta: any) {
  fs.writeFileSync(PROJECT_META_FILE, JSON.stringify(meta, null, 2), "utf-8");
}

// Helper: load submissions
function loadSubmissions() {
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading submissions", e);
      return [];
    }
  }
  return [];
}

// Helper: save submission
function saveSubmission(submission: any) {
  const list = loadSubmissions();
  list.unshift(submission); // Add to beginning of array
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
}

// Helper: overwrite the whole submissions list
function saveAllSubmissions(list: any[]) {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
}

// Helper: list ALL child block ids of a Notion block/page (paginated)
async function listAllChildBlockIds(notion: Client, blockId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const resp: any = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of resp.results || []) {
      if (block?.id) ids.add(block.id);
    }
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return ids;
}

// Helper: resolve the real (signed, temporary) file URLs stored inside a
// submission's toggle block, in document order. Notion exposes short-lived
// signed URLs, so these are resolved fresh on each read.
async function listToggleFileUrls(notion: Client, toggleId: string): Promise<string[]> {
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const resp: any = await notion.blocks.children.list({
      block_id: toggleId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of resp.results || []) {
      if (block?.type === "image" && block.image) {
        const url = block.image.file?.url || block.image.external?.url;
        if (url) urls.push(url);
      } else if (block?.type === "file" && block.file) {
        const url = block.file.file?.url || block.file.external?.url;
        if (url) urls.push(url);
      }
    }
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return urls;
}

async function listProjectsFromNotion(): Promise<Array<PreviewProject & { type: string; url: string; isActive: boolean }>> {
  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return [];
  }

  const notion = new Client({ auth: config.notionSecret });
  const response = await notion.blocks.children.list({
    block_id: config.parentPageId,
  });

  const metaList = loadProjectMeta();

  return response.results
    .filter((block: any) => block.type === "toggle" || block.type === "child_page")
    .map((block: any) => {
      const meta = metaList[block.id] || {};
      const isActive = meta.isActive !== undefined ? meta.isActive : true;

      if (block.type === "toggle") {
        const name = block.toggle.rich_text.map((rt: any) => rt.plain_text).join("").trim();
        return {
          id: block.id,
          name: name || "Proyecto sin título",
          type: "toggle",
          url: `https://notion.so/${config.parentPageId.replace(/-/g, "")}#${block.id.replace(/-/g, "")}`,
          isActive,
        };
      }

      return {
        id: block.id,
        name: block.child_page.title || "Proyecto sin título",
        type: "page",
        url: `https://notion.so/${block.id.replace(/-/g, "")}`,
        isActive,
      };
    });
}

function getServerOrigin(req: express.Request) {
  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

async function resolveServerPreview(pathname: string) {
  const appearance = normalizeAppearance(loadAppearance());
  const metaMap = loadProjectMeta();

  if (isRootLikePath(pathname)) {
    return resolvePreview(pathname, appearance, [], metaMap);
  }

  let projects: PreviewProject[] = [];
  try {
    projects = await listProjectsFromNotion();
  } catch (error: any) {
    console.warn("Preview project resolution fallback:", error?.message || error);
  }

  return resolvePreview(pathname, appearance, projects, metaMap);
}

async function buildPreviewHtml(template: string, pathname: string, origin: string) {
  const normalizedPath = pathname && pathname.startsWith("/") ? pathname : `/${pathname || ""}`;
  const preview = await resolveServerPreview(normalizedPath);
  const pageUrl = new URL(normalizedPath || "/", origin).toString();
  const imageUrl = new URL(`/api/og?path=${encodeURIComponent(normalizedPath || "/")}`, origin).toString();
  return injectPreviewIntoHtml(template, preview, pageUrl, imageUrl);
}

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB limit (paid Notion workspace)
});

// --- API ENDPOINTS ---

// 1. Get current config info (masked)
app.get("/api/config", (req, res) => {
  const config = loadConfig();
  res.json({
    success: true,
    isConfigured: !!(config.notionSecret && config.parentPageId),
    hasSecret: !!config.notionSecret,
    hasParentId: !!config.parentPageId,
    parentPageId: config.parentPageId,
    maskedSecret: config.notionSecret ? `••••••••${config.notionSecret.slice(-4)}` : "",
  });
});

// Proxy route for background images stored in Notion blocks
app.get("/api/notion/blocks/:blockId/image", async (req, res) => {
  try {
    const { blockId } = req.params;
    const config = loadConfig();
    if (!config.notionSecret) {
      return res.status(401).json({ success: false, message: "Notion no está configurado" });
    }
    const notion = new Client({ auth: config.notionSecret });
    const blockDetail: any = await notion.blocks.retrieve({ block_id: blockId });
    const imageUrl: string = blockDetail?.image?.file?.url || blockDetail?.image?.external?.url || "";
    if (!imageUrl) {
      return res.status(404).json({ success: false, message: "Imagen no encontrada en el bloque de Notion" });
    }

    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return res.status(502).json({ success: false, message: "No se pudo descargar la imagen desde Notion" });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e: any) {
    console.error("Error proxying Notion image:", e);
    return res.status(500).json({ success: false, message: "No se pudo cargar la imagen desde el proxy de Notion" });
  }
});

// 2. Set config details
app.post("/api/config", (req, res) => {
  const { notionSecret, parentPageId } = req.body;
  if (!notionSecret || !parentPageId) {
    return res.status(400).json({ error: "Faltan datos de configuración" });
  }

  const cleanedParentPageId = cleanNotionId(parentPageId);
  saveConfig({ notionSecret, parentPageId: cleanedParentPageId });
  res.json({ success: true, message: "Configuración guardada correctamente" });
});

// 3. Clear config
app.post("/api/config/clear", (req, res) => {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
  res.json({ success: true, message: "Configuración eliminada" });
});

// 3.0. Global appearance config for theme + homepage
app.get("/api/appearance", (req, res) => {
  const appearance = loadAppearance();
  res.json({ success: true, appearance });
});

app.post("/api/appearance", (req, res) => {
  const appearance = normalizeAppearance(req.body || {});
  saveAppearance(appearance);
  res.json({ success: true, message: "Apariencia guardada correctamente." });
});

app.get("/api/og", async (req, res) => {
  const requestedPath = typeof req.query.path === "string" ? req.query.path : "/";
  const normalizedPath = requestedPath.startsWith("/") ? requestedPath : `/${requestedPath}`;

  try {
    const preview = await resolveServerPreview(normalizedPath);
    const svg = await buildPreviewSvg(preview);
    res.setHeader("Content-Type", "image/svg+xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).send(svg);
  } catch (error: any) {
    console.error("Error generating preview SVG:", error);
    res.status(500).send("No se pudo generar la vista previa.");
  }
});

// 3.1. Admin Password Validation based on Notion Quote Block
app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "La contraseña es obligatoria" });
  }

  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return res.status(400).json({ error: "Notion no está configurado en el servidor con NOTION_SECRET y NOTION_ID_PAGE." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });
    const response = await notion.blocks.children.list({
      block_id: config.parentPageId,
    });

    const quoteBlock = response.results.find((b: any) => b.type === "quote") as any;
    if (!quoteBlock || !quoteBlock.quote || !quoteBlock.quote.rich_text) {
      return res.status(400).json({
        error: "No se encontró ningún bloque de Cita (Quote/Cita con la barra vertical izquierda o línea de quote) en la página matriz de Notion. Por favor crea un bloque Cita en Notion (con tu contraseña ej: 123456) en la parte superior y vuelve a intentar."
      });
    }

    const notionPassword = quoteBlock.quote.rich_text
      .map((rt: any) => rt.plain_text)
      .join("")
      .trim();

    if (password.trim() === notionPassword) {
      return res.json({ success: true });
    } else {
      return res.status(401).json({ error: "Contraseña incorrecta." });
    }
  } catch (err: any) {
    console.error("Error al validar contraseña con Notion:", err);
    return res.status(500).json({ error: `Fallo al conectar con Notion para leer contraseña: ${err.message || "Error desconocido"}` });
  }
});

// 3.2. Get all project customized copywriting meta (with single-project query integration)
app.get("/api/project-meta", async (req, res) => {
  const { projectId } = req.query;
  const config = loadConfig();

  if (projectId && config.notionSecret) {
    try {
      const notion = new Client({ auth: config.notionSecret });
      const response = await notion.blocks.children.list({ block_id: projectId as string });

      const codeBlock = response.results.find((b: any) => b.type === "code" && b.code?.language === "json") as any;
      const quoteBlock = response.results.find((b: any) => b.type === "quote") as any;
      let expirationDate = "";

      if (quoteBlock && quoteBlock.quote?.rich_text) {
        const text = quoteBlock.quote.rich_text.map((rt: any) => rt.plain_text).join("");
        const match = text.match(/vencimiento:\s*([^\n\r]+)/i);
        if (match) {
          expirationDate = match[1].trim();
        }
      }

      if (codeBlock && codeBlock.code?.rich_text) {
        const jsonText = codeBlock.code.rich_text.map((rt: any) => rt.plain_text).join("").trim();
        try {
          const data = JSON.parse(jsonText);
          return res.json({
            success: true,
            meta: {
              title: data.title || "",
              description: data.description || "",
              step1: data.step1 || "",
              step2: data.step2 || "",
              step3: data.step3 || "",
              expirationDate: data.expirationDate || expirationDate,
              backgroundImage: data.backgroundImage || "",
              isActive: data.isActive !== undefined ? !!data.isActive : true,
              bgColor: data.bgColor || "",
              bgBlur: typeof data.bgBlur === "number" ? data.bgBlur : 0,
              icon: data.icon || "",
              customFields: Array.isArray(data.customFields) ? data.customFields : [],
              useDatabase: !!data.useDatabase,
              databaseId: data.databaseId || "",
              dbColumns: Array.isArray(data.dbColumns) ? data.dbColumns : [],
              groupId: data.groupId || "",
              order: typeof data.order === "number" ? data.order : 0,
              textColor: data.textColor === "white" || data.textColor === "black" ? data.textColor : "auto",
              createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
            }
          });
        } catch (e) {
          console.error("JSON formatting issue in code block", e);
        }
      }

      // Fallback matching
      if (expirationDate) {
        return res.json({
          success: true,
          meta: {
            expirationDate,
            backgroundImage: "",
          }
        });
      }
    } catch (err: any) {
      console.warn("No metadata blocks found directly in Notion child yet, falling back to cache.", err.message);
    }
  }

  // General fallback - cache list
  res.json({ success: true, meta: loadProjectMeta() });
});

// 3.3. Set project customized copywriting meta directly to Notion & cached fallback
app.post("/api/project-meta", async (req, res) => {
  const {
    projectId,
    title,
    description,
    step1,
    step2,
    step3,
    expirationDate,
    backgroundImage,
    isActive,
    bgColor,
    bgBlur,
    icon,
    customFields,
    useDatabase,
    databaseId,
    dbColumns,
    groupId,
    order,
    textColor,
    createdAt
  } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: "El ID del proyecto es obligatorio." });
  }

  const existingCreatedAt = loadProjectMeta()[projectId]?.createdAt;
  const resolvedCreatedAt = typeof createdAt === "string" && createdAt ? createdAt : existingCreatedAt;

  const config = loadConfig();
  if (config.notionSecret) {
    try {
      const notion = new Client({ auth: config.notionSecret });
      const response = await notion.blocks.children.list({ block_id: projectId });

      const codeBlock = response.results.find((b: any) => b.type === "code" && b.code?.language === "json") as any;
      const quoteBlock = response.results.find((b: any) => b.type === "quote") as any;

      const metaPayload = {
        title: (title || "").trim(),
        description: (description || "").trim(),
        step1: (step1 || "").trim(),
        step2: (step2 || "").trim(),
        step3: (step3 || "").trim(),
        expirationDate: (expirationDate || "").trim(),
        backgroundImage: (backgroundImage || "").trim(),
        bgBlur: typeof bgBlur === "number" ? bgBlur : 0,
        bgColor: (bgColor || "").trim(),
        icon: (icon || "").trim(),
        isActive: isActive !== undefined ? !!isActive : true,
        customFields: Array.isArray(customFields) ? customFields : [],
        useDatabase: !!useDatabase,
        databaseId: (databaseId || "").trim(),
        dbColumns: Array.isArray(dbColumns) ? dbColumns : [],
        groupId: (groupId || "").trim(),
        order: typeof order === "number" ? order : 0,
        textColor: textColor === "white" || textColor === "black" ? textColor : "auto",
        ...(resolvedCreatedAt ? { createdAt: resolvedCreatedAt } : {}),
      };

      const jsonString = JSON.stringify(metaPayload, null, 2);

      // Save to Code Block
      if (codeBlock) {
        await notion.blocks.update({
          block_id: codeBlock.id,
          code: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: jsonString,
                },
              },
            ],
            language: "json",
          },
        });
      } else {
        await notion.blocks.children.append({
          block_id: projectId,
          children: [
            {
              object: "block",
              type: "code",
              code: {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: jsonString,
                    },
                  },
                ],
                language: "json",
              },
            },
          ],
        });
      }

      // Save to visual Quote Block
      const quoteText = `⏳ Fecha de vencimiento: ${expirationDate ? expirationDate.trim() : "Sin fecha límite asignada"}`;
      if (quoteBlock) {
        await notion.blocks.update({
          block_id: quoteBlock.id,
          quote: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: quoteText,
                },
              },
            ],
          },
        });
      } else {
        await notion.blocks.children.append({
          block_id: projectId,
          children: [
            {
              object: "block",
              type: "quote",
              quote: {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: quoteText,
                    },
                  },
                ],
              },
            },
          ],
        });
      }

      // Save to local json cache
      const localMetas = loadProjectMeta();
      localMetas[projectId] = metaPayload;
      saveProjectMeta(localMetas);

      return res.json({ success: true, message: "Información sincronizada en el servidor y guardada en Notion exitosamente." });
    } catch (err: any) {
      console.error("Error committing meta to Notion block:", err);
      // Fallback update to local metadata only
    }
  }

  // Save changes locally anyway if notion fails/not accessible
  const metaList = loadProjectMeta();
  metaList[projectId] = {
    title: (title || "").trim(),
    description: (description || "").trim(),
    step1: (step1 || "").trim(),
    step2: (step2 || "").trim(),
    step3: (step3 || "").trim(),
    expirationDate: (expirationDate || "").trim(),
    backgroundImage: (backgroundImage || "").trim(),
    bgBlur: typeof bgBlur === "number" ? bgBlur : 0,
    bgColor: (bgColor || "").trim(),
    icon: (icon || "").trim(),
    isActive: isActive !== undefined ? !!isActive : true,
    customFields: Array.isArray(customFields) ? customFields : [],
    useDatabase: !!useDatabase,
    databaseId: (databaseId || "").trim(),
    dbColumns: Array.isArray(dbColumns) ? dbColumns : [],
    groupId: (groupId || "").trim(),
    order: typeof order === "number" ? order : 0,
    textColor: textColor === "white" || textColor === "black" ? textColor : "auto",
    ...(resolvedCreatedAt ? { createdAt: resolvedCreatedAt } : {}),
  };

  saveProjectMeta(metaList);
  res.json({ success: true, message: "Textos del proyecto configurados localmente debido a límites de conexión con Notion." });
});

// A submission toggle's header always starts with 👤 (see /api/submit).
const isSubmissionTitle = (name: string): boolean => name.trim().startsWith("👤");

/** Recognizable icon keys used to auto-assign a random icon to new projects. */
const RANDOM_ICON_KEYS = [
  "FileText", "Folder", "BookOpen", "GraduationCap", "Rocket", "Star", "Award", "Package",
  "Camera", "Music", "Palette", "Code2", "Cpu", "Database", "Globe", "Heart", "Lightbulb",
  "Trophy", "Target", "Zap", "Brain", "FlaskConical", "Calculator", "Briefcase", "Building2",
  "Mail", "Bell", "Users", "Settings", "Compass", "Map", "Shield", "Sparkles", "Wand2",
  "Leaf", "Sun", "Moon", "Flame", "Mountain", "Image", "Video", "Layers", "Bookmark", "Gem",
  "Crown", "Flag", "Medal", "Microscope", "Atom", "Newspaper",
];
const pickRandomIconKey = (): string => RANDOM_ICON_KEYS[Math.floor(Math.random() * RANDOM_ICON_KEYS.length)];

// List ALL children of a block (paginated).
async function listAllChildBlocks(notion: Client, blockId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const resp: any = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    out.push(...(resp.results || []));
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return out;
}

// Recursively collect the project tree (toggles/child_pages), skipping submission
// toggles (👤 ...) and content blocks. Nested nodes carry their container's id.
async function collectProjectTree(
  notion: Client,
  blockId: string,
  parentKey: string,
  rootPageId: string,
  depth: number,
  acc: any[]
): Promise<void> {
  if (depth > 4) return;
  let children: any[];
  try {
    children = await listAllChildBlocks(notion, blockId);
  } catch {
    return;
  }
  const metaList = loadProjectMeta();
  for (const block of children) {
    if (block.type === "toggle") {
      const name = (block.toggle?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim();
      if (isSubmissionTitle(name)) continue;
      const meta = metaList[block.id] || {};
      acc.push({
        id: block.id,
        name: name || "Proyecto sin título",
        type: "toggle",
        parentId: parentKey,
        hasChildren: !!block.has_children,
        url: `https://notion.so/${rootPageId.replace(/-/g, "")}#${block.id.replace(/-/g, "")}`,
        isActive: meta.isActive !== undefined ? meta.isActive : true,
      });
      if (block.has_children) {
        await collectProjectTree(notion, block.id, block.id, rootPageId, depth + 1, acc);
      }
    } else if (block.type === "child_page") {
      const meta = metaList[block.id] || {};
      acc.push({
        id: block.id,
        name: block.child_page?.title || "Proyecto sin título",
        type: "page",
        parentId: parentKey,
        hasChildren: !!block.has_children,
        url: `https://notion.so/${block.id.replace(/-/g, "")}`,
        isActive: meta.isActive !== undefined ? meta.isActive : true,
      });
      if (block.has_children) {
        await collectProjectTree(notion, block.id, block.id, rootPageId, depth + 1, acc);
      }
    }
  }
}

// 4. Get project tree from Notion Parent Page (recursive, flat list with parentId)
app.get("/api/projects", async (req, res) => {
  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return res.status(400).json({ error: "Notion no está configurado. Por favor, ve al panel de administración." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });
    const projects: any[] = [];
    await collectProjectTree(notion, config.parentPageId, "", config.parentPageId, 0, projects);
    res.json({ success: true, projects });
  } catch (err: any) {
    console.error("Error fetching projects from Notion:", err);
    res.status(500).json({
      error: `Error al conectar con Notion: ${err.message || "Error desconocido"}. Verifica tu token e ID de la página principal.`,
    });
  }
});

// 5. Create a new Project in Notion. Body: { name, parentId? }
// parentId → create inside that folder/project; otherwise at the root page.
app.post("/api/projects", async (req, res) => {
  const { name, parentId, icon, bgColor } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "El nombre del proyecto es obligatorio" });
  }

  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  const targetParent = cleanNotionId(parentId || "") || config.parentPageId;

  try {
    const notion = new Client({ auth: config.notionSecret });

    // Create project as an expandable toggle block inside the target parent
    const result = await notion.blocks.children.append({
      block_id: targetParent,
      children: [
        {
          object: "block",
          type: "toggle",
          toggle: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: name.trim(),
                },
              },
            ],
          },
        },
      ],
    });

    const newBlock = result.results[0] as any;
    const blockIdClean = newBlock.id.replace(/-/g, "");
    const createdAt = new Date().toISOString();

    // Initial metadata: creation date, an icon (provided or random) and (for children)
    // the inherited color. The icon is always set so new projects are never left blank.
    const initialMeta: Record<string, any> = {
      title: name.trim(),
      createdAt,
      icon: typeof icon === "string" && icon ? icon : pickRandomIconKey(),
    };
    if (typeof bgColor === "string" && bgColor) initialMeta.bgColor = bgColor;

    // Persist the initial metadata as a JSON code block INSIDE the new toggle, so it
    // is durable in Notion (survives cache clears).
    try {
      await notion.blocks.children.append({
        block_id: newBlock.id,
        children: [
          {
            object: "block",
            type: "code",
            code: {
              rich_text: [{ type: "text", text: { content: JSON.stringify(initialMeta, null, 2) } }],
              language: "json",
            },
          },
        ],
      });
    } catch (e) {
      console.error("Could not write initial meta code block in Notion", e);
    }

    // Mirror into the local project-meta store.
    try {
      const metaList = loadProjectMeta();
      metaList[newBlock.id] = { ...(metaList[newBlock.id] || {}), ...initialMeta };
      saveProjectMeta(metaList);
    } catch (e) {
      console.error("Could not stamp initial meta for new project", e);
    }

    res.json({
      success: true,
      project: {
        id: newBlock.id,
        name: name.trim(),
        parentId: targetParent === config.parentPageId ? "" : targetParent,
        url: `https://notion.so/${config.parentPageId.replace(/-/g, "")}#${blockIdClean}`,
      },
    });
  } catch (err: any) {
    console.error("Error creating project toggle in Notion:", err);
    res.status(500).json({
      error: `Error al crear proyecto en Notion: ${err.message || "Error desconocido"}.`,
    });
  }
});

// 5.0. Rename a project/folder. Body: { name, type? }
app.patch("/api/projects/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { name, type } = req.body || {};
  if (!projectId) {
    return res.status(400).json({ error: "El ID del proyecto es obligatorio." });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio." });
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });
    if (type === "page") {
      await notion.pages.update({
        page_id: projectId,
        properties: { title: { title: [{ type: "text", text: { content: name.trim() } }] } },
      } as any);
    } else {
      await notion.blocks.update({
        block_id: projectId,
        toggle: { rich_text: [{ type: "text", text: { content: name.trim() } }] },
      } as any);
    }
    res.json({ success: true, message: "Proyecto renombrado exitosamente." });
  } catch (err: any) {
    console.error("Error renaming project in Notion:", err);
    res.status(500).json({
      error: `Error al renombrar proyecto en Notion: ${err.message || "Error desconocido"}.`,
    });
  }
});

// 5.1. Delete a Project in Notion (deletes the block)
app.delete("/api/projects/:projectId", async (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: "El ID del proyecto es obligatorio para su eliminación." });
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });
    await notion.blocks.delete({ block_id: projectId });

    // Also remove from local project meta cache if it exists
    const metaList = loadProjectMeta();
    if (metaList[projectId]) {
      delete metaList[projectId];
      saveProjectMeta(metaList);
    }

    res.json({ success: true, message: "Proyecto eliminado en Notion exitosamente." });
  } catch (err: any) {
    console.error("Error deleting project block in Notion:", err);
    res.status(500).json({
      error: `Error al eliminar proyecto en Notion: ${err.message || "Error desconocido"}.`,
    });
  }
});

// 5.2. Upload background image that gets saved inside Notion or locally as fallback
app.post("/api/projects/upload-bg", upload.single("bgImage"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se seleccionó o cargó ninguna imagen." });
  }

  const { projectId } = req.query;
  const config = loadConfig();

  // If a project ID is specified and Notion is configured, try uploading directly to Notion
  if (config.notionSecret && projectId) {
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const mimeType = req.file.mimetype;
      const filename = req.file.filename;

      const uploadResult = await uploadBgImageToNotion(
        config.notionSecret,
        projectId as string,
        fileBuffer,
        mimeType,
        filename
      );

      if (uploadResult) {
        // Clean up the local temp uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.warn("Error cleaning up local uploaded temp file:", err);
        }

        // Return the dynamic same-origin proxy URL
        const fileUrl = `/api/notion/blocks/${uploadResult.blockId}/image`;
        return res.json({ success: true, url: fileUrl });
      }
    } catch (e: any) {
      console.error("Error saving image inside Notion:", e);
    }
  }

  // Fallback to local uploads directory
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const appUrl = process.env.APP_URL || `${protocol}://${host}`;
  const fileUrl = `${appUrl.replace(/\/$/, "")}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

// 6. Get Submissions Logs — reconciled against Notion (source of truth).
app.get("/api/submissions", async (req, res) => {
  const submissions = loadSubmissions();
  const config = loadConfig();

  if (!config.notionSecret || submissions.length === 0) {
    return res.json({ success: true, submissions });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });

    // Group verifiable submissions (with a notionBlockId) by project.
    const byProject: Record<string, boolean> = {};
    for (const sub of submissions) {
      if (sub?.notionBlockId && sub?.projectId) byProject[sub.projectId] = true;
    }

    const existingByProject: Record<string, Set<string> | null> = {};
    await Promise.all(
      Object.keys(byProject).map(async (projectId) => {
        try {
          existingByProject[projectId] = await listAllChildBlockIds(notion, projectId);
        } catch {
          existingByProject[projectId] = null; // couldn't verify → keep
        }
      })
    );

    let pruned = false;
    const kept = submissions.filter((sub: any) => {
      if (!sub?.notionBlockId || !sub?.projectId) return true;
      const existing = existingByProject[sub.projectId];
      if (!existing) return true;
      if (existing.has(sub.notionBlockId)) return true;
      pruned = true;
      return false;
    });

    if (pruned) saveAllSubmissions(kept);
    return res.json({ success: true, submissions: kept });
  } catch (e) {
    // On any failure, fall back to the raw list.
    return res.json({ success: true, submissions });
  }
});

// 6.05 Proxy a submission's file so it can be viewed inline (same-origin, with
// Range support). Resolves the fresh, short-lived Notion URL on each request,
// avoiding CORS and URL-expiry problems.
app.get("/api/submission-file", async (req, res) => {
  const block = String(req.query.block || "");
  const index = parseInt(String(req.query.i || "0"), 10) || 0;
  const download = req.query.download === "1";

  if (!block) {
    return res.status(400).send("Falta el identificador del envío.");
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).send("Notion no está configurado.");
  }

  let fileUrl = "";
  try {
    const notion = new Client({ auth: config.notionSecret });
    const urls = await listToggleFileUrls(notion, block);
    fileUrl = urls[index] || "";
  } catch {
    return res.status(502).send("No se pudo resolver el archivo.");
  }

  if (!fileUrl) {
    return res.status(404).send("Archivo no encontrado.");
  }

  try {
    const range = req.headers.range;
    const upstream = await fetch(fileUrl, {
      headers: range ? { Range: range } : {},
    });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    const cl = upstream.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) res.setHeader("Content-Range", cr);
    res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    res.setHeader("Cache-Control", "private, max-age=60");
    if (download) res.setHeader("Content-Disposition", "attachment");

    if (upstream.body) {
      Readable.fromWeb(upstream.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(502).send("Error al descargar el archivo desde Notion.");
  }
});

// 6.1. Delete a submission — removes it from Notion (toggle + db row) and locally.
app.delete("/api/submissions/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "El ID del envío es obligatorio." });
  }

  const submissions = loadSubmissions();
  const record = submissions.find((s: any) => s.id === id);
  const config = loadConfig();

  if (record && config.notionSecret) {
    const notion = new Client({ auth: config.notionSecret });
    if (record.notionBlockId) {
      try { await notion.blocks.delete({ block_id: record.notionBlockId }); } catch { /* already gone */ }
    }
    if (record.dbPageId) {
      try { await notion.blocks.delete({ block_id: record.dbPageId }); } catch { /* non-critical */ }
    }
  }

  const kept = submissions.filter((s: any) => s.id !== id);
  saveAllSubmissions(kept);
  res.json({ success: true, message: "Envío eliminado de Notion y del panel." });
});

// Endpoint to receive files forwarded/uploaded from functions edge for larger files or error fallbacks
app.post("/api/fallback-upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se cargó ningún archivo" });
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const appUrl = process.env.APP_URL || `${protocol}://${host}`;
  const fileUrl = `${appUrl.replace(/\/$/, "")}/uploads/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size
  });
});

// 7. Upload individual files directly to Notion (supports both single-part and multi-part)
app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo." });
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  const MULTI_PART_THRESHOLD = 20 * 1024 * 1024;

  try {
    let result: { id: string; finalName: string; extModified: boolean };

    if (req.file.size > MULTI_PART_THRESHOLD) {
      result = await uploadLargeFileObjectToNotion(
        config.notionSecret,
        req.file.path,
        req.file.originalname,
        req.file.mimetype
      );
    } else {
      result = await uploadFileObjectToNotion(
        config.notionSecret,
        req.file.path,
        req.file.originalname,
        req.file.mimetype
      );
    }

    // Delete local temp file after upload to Notion
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      console.warn("Could not delete uploaded temp file", e);
    }

    res.json({
      success: true,
      id: result.id,
      finalName: result.finalName,
      extModified: result.extModified,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err: any) {
    console.error(`Local upload to Notion failed for "${req.file.originalname}":`, err);
    res.status(500).json({
      error: `Error al subir "${req.file.originalname}" a Notion: ${err.message || "Error desconocido"}.`,
    });
  }
});

// 7b. Init multi-part upload (returns Notion upload URL for direct browser→Notion upload)
app.post("/api/upload-init", async (req, res) => {
  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  const { filename, mimeType = "", fileSize = 0 } = req.body || {};
  if (!filename) {
    return res.status(400).json({ error: "Se requiere el nombre del archivo." });
  }

  const CHUNK_SIZE = 10 * 1024 * 1024;
  const MULTI_PART_THRESHOLD = 20 * 1024 * 1024;
  const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

  if (fileSize > MAX_FILE_SIZE) {
    return res.status(413).json({ error: "El archivo excede el límite de 5 GB de Notion." });
  }

  const { uploadName, contentType } = resolveUploadMeta(filename, mimeType);
  const isMultiPart = fileSize > MULTI_PART_THRESHOLD;
  const numberOfParts = isMultiPart ? Math.ceil(fileSize / CHUNK_SIZE) : 1;

  try {
    const createBody: any = { filename: uploadName, content_type: contentType };
    if (isMultiPart) {
      createBody.mode = "multi_part";
      createBody.number_of_parts = numberOfParts;
    }

    const createRes = await fetch(`${NOTION_API_BASE_URL}/file_uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notionSecret}`,
        "Notion-Version": NOTION_API_VER,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
    });

    const upload = (await createRes.json()) as any;
    if (!upload.id) {
      throw new Error(`No se pudo crear el upload: ${JSON.stringify(upload)}`);
    }

    res.json({
      success: true,
      id: upload.id,
      uploadUrl: upload.upload_url || `${NOTION_API_BASE_URL}/file_uploads/${upload.id}/send`,
      mode: isMultiPart ? "multi_part" : "single_part",
      numberOfParts,
      uploadName,
      contentType,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Error al inicializar upload: ${err.message || "Error desconocido"}` });
  }
});

// 7c. Complete multi-part upload
app.post("/api/upload-complete", async (req, res) => {
  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  const { uploadId } = req.body || {};
  if (!uploadId) {
    return res.status(400).json({ error: "Se requiere uploadId." });
  }

  try {
    const completeRes = await fetch(`${NOTION_API_BASE_URL}/file_uploads/${uploadId}/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notionSecret}`,
        "Notion-Version": NOTION_API_VER,
        "Content-Type": "application/json",
      },
    });

    if (!completeRes.ok) {
      const errText = await completeRes.text();
      throw new Error(`Notion rechazó el complete: ${completeRes.status} - ${errText}`);
    }

    const result = (await completeRes.json()) as any;
    res.json({ success: true, id: uploadId, status: result.status, finalName: result.filename });
  } catch (err: any) {
    res.status(500).json({ error: `Error al completar upload: ${err.message || "Error desconocido"}` });
  }
});

// 7d. Proxy a single chunk to Notion (local dev only — avoids CORS blocking the browser)
app.post("/api/upload-part", upload.single("file"), async (req, res) => {
  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó el chunk de archivo." });
  }

  // upload_id comes from the query string (matches the production streaming contract);
  // part_number is still a normal form field that multer parses for us.
  const upload_id = (req.query.upload_id as string) || (req.body && req.body.upload_id);
  const { part_number } = req.body || {};
  if (!upload_id) {
    return res.status(400).json({ error: "Se requiere upload_id." });
  }

  try {
    const sendUrl = `${NOTION_API_BASE_URL}/file_uploads/${upload_id}/send`;
    const notionForm = new FormData();
    if (part_number) notionForm.append("part_number", String(part_number));
    notionForm.append(
      "file",
      new Blob([new Uint8Array(fs.readFileSync(req.file.path))], { type: req.file.mimetype || "application/octet-stream" }),
      req.file.originalname || "file"
    );

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notionSecret}`,
        "Notion-Version": NOTION_API_VER,
      },
      body: notionForm,
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Notion rechazó el chunk: ${sendRes.status} - ${errText}`);
    }

    const result = (await sendRes.json()) as any;
    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({
      success: true,
      id: result.id,
      status: result.status,
      partNumber: part_number ? parseInt(part_number, 10) : 1,
    });
  } catch (err: any) {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: `Error al enviar chunk: ${err.message || "Error desconocido"}` });
  }
});

// 8. Submit files (creates Toggle block inside specific project child page using pre-uploaded fileIDs)
app.post("/api/submit", async (req, res) => {
  const { senderName, senderEmail, projectId, projectName, fileRecords = [], bgColor = "" } = req.body;

  if (!senderName || !senderEmail || !projectId) {
    return res.status(400).json({ error: "Faltan campos obligatorios (nombre, correo o proyecto)." });
  }
  if (fileRecords.length === 0) {
    return res.status(400).json({ error: "No se han subido archivos." });
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado en el servidor." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });

    // Format current date in human-friendly way
    const dateStr = new Date().toLocaleString("es-ES", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC";

    // Format toggle list header content
    const toggleHeader = `👤 ${senderName.trim()} (${senderEmail.trim()}) — ${dateStr}`;

    // Create Notion Child Blocks structure
    const blocks: any[] = [];

    // 1. Callout with Sender and Transfer info
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Información de la entrega:\n• Remitente: ${senderName.trim()}\n• Correo: ${senderEmail.trim()}\n• Fecha de envío: ${dateStr}\n• Archivos totales: ${fileRecords.length}`,
            },
          },
        ],
        icon: {
          type: "emoji",
          emoji: "📬",
        },
        color: "blue_background",
      },
    });

    // 2. Headings for files list
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Archivos adjuntos",
            },
          },
        ],
      },
    });

    const IMAGE_TYPES = new Set([
      "image/png", "image/jpeg", "image/jpg", "image/gif",
      "image/webp", "image/svg+xml", "image/bmp", "image/tiff",
    ]);

    // 3. Native File/Image Blocks (all uploaded natively to Notion)
    fileRecords.forEach((f: any) => {
      const isImage = IMAGE_TYPES.has(f.mimeType);
      const sizeLabel = (f.size / (1024 * 1024)).toFixed(2) + " MB";
      const caption = f.extModified
        ? [{ type: "text", text: { content: `⚠️ .zip agregado. Nombre original: ${f.name} (${sizeLabel})` } }]
        : [{ type: "text", text: { content: `${isImage ? "🖼️" : "📄"} ${f.name} (${sizeLabel})` } }];

      if (isImage) {
        blocks.push({
          object: "block",
          type: "image",
          image: {
            type: "file_upload",
            file_upload: { id: f.uploadId },
            caption,
          },
        });
      } else {
        blocks.push({
          object: "block",
          type: "file",
          file: {
            type: "file_upload",
            file_upload: { id: f.uploadId },
            caption,
          },
        });
      }
    });

    // Append standard toggle block with the children blocks inside.
    // Capture the created toggle id so submissions mirror Notion and can be deleted.
    const appendRes: any = await notion.blocks.children.append({
      block_id: projectId,
      children: [
        {
          object: "block",
          type: "toggle",
          toggle: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: toggleHeader,
                },
              },
            ],
            children: blocks,
          },
        },
      ],
    });
    const notionBlockId = appendRes?.results?.[0]?.id || "";

    // Save in local submissions index file for Admin view
    const submissionId = "sub_" + Date.now();
    const submissionRecord = {
      id: submissionId,
      projectId,
      projectName: projectName || "Proyecto de Notion",
      senderName: senderName.trim(),
      senderEmail: senderEmail.trim(),
      timestamp: new Date().toISOString(),
      notionBlockId,
      dbPageId: "",
      files: fileRecords.map((f: any) => ({
        name: f.name,
        size: f.size,
        url: `(Subido a Notion: ${f.finalName})`
      })),
    };
    saveSubmission(submissionRecord);

    // Enviar comprobante por correo al remitente (Gmail API). Best-effort:
    // no bloquea la respuesta ni hace fallar el envío si el correo no se manda.
    const gmailCreds = {
      clientId: process.env.GMAIL_CLIENT_ID || "",
      clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
      refreshToken: process.env.GMAIL_REFRESH_TOKEN || "",
      sender: process.env.GMAIL_SENDER || "",
      senderName: process.env.MAIL_FROM_NAME || "ENVI",
    };
    if (hasGmailCredentials(gmailCreds)) {
      const { subject, html, text } = buildReceiptEmail({
        senderName: submissionRecord.senderName,
        senderEmail: submissionRecord.senderEmail,
        projectName: submissionRecord.projectName,
        timestamp: submissionRecord.timestamp,
        files: submissionRecord.files.map((f: any) => ({ name: f.name, size: f.size })),
        accentColor: bgColor,
      });
      sendGmailMessage(gmailCreds, {
        to: submissionRecord.senderEmail,
        toName: submissionRecord.senderName,
        subject,
        html,
        text,
      }).catch((err) => console.error("No se pudo enviar el comprobante por correo:", err));
    }

    res.json({
      success: true,
      message: "Archivos subidos y registrados en Notion con éxito!",
      submission: submissionRecord,
    });
  } catch (err: any) {
    console.error("Error writing submission to Notion page:", err);
    res.status(500).json({
      error: `Error al guardar envío en Notion: ${err.message || "Error desconocido"}.`,
    });
  }
});


// Start server loading and integration with Vite for SPA framework
async function start() {
  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;

  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
  }

  app.get("*", async (req, res) => {
    try {
      const templatePath = process.env.NODE_ENV !== "production"
        ? path.join(process.cwd(), "index.html")
        : path.join(process.cwd(), "dist", "index.html");
      let template = fs.readFileSync(templatePath, "utf-8");

      if (vite) {
        template = await vite.transformIndexHtml(req.originalUrl, template);
      }

      const html = await buildPreviewHtml(template, req.path, getServerOrigin(req));
      res.status(200).setHeader("Content-Type", "text/html; charset=UTF-8");
      res.send(html);
    } catch (error: any) {
      if (vite) {
        vite.ssrFixStacktrace(error);
      }
      console.error("Error rendering preview HTML:", error);
      res.status(500).send("No se pudo renderizar la pagina.");
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
