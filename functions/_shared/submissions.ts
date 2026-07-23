// Reconstrucción de los envíos (remitentes) directamente desde Notion, para que
// la app funcione igual en local, Cloudflare o cualquier plataforma sin depender
// del KV. Cada envío es un toggle cuyo encabezado empieza con "👤".
//
// Es agnóstico del entorno: recibe una función `list(blockId)` que devuelve TODOS
// los hijos de un bloque (ya paginados). Tanto las Pages Functions (notionFetch)
// como el servidor Express (@notionhq/client) le pasan su propia implementación.

export interface RebuiltFile {
  name: string;
  size: number;
  url: string;
}

export interface RebuiltFeedback {
  comment: string;
  note?: string;
  files: (string | { name: string; size?: number })[];
  filesBlockId?: string;
  sentAt: string;
}

/** A saved-but-not-sent feedback draft (same shape, but savedAt instead of sentAt). */
export interface RebuiltDraft {
  comment: string;
  note?: string;
  files: (string | { name: string; size?: number })[];
  filesBlockId?: string;
  savedAt: string;
}

export interface RebuiltSubmission {
  id: string;
  projectId: string;
  projectName: string;
  senderName: string;
  senderEmail: string;
  timestamp: string;
  files: RebuiltFile[];
  /** Optional free-text message left by the submitter (when enabled per project). */
  comment?: string;
  /** Identity document (when the parent is in registration mode). */
  document?: string;
  controlValues: Record<string, string>;
  feedbackHistory: RebuiltFeedback[];
  /** Draft feedback saved but not yet emailed (null/undefined when none). */
  feedbackDraft?: RebuiltDraft | null;
  notionBlockId: string;
  dbPageId: string;
}

/** Marker that identifies the feedback-history JSON code block inside a toggle. */
export const FEEDBACK_MARKER = "__envi_feedback__";

/** Marker that identifies the saved-draft JSON code block inside a toggle. */
export const FEEDBACK_DRAFT_MARKER = "__envi_feedback_draft__";

/** Marker that identifies the submitter-comment JSON code block inside a toggle. */
export const SUBMISSION_COMMENT_MARKER = "__envi_comment__";

/** Marker that identifies the submitter-document JSON code block inside a toggle. */
export const SUBMISSION_DOCUMENT_MARKER = "__envi_document__";

export type ListChildrenFn = (blockId: string) => Promise<any[]>;

const SUBMISSION_PREFIX = "👤";
const MAX_TREE_DEPTH = 6;

export const isSubmissionHeader = (name: string): boolean =>
  name.trim().startsWith(SUBMISSION_PREFIX);

const toggleText = (b: any): string =>
  (b.toggle?.rich_text || []).map((rt: any) => rt.plain_text).join("").trim();

const captionText = (caption: any[] | undefined): string =>
  (caption || []).map((rt: any) => rt.plain_text).join("").trim();

/** "👤 Nombre (correo) — fecha" → { name, email } */
function parseSubmissionHeader(header: string): { name: string; email: string } {
  const cleaned = header.replace(/^👤\s*/, "");
  const m = cleaned.match(/^(.*?)\s*\(([^)]+)\)/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  // Sin correo entre paréntesis: toma lo anterior al " — ".
  const dash = cleaned.split("—")[0].trim();
  return { name: dash || "Remitente", email: "" };
}

/** Interpreta el caption de un archivo/imagen para sacar nombre y tamaño (bytes). */
function parseFileCaption(caption: string): { name: string; size: number } {
  const sizeMatch = caption.match(/\(([\d.]+)\s*MB\)\s*$/i);
  const size = sizeMatch ? Math.round(parseFloat(sizeMatch[1]) * 1024 * 1024) : 0;

  let namePart = sizeMatch ? caption.slice(0, sizeMatch.index).trim() : caption.trim();

  // Caso ".zip agregado": el nombre original va tras "Nombre original:".
  const nombreIdx = namePart.indexOf("Nombre original:");
  if (nombreIdx >= 0) {
    namePart = namePart.slice(nombreIdx + "Nombre original:".length).trim();
  }

  // Quita el emoji/símbolos iniciales (🖼️, 📄, ⚠️, etc.).
  namePart = namePart.replace(/^[^\p{L}\p{N}_]+/u, "").trim();

  return { name: namePart || "archivo", size };
}

/**
 * Recorre el árbol de proyectos desde `rootPageId` y devuelve todos los envíos.
 * - Por defecto devuelve datos básicos (sin archivos) para contar rápido.
 * - Si `filesForProjectId` coincide con un proyecto, ese proyecto trae sus
 *   archivos y valores de calificación (leyendo el contenido de cada toggle).
 */
