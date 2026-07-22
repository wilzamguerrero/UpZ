import React, { useEffect, useState } from "react";
import {
  X, Download, ExternalLink, Loader2, FileText, AlertCircle, Maximize2,
  Image as ImageIcon, Film, Music, FileType2, File as FileIcon,
} from "lucide-react";

export interface ViewableFile {
  name: string;
  size?: number;
  url: string;
}

type Kind = "image" | "video" | "audio" | "pdf" | "text" | "office" | "other";

const EXT_KINDS: Record<string, Kind> = {
  // images
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  svg: "image", bmp: "image", avif: "image", ico: "image", heic: "image",
  // video
  mp4: "video", webm: "video", ogv: "video", mov: "video", m4v: "video", mkv: "video",
  // audio
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", aac: "audio", flac: "audio", opus: "audio",
  // pdf
  pdf: "pdf",
  // text / code
  txt: "text", md: "text", markdown: "text", json: "text", csv: "text", tsv: "text",
  log: "text", xml: "text", yml: "text", yaml: "text", ini: "text", conf: "text", env: "text",
  js: "text", mjs: "text", cjs: "text", ts: "text", tsx: "text", jsx: "text",
  css: "text", scss: "text", less: "text", html: "text", htm: "text", vue: "text", svelte: "text",
  py: "text", java: "text", c: "text", h: "text", cpp: "text", hpp: "text", cc: "text",
  cs: "text", go: "text", rb: "text", php: "text", rs: "text", kt: "text", swift: "text",
  sh: "text", bash: "text", zsh: "text", sql: "text", toml: "text", gradle: "text", dockerfile: "text",
  // office (rendered via Microsoft Office online viewer)
  doc: "office", docx: "office", xls: "office", xlsx: "office", ppt: "office", pptx: "office",
};

const getExt = (name: string, url: string): string => {
  const fromName = name.split("?")[0].split("#")[0].split(".").pop() || "";
  if (fromName && fromName !== name) return fromName.toLowerCase();
  const fromUrl = url.split("?")[0].split("#")[0].split(".").pop() || "";
  return fromUrl.toLowerCase();
};

const getKind = (name: string, url: string): Kind => {
  const ext = getExt(name, url);
  return EXT_KINDS[ext] || "other";
};

const KindIcon: React.FC<{ kind: Kind; className?: string }> = ({ kind, className }) => {
  switch (kind) {
    case "image": return <ImageIcon className={className} />;
    case "video": return <Film className={className} />;
    case "audio": return <Music className={className} />;
    case "pdf": return <FileType2 className={className} />;
    case "text": return <FileText className={className} />;
    case "office": return <FileType2 className={className} />;
    default: return <FileIcon className={className} />;
  }
};

/** Absolute URL needed by the Microsoft Office online viewer. */
const toAbsoluteUrl = (url: string): string => {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
};

const formatSize = (bytes?: number) => {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const TextPreview: React.FC<{ url: string }> = ({ url }) => {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        // Guard against enormous files freezing the UI.
        setContent(text.length > 500_000 ? text.slice(0, 500_000) + "\n\n… (contenido truncado)" : text);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "No se pudo cargar el archivo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando contenido...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 gap-2 text-sm">
        <AlertCircle className="w-6 h-6 text-amber-400" />
        No se pudo mostrar el contenido de texto.
      </div>
    );
  }
  return (
    <pre className="w-full h-full overflow-auto p-4 text-[12.5px] leading-relaxed font-mono text-emerald-100/90 whitespace-pre-wrap break-words bg-[#0a0a0a]">
      <code>{content}</code>
    </pre>
  );
};

/**
 * Renders a file's actual content INLINE (no modal needed): images, video,
 * audio, PDF and text preview directly. Other types show a compact card.
 * The expand button opens the full-screen FileViewer via `onExpand`.
 */
