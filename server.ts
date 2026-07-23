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
import { sendGmailMessage, buildReceiptEmail, buildFeedbackEmail, hasGmailCredentials, type MailAttachment } from "./functions/_shared/gmail";
import { collectSubmissions, collectProjectMetas, FEEDBACK_MARKER, FEEDBACK_DRAFT_MARKER, SUBMISSION_COMMENT_MARKER, SUBMISSION_DOCUMENT_MARKER } from "./functions/_shared/submissions";
import { uploadFileToNotion, buildNotionFileBlocks } from "./functions/_shared/notion";

/** Parse a Notion code(json) block's content, or null. */
function parseJsonCodeBlock(block: any): any {
  try {
    return JSON.parse((block?.code?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim());
  } catch {
    return null;
  }
}

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

// In-memory multer for small feedback attachments (they go straight into the email).
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file (Gmail attachment limit)
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

// 3.0. Global appearance config for theme + homepage — stored in Notion (source
// of truth) as a JSON code block on the parent page, with the local file as cache.
const APPEARANCE_MARKER = "__envi_appearance__";

async function findAppearanceBlockNotion(
  notion: Client,
  parentPageId: string
): Promise<{ id: string; value: any } | null> {
  let cursor: string | undefined;
  do {
    const resp: any = await notion.blocks.children.list({
      block_id: parentPageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const b of resp.results || []) {
      if (b.type === "code" && b.code?.language === "json") {
        try {
          const parsed = JSON.parse(
            (b.code.rich_text || []).map((rt: any) => rt.plain_text).join("").trim()
          );
          if (parsed && parsed[APPEARANCE_MARKER]) return { id: b.id, value: parsed };
        } catch {
          // Ignore malformed JSON.
        }
      }
    }
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return null;
}

app.get("/api/appearance", async (req, res) => {
  const config = loadConfig();
  if (config.notionSecret && config.parentPageId) {
    try {
      const notion = new Client({ auth: config.notionSecret });
      const found = await findAppearanceBlockNotion(notion, config.parentPageId);
      if (found) {
        const { [APPEARANCE_MARKER]: _omit, ...appearance } = found.value;
        return res.json({ success: true, appearance });
      }
    } catch {
      // Fall through to local cache.
    }
  }
  res.json({ success: true, appearance: loadAppearance() });
});

app.post("/api/appearance", async (req, res) => {
  const appearance = normalizeAppearance(req.body || {});
  const config = loadConfig();
  if (config.notionSecret && config.parentPageId) {
    try {
      const notion = new Client({ auth: config.notionSecret });
      const payload = { [APPEARANCE_MARKER]: true, ...appearance };
      const jsonString = JSON.stringify(payload, null, 2);
      const found = await findAppearanceBlockNotion(notion, config.parentPageId);
      if (found) {
        await notion.blocks.update({
          block_id: found.id,
          code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
        } as any);
      } else {
        await notion.blocks.children.append({
          block_id: config.parentPageId,
          children: [{
            object: "block",
            type: "code",
            code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
          }] as any,
        });
      }
    } catch {
      // Non-critical: still cache locally.
    }
  }
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
              allowComment: !!data.allowComment,
              registrationMode: !!data.registrationMode,
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

  // No specific project requested → rebuild ALL project metas from Notion
  // (source of truth) so the tree shows every project's color/icon.
  if (!projectId && config.notionSecret && config.parentPageId) {
    try {
      const notion = new Client({ auth: config.notionSecret });
      const listAll = async (blockId: string): Promise<any[]> => {
        const out: any[] = [];
        let cursor: string | undefined;
        do {
          const resp: any = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
          for (const b of resp.results || []) out.push(b);
          cursor = resp.has_more ? resp.next_cursor : undefined;
        } while (cursor);
        return out;
      };
      const allMeta = await collectProjectMetas(config.parentPageId, listAll);
      return res.json({ success: true, meta: allMeta });
    } catch (e) {
      // Fall through to local cache.
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
    createdAt,
    allowComment,
    registrationMode
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
        allowComment: !!allowComment,
        registrationMode: !!registrationMode,
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

// 6. Get Submissions — rebuilt straight from Notion (source of truth), so it
// works the same on any platform. ?projectId=xxx includes that project's files.
app.get("/api/submissions", async (req, res) => {
  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return res.json({ success: true, submissions: [] });
  }

  const notion = new Client({ auth: config.notionSecret });
  const listAll = async (blockId: string): Promise<any[]> => {
    const out: any[] = [];
    let cursor: string | undefined;
    do {
      const resp: any = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      });
      for (const b of resp.results || []) out.push(b);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);
    return out;
  };

  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  try {
    const submissions = await collectSubmissions(config.parentPageId, listAll, {
      filesForProjectId: projectId,
    });
    return res.json({ success: true, submissions });
  } catch (e) {
    return res.json({ success: true, submissions: [] });
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

// 6.1. Delete a submission — the id is the Notion toggle block id.
app.delete("/api/submissions/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "El ID del envío es obligatorio." });
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  const notion = new Client({ auth: config.notionSecret });
  try {
    await notion.blocks.delete({ block_id: id });
  } catch {
    // Already deleted or not accessible — treat as success so the UI updates.
  }

  // Optional: keep the legacy local log in sync.
  try {
    const subs = loadSubmissions();
    const kept = subs.filter((s: any) => s.id !== id && s.notionBlockId !== id);
    if (kept.length !== subs.length) saveAllSubmissions(kept);
  } catch {
    // Non-critical
  }

  res.json({ success: true, message: "Envío eliminado de Notion." });
});

// 6.2. Save grading/control values for a no-database submission — stored inside
// the submission's Notion toggle (JSON code block), so it's portable.
app.patch("/api/submission-grade", async (req, res) => {
  const { submissionId, controlValues = {} } = req.body || {};
  if (!submissionId) {
    return res.status(400).json({ error: "submissionId es obligatorio." });
  }
  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  const notion = new Client({ auth: config.notionSecret });
  try {
    const data: any = await notion.blocks.children.list({ block_id: submissionId });
    // Grade block = code(json) WITHOUT the feedback marker.
    const codeBlock = data.results.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonCodeBlock(b);
      return !(parsed && Array.isArray(parsed[FEEDBACK_MARKER]));
    }) as any;

    let merged: Record<string, string> = {};
    if (codeBlock) {
      const existing = parseJsonCodeBlock(codeBlock);
      if (existing && typeof existing === "object" && !Array.isArray(existing[FEEDBACK_MARKER])) merged = existing;
    }
    merged = { ...merged, ...controlValues };
    const jsonString = JSON.stringify(merged, null, 2);

    if (codeBlock) {
      await notion.blocks.update({
        block_id: codeBlock.id,
        code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
      } as any);
    } else {
      await notion.blocks.children.append({
        block_id: submissionId,
        children: [{
          object: "block",
          type: "code",
          code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
        }] as any,
      });
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: "No se pudo guardar la calificación." });
  }
});

// 6.3. Send feedback (comment + optional note + attachments) to a sender by email.
app.post("/api/send-feedback", uploadMemory.fields([{ name: "files" }, { name: "icon", maxCount: 1 }]), async (req, res) => {
  const recipientEmail = String(req.body?.recipientEmail || "").trim();
  const recipientName = String(req.body?.recipientName || "").trim() || "Remitente";
  const projectName = String(req.body?.projectName || "Proyecto").trim();
  const comment = String(req.body?.comment || "");
  const note = String(req.body?.note || "");
  const bgColor = String(req.body?.bgColor || "");
  const filesMap = (req.files as { [field: string]: Express.Multer.File[] } | undefined) || {};
  const files = filesMap.files || [];
  const iconFile = (filesMap.icon || [])[0];

  if (!recipientEmail) {
    return res.status(400).json({ error: "Falta el correo del destinatario." });
  }
  if (!comment.trim() && !note.trim() && files.length === 0) {
    return res.status(400).json({ error: "Escribe un comentario, una nota o adjunta un archivo." });
  }

  const gmailCreds = {
    clientId: process.env.GMAIL_CLIENT_ID || "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || "",
    sender: process.env.GMAIL_SENDER || "",
    senderName: process.env.MAIL_FROM_NAME || "ENVI",
  };
  if (!hasGmailCredentials(gmailCreds)) {
    return res.status(400).json({ error: "El correo no está configurado en el servidor." });
  }

  const submissionId = String(req.body?.submissionId || "").trim();
  const attachments: MailAttachment[] = files.map((f) => ({
    filename: f.originalname || "archivo",
    contentType: f.mimetype || "application/octet-stream",
    content: new Uint8Array(f.buffer),
  }));

  // Optional inline header icon (rasterized PNG). Kept separate from `files` so
  // it isn't stored in Notion nor listed as an attachment.
  let iconCid: string | undefined;
  if (iconFile && iconFile.buffer && iconFile.buffer.byteLength > 0 && iconFile.buffer.byteLength <= 512 * 1024) {
    iconCid = "projicon";
    attachments.unshift({
      filename: "icono.png",
      contentType: iconFile.mimetype || "image/png",
      content: new Uint8Array(iconFile.buffer),
      contentId: iconCid,
      inline: true,
    });
  }

  const { subject, html, text } = buildFeedbackEmail({
    recipientName,
    projectName,
    comment,
    note,
    files: files.map((f) => ({ name: f.originalname || "archivo" })),
    accentColor: bgColor,
    iconCid,
  });

  try {
    await sendGmailMessage(gmailCreds, {
      to: recipientEmail,
      toName: recipientName,
      subject,
      html,
      text,
      attachments,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `No se pudo enviar el correo: ${err.message || "error desconocido"}.` });
  }

  // Store the feedback (and its files) in Notion so it can be reviewed/previewed later.
  const config = loadConfig();
  const MAX_STORE_PER_FILE = 20 * 1024 * 1024;
  let filesBlockId = "";
  let entryFiles: { name: string; size: number }[] = files.map((f) => ({ name: f.originalname || "archivo", size: f.size || 0 }));

  if (config.notionSecret && submissionId) {
    const notion = new Client({ auth: config.notionSecret });

    // 1) Upload attachments to Notion and place them in a per-entry container toggle.
    if (files.length > 0) {
      try {
        const records: { uploadId: string; name: string; size: number; mimeType: string; extModified: boolean }[] = [];
        for (const f of files) {
          if ((f.size || 0) > MAX_STORE_PER_FILE) continue;
          const fileLike = {
            name: f.originalname || "archivo",
            type: f.mimetype || "application/octet-stream",
            arrayBuffer: async () => f.buffer.buffer.slice(f.buffer.byteOffset, f.buffer.byteOffset + f.buffer.byteLength),
          } as unknown as File;
          const up = await uploadFileToNotion(fileLike, config.notionSecret);
          records.push({
            uploadId: up.id,
            name: up.originalName,
            size: f.size || 0,
            mimeType: f.mimetype || "application/octet-stream",
            extModified: up.extModified,
          });
        }
        if (records.length > 0) {
          const appendRes: any = await notion.blocks.children.append({
            block_id: submissionId,
            children: [{
              object: "block",
              type: "toggle",
              toggle: {
                rich_text: [{ type: "text", text: { content: `💬 Retroalimentación — ${new Date().toLocaleString("es-ES")}` } }],
                children: buildNotionFileBlocks(records),
              },
            }] as any,
          });
          filesBlockId = appendRes?.results?.[0]?.id || "";
          entryFiles = records.map((r) => ({ name: r.name, size: r.size }));
        }
      } catch {
        // Non-critical: the email was already sent.
      }
    }

    // 2) Append the feedback entry to the toggle's feedback JSON code block.
    try {
      const entry = { comment, note, files: entryFiles, filesBlockId, sentAt: new Date().toISOString() };
      const data: any = await notion.blocks.children.list({ block_id: submissionId });
      const block = data.results.find((b: any) => {
        if (b.type !== "code" || b.code?.language !== "json") return false;
        const parsed = parseJsonCodeBlock(b);
        return parsed && Array.isArray(parsed[FEEDBACK_MARKER]);
      }) as any;
      const history: any[] = block ? parseJsonCodeBlock(block)?.[FEEDBACK_MARKER] || [] : [];
      history.push(entry);
      const jsonString = JSON.stringify({ [FEEDBACK_MARKER]: history }, null, 2);
      if (block) {
        await notion.blocks.update({
          block_id: block.id,
          code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
        } as any);
      } else {
        await notion.blocks.children.append({
          block_id: submissionId,
          children: [{
            object: "block",
            type: "code",
            code: { rich_text: [{ type: "text", text: { content: jsonString } }], language: "json" },
          }] as any,
        });
      }
    } catch {
      // Non-critical: the email was already sent.
    }

    // 3) Sending supersedes any saved draft for this sender: remove it.
    try {
      const data: any = await notion.blocks.children.list({ block_id: submissionId });
      const draftBlock = data.results.find((b: any) => {
        if (b.type !== "code" || b.code?.language !== "json") return false;
        const parsed = parseJsonCodeBlock(b);
        return parsed && parsed[FEEDBACK_DRAFT_MARKER] && typeof parsed[FEEDBACK_DRAFT_MARKER] === "object";
      }) as any;
      if (draftBlock) {
        const draft = parseJsonCodeBlock(draftBlock)?.[FEEDBACK_DRAFT_MARKER];
        if (draft?.filesBlockId) {
          try { await notion.blocks.delete({ block_id: draft.filesBlockId }); } catch { /* already gone */ }
        }
        try { await notion.blocks.delete({ block_id: draftBlock.id }); } catch { /* already gone */ }
      }
    } catch {
      // Non-critical.
    }
  }

  const entry = { comment, note, files: entryFiles, filesBlockId, sentAt: new Date().toISOString() };

  res.json({ success: true, message: "Retroalimentación enviada por correo.", entry, draftCleared: true });
});

// 6.4. Delete a feedback entry (and its stored files) from Notion.
app.delete("/api/send-feedback", async (req, res) => {
  const submissionId = String(req.query.submissionId || "").trim();
  const index = parseInt(String(req.query.index ?? "-1"), 10);
  if (!submissionId || Number.isNaN(index) || index < 0) {
    return res.status(400).json({ error: "Parámetros inválidos." });
  }
  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }
  try {
    const notion = new Client({ auth: config.notionSecret });
    const data: any = await notion.blocks.children.list({ block_id: submissionId });
    const block = data.results.find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonCodeBlock(b);
      return parsed && Array.isArray(parsed[FEEDBACK_MARKER]);
    }) as any;
    if (!block) return res.json({ success: true });

    const history: any[] = parseJsonCodeBlock(block)?.[FEEDBACK_MARKER] || [];
    const entry = history[index];
    if (!entry) return res.json({ success: true });

    if (entry.filesBlockId) {
      try { await notion.blocks.delete({ block_id: entry.filesBlockId }); } catch { /* already gone */ }
    }
    history.splice(index, 1);
    if (history.length === 0) {
      try { await notion.blocks.delete({ block_id: block.id }); } catch { /* already gone */ }
    } else {
      await notion.blocks.update({
        block_id: block.id,
        code: { rich_text: [{ type: "text", text: { content: JSON.stringify({ [FEEDBACK_MARKER]: history }, null, 2) } }], language: "json" },
      } as any);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo eliminar: ${err.message || "error desconocido"}.` });
  }
});

// 6.5. Feedback DRAFT: save (comment + note + files) in Notion WITHOUT emailing,
// and delete it. Lets an admin keep work-in-progress feedback before sending.
async function clearFeedbackDraftServer(notion: any, submissionId: string): Promise<void> {
  const data: any = await notion.blocks.children.list({ block_id: submissionId });
  const draftBlock = data.results.find((b: any) => {
    if (b.type !== "code" || b.code?.language !== "json") return false;
    const parsed = parseJsonCodeBlock(b);
    return parsed && parsed[FEEDBACK_DRAFT_MARKER] && typeof parsed[FEEDBACK_DRAFT_MARKER] === "object";
  }) as any;
  if (!draftBlock) return;
  const draft = parseJsonCodeBlock(draftBlock)?.[FEEDBACK_DRAFT_MARKER];
  if (draft?.filesBlockId) {
    try { await notion.blocks.delete({ block_id: draft.filesBlockId }); } catch { /* already gone */ }
  }
  try { await notion.blocks.delete({ block_id: draftBlock.id }); } catch { /* already gone */ }
}

app.post("/api/feedback-draft", uploadMemory.array("files"), async (req, res) => {
  const comment = String(req.body?.comment || "");
  const note = String(req.body?.note || "");
  const submissionId = String(req.body?.submissionId || "").trim();
  const files = (req.files as Express.Multer.File[] | undefined) || [];

  if (!submissionId) return res.status(400).json({ error: "Falta el identificador del envío." });
  if (!comment.trim() && !note.trim() && files.length === 0) {
    return res.status(400).json({ error: "Escribe un comentario, una nota o adjunta un archivo." });
  }
  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });

  const notion = new Client({ auth: config.notionSecret });
  const MAX_STORE_PER_FILE = 20 * 1024 * 1024;
  try {
    // Replace any previous draft (and its files) first.
    await clearFeedbackDraftServer(notion, submissionId);

    let filesBlockId = "";
    let entryFiles: { name: string; size: number }[] = files.map((f) => ({ name: f.originalname || "archivo", size: f.size || 0 }));
    if (files.length > 0) {
      const records: { uploadId: string; name: string; size: number; mimeType: string; extModified: boolean }[] = [];
      for (const f of files) {
        if ((f.size || 0) > MAX_STORE_PER_FILE) continue;
        const fileLike = {
          name: f.originalname || "archivo",
          type: f.mimetype || "application/octet-stream",
          arrayBuffer: async () => f.buffer.buffer.slice(f.buffer.byteOffset, f.buffer.byteOffset + f.buffer.byteLength),
        } as unknown as File;
        const up = await uploadFileToNotion(fileLike, config.notionSecret);
        records.push({
          uploadId: up.id,
          name: up.originalName,
          size: f.size || 0,
          mimeType: f.mimetype || "application/octet-stream",
          extModified: up.extModified,
        });
      }
      if (records.length > 0) {
        const appendRes: any = await notion.blocks.children.append({
          block_id: submissionId,
          children: [{
            object: "block",
            type: "toggle",
            toggle: {
              rich_text: [{ type: "text", text: { content: `📝 Borrador — ${new Date().toLocaleString("es-ES")}` } }],
              children: buildNotionFileBlocks(records),
            },
          }] as any,
        });
        filesBlockId = appendRes?.results?.[0]?.id || "";
        entryFiles = records.map((r) => ({ name: r.name, size: r.size }));
      }
    }

    const draft = { comment, note, files: entryFiles, filesBlockId, savedAt: new Date().toISOString() };
    await notion.blocks.children.append({
      block_id: submissionId,
      children: [{
        object: "block",
        type: "code",
        code: { rich_text: [{ type: "text", text: { content: JSON.stringify({ [FEEDBACK_DRAFT_MARKER]: draft }, null, 2) } }], language: "json" },
      }] as any,
    });
    res.json({ success: true, message: "Borrador guardado.", draft });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo guardar el borrador: ${err.message || "error desconocido"}.` });
  }
});

