import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { Client } from "@notionhq/client";

dotenv.config();

const app = express();
const PORT = 3000;

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
const NOTION_API_VER = "2022-06-28";

const ALLOWED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff",
  "mp4", "m4v", "ogv", "webm", "mov",
  "mp3", "wav", "m4a", "ogg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "html", "css", "js", "ts", "json", "xml", "md",
  "zip", "rar", "tar", "gz"
]);

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

    const dotIndex = filename.lastIndexOf(".");
    const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : "";
    let uploadName = filename;
    let contentType = mimeType;

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      uploadName = filename + ".zip";
      contentType = "application/zip";
    }

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
  const dotIndex = originalname.lastIndexOf(".");
  const ext = dotIndex !== -1 ? originalname.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = originalname;
  let contentType = mimeType || "application/octet-stream";
  let extModified = false;

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    uploadName = originalname + ".zip";
    contentType = "application/zip";
    extModified = true;
  }

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
  const dotIndex = originalname.lastIndexOf(".");
  const ext = dotIndex !== -1 ? originalname.slice(dotIndex + 1).toLowerCase() : "";
  let uploadName = originalname;
  let contentType = mimeType || "application/octet-stream";
  let extModified = false;

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    uploadName = originalname + ".zip";
    contentType = "application/zip";
    extModified = true;
  }

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

  if (!upload_url || !complete_url) {
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

    const partResp = await fetch(upload_url, {
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
  const completeResp = await fetch(complete_url, {
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
  const { projectId, title, description, step1, step2, step3, expirationDate, backgroundImage, isActive } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: "El ID del proyecto es obligatorio." });
  }

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
        isActive: isActive !== undefined ? !!isActive : true,
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
    isActive: isActive !== undefined ? !!isActive : true,
  };

  saveProjectMeta(metaList);
  res.json({ success: true, message: "Textos del proyecto configurados localmente debido a límites de conexión con Notion." });
});

// 4. Get active projects from Notion Parent Page
app.get("/api/projects", async (req, res) => {
  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return res.status(400).json({ error: "Notion no está configurado. Por favor, ve al panel de administración." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });
    
    // List block children from the parent page
    const response = await notion.blocks.children.list({
      block_id: config.parentPageId,
    });

    const metaList = loadProjectMeta();

    // Query projects as either toggle blocks or legacy child_page blocks
    const projects = response.results
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
        } else {
          return {
            id: block.id,
            name: block.child_page.title || "Proyecto sin título",
            type: "page",
            url: `https://notion.so/${block.id.replace(/-/g, "")}`,
            isActive,
          };
        }
      });

    res.json({ success: true, projects });
  } catch (err: any) {
    console.error("Error fetching projects from Notion:", err);
    res.status(500).json({
      error: `Error al conectar con Notion: ${err.message || "Error desconocido"}. Verifica tu token e ID de la página principal.`,
    });
  }
});

// 5. Create a new Project in Notion (creates toggle list child block)
app.post("/api/projects", async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "El nombre del proyecto es obligatorio" });
  }

  const config = loadConfig();
  if (!config.notionSecret || !config.parentPageId) {
    return res.status(400).json({ error: "Notion no está configurado." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });
    
    // Create project as an expandable toggle block
    const result = await notion.blocks.children.append({
      block_id: config.parentPageId,
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

    res.json({
      success: true,
      project: {
        id: newBlock.id,
        name: name.trim(),
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

// 6. Get Submissions Logs
app.get("/api/submissions", (req, res) => {
  res.json({ success: true, submissions: loadSubmissions() });
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

// 8. Submit files (creates Toggle block inside specific project child page using pre-uploaded fileIDs)
app.post("/api/submit", async (req, res) => {
  const { senderName, senderEmail, projectId, projectName, fileRecords = [] } = req.body;

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

    // Append standard toggle block with the children blocks inside
    await notion.blocks.children.append({
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

    // Save in local submissions index file for Admin view
    const submissionId = "sub_" + Date.now();
    const submissionRecord = {
      id: submissionId,
      projectId,
      projectName: projectName || "Proyecto de Notion",
      senderName: senderName.trim(),
      senderEmail: senderEmail.trim(),
      timestamp: new Date().toISOString(),
      files: fileRecords.map((f: any) => ({
        name: f.name,
        size: f.size,
        url: `(Subido a Notion: ${f.finalName})`
      })),
    };
    saveSubmission(submissionRecord);

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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