export async function collectSubmissions(
  rootPageId: string,
  list: ListChildrenFn,
  opts: { filesForProjectId?: string } = {}
): Promise<RebuiltSubmission[]> {
  const subs: RebuiltSubmission[] = [];

  const hydrateFiles = async (sub: RebuiltSubmission, toggleId: string) => {
    let blocks: any[];
    try {
      blocks = await list(toggleId);
    } catch {
      return;
    }
    let fileIndex = 0;
    for (const blk of blocks) {
      if (blk.type === "image" && blk.image) {
        const { name, size } = parseFileCaption(captionText(blk.image.caption));
        sub.files.push({
          name,
          size,
          url: `/api/submission-file?block=${encodeURIComponent(toggleId)}&i=${fileIndex}`,
        });
        fileIndex++;
      } else if (blk.type === "file" && blk.file) {
        const { name, size } = parseFileCaption(captionText(blk.file.caption));
        sub.files.push({
          name,
          size,
          url: `/api/submission-file?block=${encodeURIComponent(toggleId)}&i=${fileIndex}`,
        });
        fileIndex++;
      } else if (blk.type === "code" && blk.code?.language === "json") {
        // Un bloque JSON puede ser: historial de retroalimentación (marcado) o
        // los valores de calificación (controlValues) del modo sin base de datos.
        try {
          const jsonText = (blk.code.rich_text || []).map((rt: any) => rt.plain_text).join("").trim();
          const parsed = JSON.parse(jsonText);
          if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed[FEEDBACK_MARKER])) {
              sub.feedbackHistory = parsed[FEEDBACK_MARKER];
            } else if (parsed[FEEDBACK_DRAFT_MARKER] && typeof parsed[FEEDBACK_DRAFT_MARKER] === "object") {
              sub.feedbackDraft = parsed[FEEDBACK_DRAFT_MARKER] as RebuiltDraft;
            } else if (typeof parsed[SUBMISSION_COMMENT_MARKER] === "string") {
              sub.comment = parsed[SUBMISSION_COMMENT_MARKER];
            } else if (typeof parsed[SUBMISSION_DOCUMENT_MARKER] === "string") {
              sub.document = parsed[SUBMISSION_DOCUMENT_MARKER];
            } else {
              sub.controlValues = parsed as Record<string, string>;
            }
          }
        } catch {
          // Ignorar JSON malformado.
        }
      }
    }
  };

  const walk = async (blockId: string, projectId: string, projectName: string, depth: number) => {
    if (depth > MAX_TREE_DEPTH) return;
    let children: any[];
    try {
      children = await list(blockId);
    } catch {
      return;
    }

    for (const b of children) {
      if (b.type === "toggle") {
        const name = toggleText(b);
        if (isSubmissionHeader(name)) {
          if (!projectId) continue; // envío fuera de un proyecto (no debería pasar)
          const { name: senderName, email } = parseSubmissionHeader(name);
          const sub: RebuiltSubmission = {
            id: b.id,
            notionBlockId: b.id,
            dbPageId: "",
            projectId,
            projectName,
            senderName,
            senderEmail: email,
            timestamp: b.created_time || new Date().toISOString(),
            files: [],
            controlValues: {},
            feedbackHistory: [],
          };
          if (opts.filesForProjectId && opts.filesForProjectId === projectId) {
            await hydrateFiles(sub, b.id);
          }
          subs.push(sub);
        } else {
          // Sub-proyecto / carpeta: baja un nivel.
          await walk(b.id, b.id, name || "Proyecto", depth + 1);
        }
      } else if (b.type === "child_page") {
        await walk(b.id, b.id, b.child_page?.title || "Proyecto", depth + 1);
      }
    }
  };

  await walk(rootPageId, "", "", 0);
  // Más recientes primero.
  subs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return subs;
}

/**
 * Reconstruye la metadata (color, icono, título, etc.) de TODOS los proyectos
 * leyendo el bloque JSON guardado dentro de cada proyecto en Notion. Devuelve un
 * mapa { projectId: meta } — la misma forma que usaba la caché KV.
 */
export async function collectProjectMetas(
  rootPageId: string,
  list: ListChildrenFn
): Promise<Record<string, any>> {
  const metas: Record<string, any> = {};

  const readMetaBlock = (children: any[]): any | null => {
    const codeBlocks = children.filter(
      (c: any) => c.type === "code" && c.code?.language === "json" && c.code?.rich_text
    );
    for (const codeBlock of codeBlocks) {
      try {
        const parsed = JSON.parse(
          codeBlock.code.rich_text.map((rt: any) => rt.plain_text).join("").trim()
        );
        if (!parsed || typeof parsed !== "object") continue;
        // Skip our own data blocks (grades/registry/feedback/comment/document) so they aren't read as meta.
        if (parsed["__envi_grades__"] || parsed["__envi_registry__"] || parsed[FEEDBACK_MARKER] || parsed[FEEDBACK_DRAFT_MARKER] || parsed[SUBMISSION_COMMENT_MARKER] || parsed[SUBMISSION_DOCUMENT_MARKER]) continue;
        return parsed;
      } catch {
        // Try the next JSON block.
      }
    }
    return null;
  };

  const processProject = async (projId: string, depth: number) => {
    if (depth > MAX_TREE_DEPTH) return;
    let children: any[];
    try {
      children = await list(projId);
    } catch {
      return;
    }
    const meta = readMetaBlock(children);
    if (meta) metas[projId] = meta;

    for (const c of children) {
      if (c.type === "child_page") {
        await processProject(c.id, depth + 1);
      } else if (c.type === "toggle" && !isSubmissionHeader(toggleText(c))) {
        await processProject(c.id, depth + 1);
      }
    }
  };

  let rootChildren: any[];
  try {
    rootChildren = await list(rootPageId);
  } catch {
    return metas;
  }
  for (const b of rootChildren) {
    if (b.type === "child_page") {
      await processProject(b.id, 1);
    } else if (b.type === "toggle" && !isSubmissionHeader(toggleText(b))) {
      await processProject(b.id, 1);
    }
  }

  return metas;
}