app.delete("/api/feedback-draft", async (req, res) => {
  const submissionId = String(req.query.submissionId || "").trim();
  if (!submissionId) return res.status(400).json({ error: "Parámetros inválidos." });
  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });
  try {
    const notion = new Client({ auth: config.notionSecret });
    await clearFeedbackDraftServer(notion, submissionId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo eliminar el borrador: ${err.message || "error desconocido"}.` });
  }
});

// 6.6. Project grades: store the computed grading table as a JSON code block placed
// OUTSIDE the submission toggles (a direct child of the project page), with a
// caption "<projectName> data". Upserts (replaces) it on every calculation.
const GRADES_MARKER = "__envi_grades__";

/** Reads the parent container id of a block (the project's parent page/toggle). */
async function getParentIdServer(notion: any, blockId: string): Promise<string> {
  try {
    const block: any = await notion.blocks.retrieve({ block_id: blockId });
    const p = block?.parent;
    if (!p) return "";
    if (p.type === "page_id") return p.page_id || "";
    if (p.type === "block_id") return p.block_id || "";
    if (p.type === "database_id") return p.database_id || "";
    return "";
  } catch {
    return "";
  }
}

/** Finds this project's grades block among a container's children (matched by projectId, paginated). */
async function findGradesBlockServer(notion: any, containerId: string, projectId: string): Promise<any | null> {
  let cursor: string | undefined;
  do {
    const data: any = await notion.blocks.children.list({ block_id: containerId, start_cursor: cursor, page_size: 100 });
    const match = (data.results || []).find((b: any) => {
      if (b.type !== "code" || b.code?.language !== "json") return false;
      const parsed = parseJsonCodeBlock(b);
      return parsed && parsed[GRADES_MARKER] && parsed[GRADES_MARKER].projectId === projectId;
    });
    if (match) return match;
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return null;
}

app.post("/api/project-grades", async (req, res) => {
  const projectId = String(req.body?.projectId || "").trim();
  const projectName = String(req.body?.projectName || "Proyecto").trim();
  const parentIdHint = String(req.body?.parentId || "").trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!projectId) return res.status(400).json({ error: "Falta el identificador del proyecto." });

  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });

  const payload = { [GRADES_MARKER]: { projectId, projectName, updatedAt: new Date().toISOString(), rows } };
  const gradesContent = JSON.stringify(payload, null, 2);
  // Notion caps each rich_text item at 2000 chars, so split long JSON into chunks.
  const gradesChunks: any[] = [];
  for (let i = 0; i < gradesContent.length; i += 2000) {
    gradesChunks.push({ type: "text", text: { content: gradesContent.slice(i, i + 2000) } });
  }
  const codeBody = {
    code: {
      rich_text: gradesChunks.length ? gradesChunks : [{ type: "text", text: { content: "" } }],
      language: "json",
      caption: [{ type: "text", text: { content: `${projectName} data` } }],
    },
  };

  try {
    const notion = new Client({ auth: config.notionSecret });
    // Save in the project's parent container: prefer the logical parent from the
    // app tree, then the Notion parent, then the project itself as a last resort.
    const containerId = parentIdHint || (await getParentIdServer(notion, projectId)) || projectId;
    const existing = await findGradesBlockServer(notion, containerId, projectId);
    let keptId = "";
    if (existing) {
      await notion.blocks.update({ block_id: existing.id, ...(codeBody as any) });
      keptId = existing.id;
    } else {
      const appendRes: any = await notion.blocks.children.append({
        block_id: containerId,
        children: [{ object: "block", type: "code", ...codeBody }] as any,
      });
      keptId = appendRes?.results?.[0]?.id || "";
    }

    // Clean up stale blocks left by earlier versions (root page / inside the project).
    const staleContainers = [config.parentPageId, projectId].filter((c) => c && c !== containerId);
    for (const c of staleContainers) {
      try {
        const stale = await findGradesBlockServer(notion, c, projectId);
        if (stale && stale.id !== keptId) await notion.blocks.delete({ block_id: stale.id });
      } catch {
        // Ignore cleanup failures.
      }
    }

    res.json({ success: true, blockId: keptId, updated: !!existing });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo guardar la tabla: ${err.message || "error desconocido"}.` });
  }
});

