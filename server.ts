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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
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

// 2. Set config details
app.post("/api/config", (req, res) => {
  const { notionSecret, parentPageId } = req.body;
  if (!notionSecret || !parentPageId) {
    return res.status(400).json({ error: "Faltan datos de configuración" });
  }

  saveConfig({ notionSecret, parentPageId });
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
  const { projectId, title, description, step1, step2, step3, expirationDate, backgroundImage } = req.body;
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

    // Query projects as either toggle blocks or legacy child_page blocks
    const projects = response.results
      .filter((block: any) => block.type === "toggle" || block.type === "child_page")
      .map((block: any) => {
        if (block.type === "toggle") {
          const name = block.toggle.rich_text.map((rt: any) => rt.plain_text).join("").trim();
          return {
            id: block.id,
            name: name || "Proyecto sin título",
            type: "toggle",
            url: `https://notion.so/${config.parentPageId.replace(/-/g, "")}#${block.id.replace(/-/g, "")}`,
          };
        } else {
          return {
            id: block.id,
            name: block.child_page.title || "Proyecto sin título",
            type: "page",
            url: `https://notion.so/${block.id.replace(/-/g, "")}`,
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

// 6. Get Submissions Logs
app.get("/api/submissions", (req, res) => {
  res.json({ success: true, submissions: loadSubmissions() });
});

// 7. Submit files (creates Toggle block inside specific project child page)
app.post("/api/submit", upload.array("files"), async (req, res) => {
  const { senderName, senderEmail, projectId, projectName } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!senderName || !senderEmail || !projectId) {
    return res.status(400).json({ error: "Faltan campos obligatorios (nombre, correo o proyecto)" });
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No se han subido archivos" });
  }

  const config = loadConfig();
  if (!config.notionSecret) {
    return res.status(400).json({ error: "Notion no está configurado en el servidor." });
  }

  try {
    const notion = new Client({ auth: config.notionSecret });

    // Determine host URL for files
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");
    const appUrl = process.env.APP_URL || `${protocol}://${host}`;

    // Create file objects
    const fileAttachments = files.map((file) => {
      const downloadUrl = `${appUrl.replace(/\/$/, "")}/uploads/${file.filename}`;
      return {
        name: file.originalname,
        size: file.size,
        url: downloadUrl,
      };
    });

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
              content: `Información de la entrega:\n• Remitente: ${senderName.trim()}\n• Correo: ${senderEmail.trim()}\n• Fecha de envío: ${dateStr}\n• Archivos totales: ${files.length}`,
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

    // 3. Native File Blocks in Notion for a beautiful, standard visual integration
    fileAttachments.forEach((file) => {
      blocks.push({
        object: "block",
        type: "file",
        file: {
          type: "external",
          external: {
            url: file.url,
          },
        },
      });
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
      files: fileAttachments,
    };
    saveSubmission(submissionRecord);

    res.json({
      success: true,
      message: "¡Archivos subidos y registrados en Notion con éxito!",
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
