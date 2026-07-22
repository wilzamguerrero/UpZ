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

export interface RebuiltSubmission {
  id: string;
  projectId: string;
  projectName: string;
  senderName: string;
  senderEmail: string;
  timestamp: string;
  files: RebuiltFile[];
  controlValues: Record<string, string>;
  notionBlockId: string;
  dbPageId: string;
}

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
        // Bloque de calificaciones (controlValues) del modo sin base de datos.
        try {
          const jsonText = (blk.code.rich_text || []).map((rt: any) => rt.plain_text).join("").trim();
          const parsed = JSON.parse(jsonText);
          if (parsed && typeof parsed === "object") {
            sub.controlValues = parsed as Record<string, string>;
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