app.get("/api/project-grades", async (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ error: "Falta el identificador del proyecto." });
  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });
  try {
    const notion = new Client({ auth: config.notionSecret });
    const containerId = (await getParentIdServer(notion, projectId)) || projectId;
    const existing = await findGradesBlockServer(notion, containerId, projectId);
    const parsed = existing ? parseJsonCodeBlock(existing)?.[GRADES_MARKER] : null;
    res.json({ success: true, data: parsed || null, blockId: existing?.id || null });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo leer la tabla: ${err.message || "error desconocido"}.` });
  }
});

// 6.7. People registry (padrón) stored inside a PARENT project. Enables the
// registration mode: people register once (name/document/email/phone) and child
// activities identify them by document.
const REGISTRY_MARKER = "__envi_registry__";

async function listAllChildrenServer(notion: any, blockId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const data: any = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    for (const b of data.results || []) out.push(b);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

function findRegistryBlockServer(children: any[]): any | null {
  return children.find((b: any) => {
    if (b.type !== "code" || b.code?.language !== "json") return false;
    const parsed = parseJsonCodeBlock(b);
    return parsed && parsed[REGISTRY_MARKER] && typeof parsed[REGISTRY_MARKER] === "object";
  }) || null;
}

function isRegistrationOnServer(children: any[]): boolean {
  return children.some((b: any) => {
    if (b.type !== "code" || b.code?.language !== "json") return false;
    const parsed = parseJsonCodeBlock(b);
    return parsed && parsed.registrationMode === true;
  });
}

function readPeopleServer(block: any): any[] {
  const data = block ? parseJsonCodeBlock(block)?.[REGISTRY_MARKER] : null;
  return data && Array.isArray(data.people) ? data.people : [];
}

app.post("/api/registry", async (req, res) => {
  const parentId = String(req.body?.parentId || "").trim();
  const parentName = String(req.body?.parentName || "Registro").trim();
  const person = {
    document: String(req.body?.document || "").trim(),
    name: String(req.body?.name || "").trim(),
    email: String(req.body?.email || "").trim(),
    phone: String(req.body?.phone || "").trim(),
  };
  if (!parentId) return res.status(400).json({ error: "Falta el proyecto padre." });
  if (!person.document) return res.status(400).json({ error: "El documento es obligatorio." });
  if (!person.name) return res.status(400).json({ error: "El nombre es obligatorio." });
  if (!person.email) return res.status(400).json({ error: "El correo es obligatorio." });

  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });

  try {
    const notion = new Client({ auth: config.notionSecret });
    const children = await listAllChildrenServer(notion, parentId);
    if (!isRegistrationOnServer(children)) {
      return res.status(400).json({ error: "Este proyecto no está en modo registro." });
    }

    const block = findRegistryBlockServer(children);
    const people = readPeopleServer(block);
    const key = person.document.toLowerCase();
    const idx = people.findIndex((p: any) => String(p.document || "").trim().toLowerCase() === key);
    let saved: any;
    if (idx >= 0) {
      saved = { ...people[idx], ...person, registeredAt: people[idx].registeredAt || new Date().toISOString() };
      people[idx] = saved;
    } else {
      saved = { ...person, registeredAt: new Date().toISOString() };
      people.push(saved);
    }

    const payload = { [REGISTRY_MARKER]: { parentId, parentName, updatedAt: new Date().toISOString(), people } };
    const content = JSON.stringify(payload, null, 2);
    const chunks: any[] = [];
    for (let i = 0; i < content.length; i += 2000) chunks.push({ type: "text", text: { content: content.slice(i, i + 2000) } });
    const codeBody = {
      code: {
        rich_text: chunks.length ? chunks : [{ type: "text", text: { content: "" } }],
        language: "json",
        caption: [{ type: "text", text: { content: `${parentName} registro` } }],
      },
    };
    if (block) {
      await notion.blocks.update({ block_id: block.id, ...(codeBody as any) });
    } else {
      await notion.blocks.children.append({ block_id: parentId, children: [{ object: "block", type: "code", ...codeBody }] as any });
    }
    res.json({ success: true, person: saved, updated: idx >= 0 });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo registrar: ${err.message || "error desconocido"}.` });
  }
});