export const InlineFilePreview: React.FC<{
  file: ViewableFile;
  onExpand?: () => void;
  /** Tailwind height class for the preview area (default h-52). */
  heightClass?: string;
}> = ({ file, onExpand, heightClass = "h-52" }) => {
  const kind = getKind(file.name, file.url);

  const preview = () => {
    switch (kind) {
      case "image":
        return (
          <img
            src={file.url}
            alt={file.name}
            loading="lazy"
            onClick={onExpand}
            className="w-full h-full object-contain bg-black cursor-zoom-in"
          />
        );
      case "video":
        return (
          <video
            src={file.url}
            controls
            preload="metadata"
            className="w-full h-full object-contain bg-black"
          />
        );
      case "audio":
        return (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#0a0a0a] px-3">
            <Music className="w-8 h-8 text-white/40" />
            <audio src={file.url} controls className="w-full max-w-[95%]" />
          </div>
        );
      case "pdf":
        return (
          <iframe
            src={`${file.url}#toolbar=0&navpanes=0&view=FitH`}
            title={file.name}
            className="w-full h-full border-0 bg-white"
          />
        );
      case "text":
        return (
          <div className="w-full h-full overflow-hidden bg-[#0a0a0a]">
            <TextPreview url={file.url} />
          </div>
        );
      default:
        return (
          <button
            type="button"
            onClick={onExpand}
            className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#0a0a0a] text-white/50 hover:text-white/80 transition-colors"
          >
            <KindIcon kind={kind} className="w-9 h-9" />
            <span className="text-[11px] px-3 text-center">Abrir vista previa</span>
          </button>
        );
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#111111] overflow-hidden flex flex-col group/preview">
      <div className={`${heightClass} w-full overflow-hidden relative`}>
        {preview()}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-md bg-black/50 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white opacity-0 group-hover/preview:opacity-100 transition-opacity"
            title="Ampliar a pantalla completa"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 p-2 border-t border-white/5">
        <span className="truncate flex-1 text-[11px] text-white/80" title={file.name}>
          {file.name}
        </span>
        {file.size != null && (
          <span className="text-[10px] text-white/40 font-mono shrink-0">{formatSize(file.size)}</span>
        )}
        <a
          href={file.url}
          download={file.name}
          className="shrink-0 p-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
          title="Descargar archivo"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};

interface FileViewerProps {
  file: ViewableFile | null;
  onClose: () => void;
}

/** Full-screen modal that previews a file inline (image/video/audio/pdf/text/office)
 *  and always offers open-in-new-tab and download as a fallback. */
const FileViewer: React.FC<FileViewerProps> = ({ file, onClose }) => {
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [file, onClose]);

  if (!file) return null;

  const kind = getKind(file.name, file.url);
  const absoluteUrl = toAbsoluteUrl(file.url);

  const renderBody = () => {
    switch (kind) {
      case "image":
        return (
          <div className="flex items-center justify-center w-full h-full p-4 overflow-auto">
            <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        );
      case "video":
        return (
          <div className="flex items-center justify-center w-full h-full p-4">
            <video src={file.url} controls autoPlay className="max-w-full max-h-full rounded-lg bg-black" />
          </div>
        );
      case "audio":
        return (
          <div className="flex flex-col items-center justify-center w-full h-full gap-6 p-6">
            <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Music className="w-12 h-12 text-white/50" />
            </div>
            <audio src={file.url} controls autoPlay className="w-full max-w-md" />
          </div>
        );
      case "pdf":
        return (
          <iframe src={file.url} title={file.name} className="w-full h-full border-0 bg-white" />
        );
      case "text":
        return <TextPreview url={file.url} />;
      case "office":
        return (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`}
            title={file.name}
            className="w-full h-full border-0 bg-white"
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <FileIcon className="w-10 h-10 text-white/50" />
            </div>
            <div>
              <p className="text-sm text-white/70 font-medium">Vista previa no disponible</p>
              <p className="text-xs text-white/40 mt-1 max-w-xs">
                Este tipo de archivo no se puede mostrar aquí. Ábrelo en una pestaña nueva o descárgalo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña nueva
              </a>
              <a
                href={file.url}
                download={file.name}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </a>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0d0d0d]/80 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/60">
          <KindIcon kind={kind} className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate" title={file.name}>{file.name}</p>
          {file.size != null && (
            <p className="text-[11px] text-white/40 font-mono">{formatSize(file.size)}</p>
          )}
        </div>
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all shrink-0"
          title="Abrir en pestaña nueva"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={file.url}
          download={file.name}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all shrink-0"
          title="Descargar"
        >
          <Download className="w-4 h-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all shrink-0"
          title="Cerrar (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {renderBody()}
      </div>
    </div>
  );
};

export default FileViewer;