app.get("/api/registry", async (req, res) => {
  const parentId = String(req.query.parentId || "").trim();
  const document = String(req.query.document || "").trim();
  if (!parentId) return res.status(400).json({ error: "Falta el proyecto padre." });
  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });
  try {
    const notion = new Client({ auth: config.notionSecret });
    const children = await listAllChildrenServer(notion, parentId);
    const people = readPeopleServer(findRegistryBlockServer(children));
    if (document) {
      const key = document.toLowerCase();
      const person = people.find((p: any) => String(p.document || "").trim().toLowerCase() === key) || null;
      return res.json({ success: true, person });
    }
    res.json({ success: true, people });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo leer el registro: ${err.message || "error desconocido"}.` });
  }
});

// 6.8. Consolidated registry summary: roster + note per person per child activity
// (joined by document). Reads the parent once (registry + child grades blocks).
app.get("/api/registry-summary", async (req, res) => {
  const parentId = String(req.query.parentId || "").trim();
  if (!parentId) return res.status(400).json({ error: "Falta el proyecto padre." });
  const config = loadConfig();
  if (!config.notionSecret) return res.status(400).json({ error: "Notion no está configurado." });
  try {
    const notion = new Client({ auth: config.notionSecret });
    const children = await listAllChildrenServer(notion, parentId);

    let people: any[] = [];
    let parentName = "Registro";
    for (const b of children) {
      if (b.type !== "code" || b.code?.language !== "json") continue;
      const parsed = parseJsonCodeBlock(b);
      if (parsed && parsed[REGISTRY_MARKER]) {
        const reg = parsed[REGISTRY_MARKER];
        people = Array.isArray(reg.people) ? reg.people : [];
        parentName = reg.parentName || parentName;
        break;
      }
    }

    const emailToDoc: Record<string, string> = {};
    for (const p of people) {
      if (p?.email) emailToDoc[String(p.email).toLowerCase()] = String(p.document || "").trim();
    }

    const activities: { projectId: string; projectName: string }[] = [];
    const notes: Record<string, Record<string, { note: string; status: string }>> = {};
    for (const b of children) {
      if (b.type !== "code" || b.code?.language !== "json") continue;
      const g = parseJsonCodeBlock(b)?.[GRADES_MARKER];
      if (!g || !g.projectId) continue;
      activities.push({ projectId: g.projectId, projectName: g.projectName || "Actividad" });
      for (const row of Array.isArray(g.rows) ? g.rows : []) {
        const doc = String(row.document || "").trim() || emailToDoc[String(row.email || "").toLowerCase()] || "";
        if (!doc) continue;
        (notes[doc] = notes[doc] || {})[g.projectId] = { note: String(row.note || ""), status: String(row.status || "") };
      }
    }

    res.json({ success: true, parentName, people, activities, notes });
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo leer el resumen: ${err.message || "error desconocido"}.` });
  }
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
  const { senderName, senderEmail, projectId, projectName, fileRecords = [], bgColor = "", comment = "", document = "" } = req.body;
  const trimmedComment = String(comment || "").trim();
  const trimmedDocument = String(document || "").trim();

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
              content: `Información de la entrega:\n• Remitente: ${senderName.trim()}\n• Correo: ${senderEmail.trim()}${trimmedDocument ? `\n• Documento: ${trimmedDocument}` : ""}\n• Fecha de envío: ${dateStr}\n• Archivos totales: ${fileRecords.length}${trimmedComment ? `\n• Comentario: ${trimmedComment}` : ""}`,
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

    // Machine-readable document (read back for the registration/consolidated table).
    if (trimmedDocument) {
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: JSON.stringify({ [SUBMISSION_DOCUMENT_MARKER]: trimmedDocument }, null, 2) } }],
          language: "json",
        },
      });
    }

    // Machine-readable copy of the submitter's message so it can be read back
    // from Notion (source of truth) and shown in the admin.
    if (trimmedComment) {
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: JSON.stringify({ [SUBMISSION_COMMENT_MARKER]: trimmedComment }, null, 2) } }],
          language: "json",
        },
      });
    }

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
      comment: trimmedComment,
      document: trimmedDocument,
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
