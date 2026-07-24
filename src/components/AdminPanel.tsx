import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Key, FolderPlus, Eye, EyeOff, Check, Save, ClipboardList,
  AlertCircle, Plus, Search, Mail, Calendar, ExternalLink, ArrowRight, ArrowLeft, Trash2,
  ChevronDown, ChevronRight, X, RefreshCw, PanelLeftClose, PanelLeftOpen,
  Link, QrCode, Copy, GripVertical, Database, Table,
  // Icon picker icons
  UploadCloud, FileText, BookOpen, Code2, Palette, Microscope,
  GraduationCap, Briefcase, Star, Zap, Globe, Music, Camera, Cpu, Layers, Award, Package, Rocket,
  File, Folder, FolderOpen, Archive, Terminal, Server, Wifi, Monitor, Laptop, Smartphone,
  HardDrive, Keyboard, Image, Film, Video, Headphones, Mic, Radio, Tv,
  Sun, Moon, Cloud, Leaf, Mountain, Flower2, Snowflake, Flame,
  Activity, Dumbbell, Trophy, Target, Heart, Bell, Phone, Users, User,
  MessageCircle, Share2, ShoppingCart, Truck, Building2, Wallet, CreditCard,
  Wrench, Hammer, Settings, Calculator, Ruler, PencilLine, Scissors,
  Triangle, Hexagon, Hash, Percent, FlaskConical, Atom, Compass,
  Gamepad2, Tv2, Newspaper, Map, Lightbulb, Wand2, Sparkles, Brain,
  Lock, Shield, Eye as EyeIcon, Fingerprint, Bug, AlertTriangle,
  ChartBar, ChartPie, TrendingUp, BarChart3, Sigma, FunctionSquare,
  type LucideIcon
} from "lucide-react";
import { Project, Submission, NotionConfig, ProjectMeta, CustomField, DbColumn, FeedbackDraft } from "../types";
import { ICON_OPTIONS, ICON_BY_KEY, ICON_CATEGORIES } from "../icons";
import DateTimePicker from "./DateTimePicker";
import FileViewer, { ViewableFile, InlineFilePreview } from "./FileViewer";
import { useTheme } from "../ThemeContext";

const genId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const genColId = () => `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
/** Pick a random, recognizable icon (from the curated set) for every new project. */
const RANDOM_ICON_POOL = ICON_OPTIONS.filter((o) => o.cat !== "Más iconos");
const randomIconKey = () => {
  const pool = RANDOM_ICON_POOL.length > 0 ? RANDOM_ICON_POOL : ICON_OPTIONS;
  return pool[Math.floor(Math.random() * pool.length)]?.key || "UploadCloud";
};
const EMPTY_META_LOAD_SIGNATURE = "__missing__";

/** Rasterizes a Lucide icon into a PNG Blob so it can be embedded inline in an
 *  email (Gmail strips inline SVG, so we send a real PNG referenced by Content-ID).
 *  Renders the icon to an SVG string, draws it on a canvas, and exports PNG.
 *  Returns null on any failure (the icon is purely decorative). */
async function rasterizeIconPng(iconKey: string, color: string, size = 128): Promise<Blob | null> {
  try {
    const Icon = ICON_BY_KEY[iconKey] || UploadCloud;
    const { renderToStaticMarkup } = await import("react-dom/server");
    let svg = renderToStaticMarkup(
      React.createElement(Icon as LucideIcon, { color, size, strokeWidth: 2.5 } as any)
    );
    if (!/xmlns=/.test(svg)) {
      svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    // NOTE: `Image` from lucide-react shadows the DOM constructor, so use window.Image.
    const img = new window.Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = svgUrl;
    });
    if (!loaded) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return null;
  }
}

// ICON_OPTIONS, ICON_BY_KEY and ICON_CATEGORIES now live in ../icons (shared with the landing).

/** Square icon button that opens a large, categorized, searchable icon picker.
 *  Closes on outside click. Shared by the project and homepage appearance bars. */
const CategorizedIconPicker: React.FC<{
  value: string;
  onChange: (key: string) => void;
  title?: string;
  align?: "left" | "right";
}> = ({ value, onChange, title, align = "left" }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const Current = ICON_BY_KEY[value] || UploadCloud;
  const q = search.trim().toLowerCase();
  const matches = (o: typeof ICON_OPTIONS[number]) =>
    !q || o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q) || o.cat.toLowerCase().includes(q);

  const renderButton = (opt: typeof ICON_OPTIONS[number]) => (
    <button
      key={opt.key}
      type="button"
      onClick={() => { onChange(opt.key); setOpen(false); setSearch(""); }}
      className={`h-10 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${value === opt.key ? "border-white bg-white/15 text-white" : "border-white/10 bg-[#111111] text-white/60 hover:text-white hover:border-white/30"}`}
      title={`${opt.label} · ${opt.cat}`}
    >
      <opt.Icon className="w-4 h-4" />
    </button>
  );

  const filtered = ICON_OPTIONS.filter(matches);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all ${open ? "border-white/50 bg-white/15 text-white" : "border-white/15 bg-white/5 hover:bg-white/10 text-white"}`}
        title={title || "Elegir icono"}
      >
        <Current className="w-4 h-4" />
      </button>
      {open && (
        <div className={`admin-dark-popover absolute ${align === "right" ? "right-0" : "left-0"} mt-2 z-50 w-[24rem] max-w-[calc(100vw-3rem)] p-3 rounded-xl border border-white/10 shadow-2xl`}>
          <input
            type="text"
            autoFocus
            placeholder="Buscar icono por nombre o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full mb-3 px-2.5 py-2 bg-[#111111] border border-white/10 rounded-lg text-xs text-white placeholder-white/20 focus:border-white/30 focus:outline-none"
          />
          <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-3">
            {q ? (
              filtered.length > 0 ? (
                <div className="grid grid-cols-7 gap-1.5">{filtered.map(renderButton)}</div>
              ) : (
                <p className="text-[11px] text-white/40 text-center py-6">Sin resultados para "{search}"</p>
              )
            ) : (
              ICON_CATEGORIES.map((cat) => {
                const items = ICON_OPTIONS.filter((o) => o.cat === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5 px-0.5">{cat}</div>
                    <div className="grid grid-cols-7 gap-1.5">{items.map(renderButton)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const normalizeString = (s: string) => {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "-") // replace non-alphanumeric with dashes
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

/** First 6 hex chars of a Notion block id: a stable, unique-enough short id so
 *  two projects with the SAME name still get distinct public links. Derived from
 *  the id itself, so it needs no storage and works for existing projects too. */
const shortProjectId = (id: string) => (id || "").replace(/-/g, "").slice(0, 6).toLowerCase();
/** Public slug for a project: "<shortId>-<name-slug>" (e.g. "a1b2c3-materia1").
 *  Falls back to just the name slug if the id is missing. */
const projectSlug = (id: string, name: string) => {
  const base = normalizeString(name);
  const sid = shortProjectId(id);
  return sid ? `${sid}-${base}` : base;
};



interface ProjectTreeItemProps {
  node: Project;
  allProjects: Project[];
  depth: number;
  selectedId: string;
  metaMap: Record<string, ProjectMeta>;
  submissionsCount: (id: string) => number;
  isDeletingId: string | null;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string, name: string) => Promise<void>;
  onRename: (proj: Project, name: string) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
  onToggleActive: (id: string, current: boolean) => void;
}

/** Recursive tree row: folder/project with expand, create-inside, rename, delete. */
const ProjectTreeItem: React.FC<ProjectTreeItemProps> = ({
  node, allProjects, depth, selectedId, metaMap, submissionsCount, isDeletingId,
  onOpen, onCreateChild, onRename, onDelete, onToggleActive,
}) => {
  const children = allProjects.filter((project) => (project.parentId || "") === node.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === node.id;
  const isActive = node.isActive !== false;
  const meta = metaMap[node.id];
  const count = submissionsCount(node.id);

  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);
  const [savingRename, setSavingRename] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [copiedActLink, setCopiedActLink] = useState(false);
  const [copiedActQr, setCopiedActQr] = useState(false);

  // Public share link for this project (what you send to other people).
  // Uses an id-prefixed slug so same-named projects never collide.
  const shareUrl = `${window.location.origin}/${projectSlug(node.id, node.name)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(shareUrl)}`;
  // Registration mode adds a second "entregas" link (?entregar=1): one URL where
  // registered people load by document and pick which activity to submit to.
  const isRegistrationParent = !!meta?.registrationMode;
  const actUrl = `${shareUrl}-e`;
  const actQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(actUrl)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch {
      window.prompt("Copia el enlace:", shareUrl);
    }
  };

  const copyQr = async () => {
    try {
      const resp = await fetch(qrUrl);
      const blob = await resp.blob();
      const ClipItem = (window as any).ClipboardItem;
      if (navigator.clipboard && ClipItem) {
        await navigator.clipboard.write([new ClipItem({ [blob.type || "image/png"]: blob })]);
        setCopiedQr(true);
        setTimeout(() => setCopiedQr(false), 1500);
      } else {
        window.open(qrUrl, "_blank");
      }
    } catch {
      window.open(qrUrl, "_blank");
    }
  };

  const copyActLink = async () => {
    try {
      await navigator.clipboard.writeText(actUrl);
      setCopiedActLink(true);
      setTimeout(() => setCopiedActLink(false), 1500);
    } catch {
      window.prompt("Copia el enlace de entregas:", actUrl);
    }
  };

  const copyActQr = async () => {
    try {
      const resp = await fetch(actQrUrl);
      const blob = await resp.blob();
      const ClipItem = (window as any).ClipboardItem;
      if (navigator.clipboard && ClipItem) {
        await navigator.clipboard.write([new ClipItem({ [blob.type || "image/png"]: blob })]);
        setCopiedActQr(true);
        setTimeout(() => setCopiedActQr(false), 1500);
      } else {
        window.open(actQrUrl, "_blank");
      }
    } catch {
      window.open(actQrUrl, "_blank");
    }
  };

  const submitChild = async () => {
    const t = childName.trim();
    if (!t || creating) return;
    setCreating(true);
    try { await onCreateChild(node.id, t); setChildName(""); setAdding(false); setExpanded(true); }
    finally { setCreating(false); }
  };
  const submitRename = async () => {
    const t = renameName.trim();
    if (!t || savingRename) return;
    setSavingRename(true);
    try { await onRename(node, t); setRenaming(false); }
    finally { setSavingRename(false); }
  };

  const Icon = hasChildren ? (expanded ? FolderOpen : Folder) : (node.type === "page" ? FileText : Folder);
  // Always show an icon and a color square, falling back to sensible defaults.
  const MetaIcon = ICON_BY_KEY[meta?.icon || ""] || UploadCloud;
  const colorSwatch = meta?.bgColor || "#050505";
  const createdLabel = (() => {
    const iso = meta?.createdAt;
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  })();

  return (
    <div className="select-none">
      <div
        className={`group flex items-center gap-2 p-2.5 my-0.5 rounded-lg transition-all cursor-pointer ${
          isSelected ? "bg-white/10 border border-white/20" : "border border-transparent hover:bg-white/5"
        } ${!isActive ? "opacity-60" : ""}`}
        style={{ marginLeft: `${depth * 16}px` }}
        onClick={() => (hasChildren ? setExpanded((v) => !v) : onOpen(node.id))}
        title={hasChildren ? "Clic para desplegar/plegar" : "Clic para administrar este proyecto"}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white bg-white/5 hover:bg-white/10 shrink-0"
            title={expanded ? "Plegar" : "Desplegar"}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-7 h-7 shrink-0" />
        )}
        <Icon className="w-4 h-4 text-white/60 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-white truncate block">{node.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40 font-mono">{count} entregas</span>
            {hasChildren && (
              <span className="text-[10px] text-white/40 font-mono">
                · {children.length} {children.length === 1 ? "proyecto" : "proyectos"}
              </span>
            )}
            {meta?.registrationMode && (
              <span
                className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white border border-white/40 shrink-0"
                style={{ backgroundImage: "repeating-linear-gradient(119deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 1px, transparent 1px, transparent 6px)" }}
                title="Modo registro activo · el enlace registra personas y los hijos piden solo el documento"
              >
                <ClipboardList className="w-3 h-3" /> Registro
              </span>
            )}
            {meta?.useDatabase && <Database className="w-3 h-3 text-emerald-400" />}
            {!isActive && <span className="text-[9px] text-red-400">Inactivo</span>}
          </div>
        </div>

        {/* Creation date + color + icon — flat, borderless squares.
            The icon box stays neutral so it never gets confused with the color. */}
        <div className="flex items-center gap-1.5 shrink-0">
          {createdLabel && (
            <span className="text-[10px] font-mono text-white/40 mr-1 shrink-0" title="Fecha de creación">
              {createdLabel}
            </span>
          )}
          <span
            className="w-6 h-6 shrink-0"
            style={{ background: colorSwatch }}
            title={`Color: ${meta?.bgColor || "sin color"}`}
          />
          <span
            className="w-6 h-6 flex items-center justify-center shrink-0 bg-white/10"
            title="Icono del proyecto"
          >
            <MetaIcon className="w-3.5 h-3.5 text-white" />
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onOpen(node.id)} title="Administrar / editar" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"><ArrowRight className="w-3.5 h-3.5" /></button>
          <button onClick={() => setAdding((v) => !v)} title="Crear dentro" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setRenameName(node.name); setRenaming((v) => !v); }} title="Renombrar" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"><PencilLine className="w-3.5 h-3.5" /></button>
          <button onClick={() => onToggleActive(node.id, isActive)} title={isActive ? "Desactivar" : "Activar"} className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10">{isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
          <button onClick={copyLink} title={isRegistrationParent ? "Copiar enlace de REGISTRO" : "Copiar enlace para compartir"} className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10">{copiedLink ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}</button>
          <button onClick={copyQr} title={isRegistrationParent ? "Copiar QR de REGISTRO" : "Copiar código QR"} className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10">{copiedQr ? <Check className="w-3.5 h-3.5" /> : <QrCode className="w-3.5 h-3.5" />}</button>
          {isRegistrationParent && (
            <>
              <button
                onClick={copyActLink}
                title="Copiar enlace de ENTREGAS (un solo enlace para todas las actividades)"
                className="w-6 h-6 flex items-center justify-center rounded text-white/70 hover:text-white border border-white/40"
                style={{ backgroundImage: "repeating-linear-gradient(119deg, rgba(255,255,255,0.30) 0px, rgba(255,255,255,0.30) 1px, transparent 1px, transparent 6px)" }}
              >
                {copiedActLink ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={copyActQr}
                title="Copiar QR de ENTREGAS"
                className="w-6 h-6 flex items-center justify-center rounded text-white/70 hover:text-white border border-white/40"
                style={{ backgroundImage: "repeating-linear-gradient(119deg, rgba(255,255,255,0.30) 0px, rgba(255,255,255,0.30) 1px, transparent 1px, transparent 6px)" }}
              >
                {copiedActQr ? <Check className="w-3.5 h-3.5" /> : <QrCode className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
          <button onClick={() => onDelete(node.id, node.name)} disabled={isDeletingId === node.id} title="Eliminar" className="w-6 h-6 flex items-center justify-center rounded text-red-400/60 hover:text-red-400 hover:bg-red-950/20 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {adding && (
        <div className="flex items-center gap-1.5 my-1" style={{ marginLeft: `${(depth + 1) * 16}px` }} onClick={(e) => e.stopPropagation()}>
          <input autoFocus value={childName} onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitChild(); if (e.key === "Escape") { setAdding(false); setChildName(""); } }}
            placeholder="Nombre del nuevo proyecto/carpeta..."
            className="flex-1 min-w-0 bg-[#0d0d0d] border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none" />
          <button onClick={submitChild} disabled={!childName.trim() || creating} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setAdding(false); setChildName(""); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {renaming && (
        <div className="flex items-center gap-1.5 my-1" style={{ marginLeft: `${depth * 16}px` }} onClick={(e) => e.stopPropagation()}>
          <input autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") { setRenaming(false); setRenameName(node.name); } }}
            className="flex-1 min-w-0 bg-[#0d0d0d] border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none" />
          <button onClick={submitRename} disabled={!renameName.trim() || savingRename} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setRenaming(false); setRenameName(node.name); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {expanded && (
        <ProjectTreeList
          allProjects={allProjects}
          parentId={node.id}
          depth={depth + 1}
          selectedId={selectedId}
          metaMap={metaMap}
          submissionsCount={submissionsCount}
          isDeletingId={isDeletingId}
          onOpen={onOpen}
          onCreateChild={onCreateChild}
          onRename={onRename}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />
      )}
    </div>
  );
};

interface ProjectTreeListProps extends Omit<ProjectTreeItemProps, "node"> {
  parentId: string;
}

/** Renders the direct children of a folder/project, mirroring Notion's real nesting. */
const ProjectTreeList: React.FC<ProjectTreeListProps> = ({ parentId, ...props }) => {
  const { allProjects } = props;
  const siblings = allProjects
    .filter((project) => (project.parentId || "") === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {siblings.map((node) => (
        <ProjectTreeItem key={node.id} node={node} {...props} />
      ))}
    </div>
  );
};

interface AdminPanelProps {
  projects: Project[];
  refreshProjects: () => Promise<void>;
  config: {
    isConfigured: boolean;
    hasSecret: boolean;
    hasParentId: boolean;
    parentPageId: string;
    maskedSecret: string;
  } | null;
  refreshConfig: () => Promise<void>;
  projectMeta: Record<string, ProjectMeta>;
  refreshProjectMeta: (projectId?: string) => Promise<void>;
  applyProjectMetaUpdate: (projectId: string, meta: ProjectMeta) => void;
  applyProjectMetaUpdates: (updates: Record<string, Partial<ProjectMeta>>) => void;
  onAdminPreviewChange?: (preview: {
    projectId: string;
    bgColor: string;
    backgroundImage: string;
    bgBlur: number;
    textColor?: "auto" | "white" | "black";
    icon?: string;
  }) => void;
  /** Set (with a changing nonce) when a notification is clicked, to open that
   *  delivery's activity and focus the person. */
  focusDelivery?: { projectId: string; email: string; document: string; nonce: number } | null;
}

/** Returns a --btn-color value that is always legible on the black btn-motion-retro background.
 *  - Accent/yellow if no bgColor is provided
 *  - White if bgColor is dark (luminance ≤ 0.5)
 *  - The bgColor itself if it's light (visible on black)
 */
function safeRetroColor(bgColor?: string | null): string {
  if (!bgColor) return "var(--accent, #f5f011)";
  const hex = bgColor.replace("#", "").trim();
  if (hex.length !== 3 && hex.length !== 6) return "var(--accent, #f5f011)";
  const expanded = hex.length === 3
    ? hex.split("").map((c) => c + c).join("")
    : hex;
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Dark color → use white so stripes/text stay visible on black button background
  return lum <= 0.5 ? "#ffffff" : bgColor;
}

/** Latest feedback note for a sender's anchor submission, plus whether that note
 *  has been emailed (enviado) or is only saved as a draft (guardado). Prefers the
 *  most recent note available. */
function latestFeedbackNote(anchor?: Submission): { note: string; status: "enviado" | "guardado" | null } {
  if (!anchor) return { note: "", status: null };
  const draft = anchor.feedbackDraft;
  const history = anchor.feedbackHistory || [];
  const lastSent = history.length ? history[history.length - 1] : null;
  if (draft && (draft.note || "").trim()) return { note: (draft.note || "").trim(), status: "guardado" };
  if (lastSent && (lastSent.note || "").trim()) return { note: (lastSent.note || "").trim(), status: "enviado" };
  if (draft) return { note: "", status: "guardado" };
  if (lastSent) return { note: "", status: "enviado" };
  return { note: "", status: null };
}

/** True when a #rgb / #rrggbb color is light (needs dark text/stripes on top). */
function isHexLight(hex?: string | null): boolean {
  if (!hex) return false;
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
}

/** Previews a locally-selected File (before sending) using an object URL, with a
 *  remove button. Reuses InlineFilePreview so it looks like the received files. */
const LocalFilePreview: React.FC<{
  file: File;
  onRemove: () => void;
  onExpand: (vf: ViewableFile) => void;
}> = ({ file, onRemove, onExpand }) => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) {
    return <div className="h-40 rounded-lg bg-white/5 border border-white/10 animate-pulse" />;
  }
  const vf: ViewableFile = { name: file.name, size: file.size, url };
  return (
    <div className="relative">
      <InlineFilePreview file={vf} onExpand={() => onExpand(vf)} heightClass="h-40" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center shadow-lg"
        title="Quitar archivo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default function AdminPanel({
  projects,
  refreshProjects,
  config,
  refreshConfig,
  projectMeta,
  refreshProjectMeta,
  applyProjectMetaUpdate,
  applyProjectMetaUpdates,
  onAdminPreviewChange,
  focusDelivery
}: AdminPanelProps) {
  const { appearance, saveAppearance } = useTheme();

  // Config state
  const [notionSecret, setNotionSecret] = useState("");
  const [parentPageId, setParentPageId] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Homepage appearance editor states
  const [homeIcon, setHomeIcon] = useState(appearance.homeIcon);
  const [homeBgColor, setHomeBgColor] = useState(appearance.homeBgColor);
  const [homeIconSearch, setHomeIconSearch] = useState("");
  const [homeIconOpen, setHomeIconOpen] = useState(false);
  const [isSavingHomeAppearance, setIsSavingHomeAppearance] = useState(false);
  const [homeAppearanceMessage, setHomeAppearanceMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Copywriting editor states
  const [selectedMetaProjectId, setSelectedMetaProjectId] = useState<string>(() => {
    try { return sessionStorage.getItem("envi_admin_project") || ""; } catch { return ""; }
  });
  const [copyTitle, setCopyTitle] = useState("");
  const [copyDesc, setCopyDesc] = useState("");
  const [copyCustomFields, setCopyCustomFields] = useState<CustomField[]>([]);
  const [copyExpiration, setCopyExpiration] = useState("");
  const [copyBackground, setCopyBackground] = useState("");
  const [copyBgBlur, setCopyBgBlur] = useState(0);
  const [copyBgColor, setCopyBgColor] = useState("");
  const [copyIsActive, setCopyIsActive] = useState(true);
  const [copyIcon, setCopyIcon] = useState("UploadCloud");
  const [copyTextColor, setCopyTextColor] = useState<"auto" | "white" | "black">("auto");
  const [iconSearch, setIconSearch] = useState("");

  const [copyUseDatabase, setCopyUseDatabase] = useState(false);
  const [copyDatabaseId, setCopyDatabaseId] = useState("");
  const [copyDbColumns, setCopyDbColumns] = useState<DbColumn[]>([]);
  const [copyAllowComment, setCopyAllowComment] = useState(false);
  const [copyRegistrationMode, setCopyRegistrationMode] = useState(false);

  const bgColorLuminance = (() => {
    if (!copyBgColor) return null;
    const hex = copyBgColor.replace("#", "").trim();
    if (hex.length !== 3 && hex.length !== 6) return null;
    const expanded = hex.length === 3
      ? hex.split("").map((char) => char + char).join("")
      : hex;
    const r = parseInt(expanded.slice(0, 2), 16) / 255;
    const g = parseInt(expanded.slice(2, 4), 16) / 255;
    const b = parseInt(expanded.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  })();
  const isBgColorLight = bgColorLuminance !== null && bgColorLuminance > 0.55;
  const databaseSurface = copyBgColor
    ? (isBgColorLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.07)")
    : "#0a0a0a";
  const databaseBorder = copyBgColor
    ? (isBgColorLight ? "rgba(0, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.12)")
    : "rgba(255, 255, 255, 0.05)";
  const databaseText = copyBgColor
    ? (isBgColorLight ? "#111111" : "#ffffff")
    : "#ffffff";
  const databaseMuted = copyBgColor
    ? (isBgColorLight ? "rgba(17, 17, 17, 0.58)" : "rgba(255, 255, 255, 0.44)")
    : "rgba(255, 255, 255, 0.30)";
  const databaseAccent = copyBgColor || "var(--accent, #f5f011)";

  // Two-view navigation: "browse" = visor of all projects/groups + create;
  // "detail" = the selected project's editor + its submissions.
  // Persisted for the session so saving never kicks you back to the browse view.
  const [adminView, setAdminView] = useState<"browse" | "detail">(() => {
    try { return sessionStorage.getItem("envi_admin_view") === "detail" ? "detail" : "browse"; } catch { return "browse"; }
  });

  // Adaptive panel surface: when a project with a bgColor is selected, the admin
  // cards become a translucent dark surface so the project's color bleeds through
  // the background — mirroring the published landing so you can tell which project
  // you're editing. White text stays readable on any project color.
  // In detail we preview the project color; in browse we preview the homepage cover
  // color, so panels go flat/transparent in both cases when a color is active.
  const useAdaptivePanel = adminView === "detail" ? !!copyBgColor : !!homeBgColor;
  // When a project color is active, panels go flat & transparent so the config looks
  // exactly like the clean published landing (the color and particles show through).
  const panelClass = useAdaptivePanel
    ? "adaptive-card rounded-2xl p-6 transition-colors"
    : "bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-none transition-colors";
  const panelStyle: React.CSSProperties = useAdaptivePanel
    ? { backgroundColor: "transparent", border: "none", boxShadow: "none" }
    : {};

  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [copyGroupId, setCopyGroupId] = useState("");

  const [isUploadingBg, setIsUploadingBg] = useState(false);
  // Coalesce rapid color-picker changes into one state update per animation frame
  // so dragging the picker stays smooth instead of firing dozens of renders.
  const colorRafRef = useRef<number | null>(null);
  const setCopyBgColorSmooth = (value: string) => {
    if (colorRafRef.current !== null) cancelAnimationFrame(colorRafRef.current);
    colorRafRef.current = requestAnimationFrame(() => {
      setCopyBgColor(value);
      colorRafRef.current = null;
    });
  };
  const setHomeBgColorSmooth = (value: string) => {
    if (colorRafRef.current !== null) cancelAnimationFrame(colorRafRef.current);
    colorRafRef.current = requestAnimationFrame(() => {
      setHomeBgColor(value);
      colorRafRef.current = null;
    });
  };


  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedShareQr, setCopiedShareQr] = useState(false);
  const [metaMessage, setMetaMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Project state
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isDeletingProjectId, setIsDeletingProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  // Reusable styled confirm dialog (replaces native window.confirm everywhere).
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    accentColor?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** Re-pull projects + metadata from Notion without reloading the page. */
  const handleRefreshData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshProjects();
      await refreshProjectMeta();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSenders, setExpandedSenders] = useState<Record<string, boolean>>({});
  const [isDeletingSubmissionId, setIsDeletingSubmissionId] = useState<string | null>(null);
  // Per-sender feedback state (comment + optional note + attachments), keyed by email.
  const [feedback, setFeedback] = useState<Record<string, {
    comment: string;
    note: string;
    files: File[];
    sending: boolean;
    savingDraft?: boolean;
    msg?: { type: "success" | "error"; text: string };
  }>>({});

  // Which feedback-history entry is being viewed per sender (carousel index).
  const [feedbackView, setFeedbackView] = useState<Record<string, number>>({});
  // Remembers which draft version (savedAt) we've already loaded into the compose
  // form per sender, so refreshes don't overwrite the admin's in-progress edits.
  const draftSeededRef = useRef<Record<string, string>>({});
  // Last grades signature persisted to Notion per project, to avoid redundant writes.
  const gradesSigRef = useRef<Record<string, string>>({});

  // Consolidated registry summary (registration-mode parent): people × activities.
  const [regSummary, setRegSummary] = useState<{
    people: { document?: string; name?: string; email?: string; phone?: string }[];
    activities: { projectId: string; projectName: string }[];
    notes: Record<string, Record<string, { note: string; status: string; pending?: boolean }>>;
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  // Add/edit a registered person directly from the admin.
  const [personEditor, setPersonEditor] = useState<{ mode: "add" | "edit"; original?: string; name: string; document: string; email: string; phone: string } | null>(null);
  const [personEditorError, setPersonEditorError] = useState<string | null>(null);
  const [savingPerson, setSavingPerson] = useState(false);
  const [copiedActLink, setCopiedActLink] = useState(false);
  const [copiedActQr, setCopiedActQr] = useState(false);
  // Which identity columns are visible in the consolidated table (admin toggles).
  // Persisted per browser so the choice sticks between sessions.
  const [regCols, setRegCols] = useState<{ persona: boolean; documento: boolean; correo: boolean; telefono: boolean }>(() => {
    try {
      const raw = localStorage.getItem("envi_registry_cols");
      if (raw) {
        const p = JSON.parse(raw);
        return { persona: p.persona !== false, documento: p.documento !== false, correo: p.correo !== false, telefono: p.telefono !== false };
      }
    } catch { /* ignore */ }
    return { persona: true, documento: true, correo: true, telefono: true };
  });
  const [showColsMenu, setShowColsMenu] = useState(false);
  // When navigating to a child activity from the consolidated table, remember which
  // person to auto-open there so the admin lands right on their submission.
  const [pendingSenderFocus, setPendingSenderFocus] = useState<{ projectId: string; email: string; document: string } | null>(null);

  // New-delivery notifications now live in the app-level <NotificationCenter/>.
  // The admin only needs to react to a clicked notification via `focusDelivery`.

  useEffect(() => {
    try { localStorage.setItem("envi_registry_cols", JSON.stringify(regCols)); } catch { /* ignore */ }
  }, [regCols]);

  const loadRegistrySummary = async (parentId: string) => {
    if (!parentId) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/registry-summary?parentId=${encodeURIComponent(parentId)}`);
      const data = await res.json();
      setRegSummary(data.success ? { people: data.people || [], activities: data.activities || [], notes: data.notes || {} } : null);
    } catch {
      setRegSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  };

  /** Add or edit a person in the registry (admin), then refresh the summary. */
  const savePersonEditor = async () => {
    if (!personEditor || !selectedMetaProjectId) return;
    if (!personEditor.name.trim() || !personEditor.document.trim() || !personEditor.email.trim()) {
      setPersonEditorError("Completa nombre, documento y correo.");
      return;
    }
    setSavingPerson(true);
    setPersonEditorError(null);
    try {
      const parentName = projects.find((p) => p.id === selectedMetaProjectId)?.name || "Registro";
      const res = await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: selectedMetaProjectId,
          parentName,
          name: personEditor.name.trim(),
          document: personEditor.document.trim(),
          email: personEditor.email.trim(),
          phone: personEditor.phone.trim(),
          originalDocument: personEditor.mode === "edit" ? (personEditor.original || "") : "",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPersonEditor(null);
        await loadRegistrySummary(selectedMetaProjectId);
      } else {
        setPersonEditorError(data.error || "No se pudo guardar.");
      }
    } catch {
      setPersonEditorError("Error de red al guardar.");
    } finally {
      setSavingPerson(false);
    }
  };

  /** Remove a person from the registry (admin), after confirmation. */
  const deletePerson = (document: string, name: string) => {
    const parentId = selectedMetaProjectId;
    setConfirmDialog({
      title: "Eliminar del registro",
      message: (
        <>
          ¿Eliminar a <span className="text-white font-semibold">{name || document}</span> del registro? Esta acción no se puede deshacer.
        </>
      ),
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        try {
          await fetch(`/api/registry?parentId=${encodeURIComponent(parentId)}&document=${encodeURIComponent(document)}`, { method: "DELETE" });
        } catch {
          // Ignore network errors; refresh below reflects the real state.
        }
        await loadRegistrySummary(parentId);
      },
    });
  };

  // Compose/draft state is keyed by PROJECT + sender email, not email alone.
  // The same person (same email/document) can appear in several projects
  // (registration mode), so an email-only key would leak one project's note into
  // the others' compose forms. `projectId` defaults to the open project.
  const fbKey = (email: string, projectId?: string) =>
    `${projectId ?? selectedMetaProjectId ?? ""}::${(email || "").toLowerCase()}`;

  const getFeedback = (email: string) =>
    feedback[fbKey(email)] || { comment: "", note: "", files: [], sending: false };
  const setFeedbackFor = (email: string, patch: Partial<{ comment: string; note: string; files: File[]; sending: boolean; savingDraft: boolean; msg?: { type: "success" | "error"; text: string } }>) =>
    setFeedback((prev) => ({ ...prev, [fbKey(email)]: { ...getFeedback(email), ...patch } }));

  /** Rebuilds File objects from a draft's Notion-stored files so the compose form
   *  is fully restored (and sending re-uploads/emails them as usual). */
  const reconstructDraftFiles = async (draft: FeedbackDraft): Promise<File[]> => {
    if (!draft.filesBlockId || !draft.files?.length) return [];
    const out: File[] = [];
    for (let i = 0; i < draft.files.length; i++) {
      const meta = draft.files[i];
      const name = typeof meta === "string" ? meta : meta.name;
      try {
        const res = await fetch(`/api/submission-file?block=${encodeURIComponent(draft.filesBlockId)}&i=${i}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        // NOTE: `File` from lucide-react shadows the DOM constructor here, so use window.File.
        out.push(new window.File([blob], name, { type: blob.type || "application/octet-stream" }));
      } catch {
        // Skip a file we can't fetch; the rest still load.
      }
    }
    return out;
  };

  /** Build the grade rows (one per sender) for a set of submissions, ordered by
   *  entry order, using the latest feedback note + its status. */
  const buildGradesRows = (subs: Submission[]) => {
    const groups: Record<string, Submission[]> = {};
    for (const s of subs) {
      const em = s.senderEmail.toLowerCase();
      (groups[em] = groups[em] || []).push(s);
    }
    const rows = Object.values(groups).map((group) => {
      const sorted = [...group].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const earliest = sorted[0];
      const latest = sorted[sorted.length - 1];
      const { note, status } = latestFeedbackNote(earliest);
      // Prefer any submission that carries a document (registration mode).
      const document = group.map((s) => s.document).find((d) => d && d.trim()) || "";
      // "Pending" = the person delivered something that still needs (re)grading:
      // either no feedback has been SENT yet, or their latest submission is newer
      // than the last sent feedback (they re-sent after being graded).
      const hist = earliest.feedbackHistory || [];
      const lastSentTs = hist.length ? new Date(hist[hist.length - 1].sentAt || 0).getTime() : 0;
      const latestSubTs = new Date(latest.timestamp).getTime();
      const pending = lastSentTs === 0 ? true : latestSubTs > lastSentTs;
      return {
        name: earliest.senderName,
        email: earliest.senderEmail,
        document,
        note,
        status: status || "sin_retro",
        pending,
        submissions: group.length,
        submittedAt: latest.timestamp,
        _ts: new Date(earliest.timestamp).getTime(),
      };
    });
    rows.sort((a, b) => a._ts - b._ts);
    return rows.map((r, i) => ({
      order: i + 1,
      name: r.name,
      email: r.email,
      document: r.document,
      note: r.note,
      status: r.status,
      pending: r.pending,
    }));
  };

  /** Persist the grades table (latest notes per sender) to Notion as a JSON block
   *  outside the submission toggles, so it can be read/aggregated externally. */
  const persistProjectGrades = async (projectId: string, subs: Submission[]) => {
    if (!projectId) return;
    const proj = projects.find((p) => p.id === projectId);
    const projectName = proj?.name || projectMeta[projectId]?.title || "Proyecto";
    // Logical parent (the folder/toggle that contains this project in the tree).
    const parentId = proj?.parentId || "";
    const rows = buildGradesRows(subs.filter((s) => s.projectId === projectId));
    try {
      await fetch("/api/project-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName, parentId, rows }),
      });
    } catch {
      // Non-critical: the notes are still shown in the UI.
    }
  };

  // Keep the summary grades JSON in Notion in sync with what's shown: generate it
  // when the project's submissions are loaded and re-save whenever a note changes.
  // A signature check avoids redundant writes; a hydration check avoids saving the
  // light (files-less) list before the project's feedback data has loaded.
  useEffect(() => {
    const pid = selectedMetaProjectId;
    if (!pid || loadingSubmissions) return;
    const subs = submissions.filter((s) => s.projectId === pid);
    // Not hydrated yet (submissions exist but files/feedback not loaded) → wait.
    if (subs.length > 0 && !subs.some((s) => (s.files?.length || 0) > 0)) return;
    const rows = buildGradesRows(subs);
    const sig = JSON.stringify(rows);
    if (gradesSigRef.current[pid] === sig) return;
    gradesSigRef.current[pid] = sig;
    void persistProjectGrades(pid, submissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, selectedMetaProjectId, loadingSubmissions]);

  // Load the consolidated registry summary when a registration-mode parent is open.
  useEffect(() => {
    const isRegistrationParent = adminView === "detail" && copyRegistrationMode
      && !!selectedMetaProjectId && projects.some((p) => (p.parentId || "") === selectedMetaProjectId);
    if (isRegistrationParent) {
      void loadRegistrySummary(selectedMetaProjectId);
    } else {
      setRegSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetaProjectId, copyRegistrationMode, adminView, projects]);

  /** Send feedback (comment + optional note + attachments) to a sender by email.
   *  `submissionId` is the sender's anchor toggle where the history is stored. */
  const sendFeedback = async (email: string, name: string, submissionId: string) => {
    const fb = getFeedback(email);
    if (!fb.comment.trim() && !fb.note.trim() && fb.files.length === 0) {
      setFeedbackFor(email, { msg: { type: "error", text: "Escribe un comentario, una nota o adjunta un archivo." } });
      return;
    }
    setFeedbackFor(email, { sending: true, msg: undefined });
    try {
      const form = new FormData();
      form.append("recipientEmail", email);
      form.append("recipientName", name);
      form.append("projectName", selectedProjectName || "Proyecto");
      form.append("comment", fb.comment);
      form.append("note", fb.note);
      form.append("bgColor", copyBgColor || "");
      form.append("submissionId", submissionId || "");
      fb.files.forEach((f) => form.append("files", f, f.name));

      // Rasterize the project's icon to a PNG and attach it so the email can show
      // it inline next to "ENVI" (color contrasts with the accent header bg).
      const iconColor = copyBgColor && isBgColorLight ? "#111111" : "#ffffff";
      const iconBlob = await rasterizeIconPng(copyIcon, iconColor, 128);
      if (iconBlob) form.append("icon", iconBlob, "icono.png");

      const res = await fetch("/api/send-feedback", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        const entry = data.entry || {
          comment: fb.comment,
          note: fb.note,
          files: fb.files.map((f) => f.name),
          sentAt: new Date().toISOString(),
        };
        // Optimistically append to the anchor submission's history so it shows now,
        // and clear any saved draft (sending supersedes it).
        if (submissionId) {
          draftSeededRef.current[fbKey(email)] = "__sent__";
          setSubmissions((prev) =>
            prev.map((s) =>
              s.id === submissionId
                ? { ...s, feedbackHistory: [...(s.feedbackHistory || []), entry], feedbackDraft: null }
                : s
            )
          );
        }
        // Clear the form and jump the viewer to the newest entry.
        setFeedback((prev) => ({
          ...prev,
          [fbKey(email)]: { comment: "", note: "", files: [], sending: false, msg: { type: "success", text: "¡Retroalimentación enviada al correo!" } },
        }));
        setFeedbackView((v) => ({ ...v, [email]: Number.MAX_SAFE_INTEGER }));
      } else {
        setFeedbackFor(email, { sending: false, msg: { type: "error", text: data.error || "No se pudo enviar." } });
      }
    } catch {
      setFeedbackFor(email, { sending: false, msg: { type: "error", text: "Error de red al enviar." } });
    }
  };

  /** Save feedback (comment + note + attachments) as a DRAFT in Notion, without
   *  emailing it. Replaces any previous draft for this sender. */
  const saveFeedbackDraft = async (email: string, submissionId: string) => {
    const fb = getFeedback(email);
    if (!fb.comment.trim() && !fb.note.trim() && fb.files.length === 0) {
      setFeedbackFor(email, { msg: { type: "error", text: "Escribe un comentario, una nota o adjunta un archivo para guardar." } });
      return;
    }
    if (!submissionId) {
      setFeedbackFor(email, { msg: { type: "error", text: "No se pudo determinar dónde guardar." } });
      return;
    }
    setFeedbackFor(email, { savingDraft: true, msg: undefined });
    try {
      const form = new FormData();
      form.append("submissionId", submissionId);
      form.append("comment", fb.comment);
      form.append("note", fb.note);
      fb.files.forEach((f) => form.append("files", f, f.name));

      const res = await fetch("/api/feedback-draft", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        const draft: FeedbackDraft = data.draft || {
          comment: fb.comment,
          note: fb.note,
          files: fb.files.map((f) => ({ name: f.name, size: f.size })),
          savedAt: new Date().toISOString(),
        };
        // Remember this version so the seeding effect won't overwrite the form.
        draftSeededRef.current[fbKey(email)] = draft.savedAt || "1";
        setSubmissions((prev) =>
          prev.map((s) => (s.id === submissionId ? { ...s, feedbackDraft: draft } : s))
        );
        setFeedbackFor(email, { savingDraft: false, msg: { type: "success", text: "Guardado (sin enviar)." } });
      } else {
        setFeedbackFor(email, { savingDraft: false, msg: { type: "error", text: data.error || "No se pudo guardar." } });
      }
    } catch {
      setFeedbackFor(email, { savingDraft: false, msg: { type: "error", text: "Error de red al guardar." } });
    }
  };

  /** Cancel/clear the compose form at once (comment + note + files). If there is a
   *  saved draft in Notion, it (and its files) is deleted too, after confirming. */
  const cancelFeedbackDraft = (email: string, submissionId: string) => {
    const fb = getFeedback(email);
    const anchorSub = submissions.find((s) => s.id === submissionId);
    const hasDraft = !!anchorSub?.feedbackDraft;
    const hasContent = !!(fb.comment.trim() || fb.note.trim() || fb.files.length > 0);
    if (!hasDraft && !hasContent) return;

    const clearAll = () => {
      draftSeededRef.current[fbKey(email)] = "__cancelled__";
      setFeedback((prev) => ({ ...prev, [fbKey(email)]: { comment: "", note: "", files: [], sending: false, savingDraft: false } }));
    };

    // Nothing saved in Notion yet: just clear the form instantly (non-destructive).
    if (!hasDraft) {
      clearAll();
      return;
    }

    // A draft is stored in Notion: confirm before deleting it (and its files).
    setConfirmDialog({
      title: "Descartar retroalimentación",
      message: (
        <>
          ¿Seguro que quieres descartar esta retroalimentación? Se borrarán el comentario, la nota y los archivos guardados en Notion. Esta acción no se puede deshacer.
        </>
      ),
      confirmLabel: "Descartar",
      onConfirm: async () => {
        try {
          await fetch(`/api/feedback-draft?submissionId=${encodeURIComponent(submissionId)}`, { method: "DELETE" });
        } catch {
          // Ignore network errors; still clear the form locally.
        }
        setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? { ...s, feedbackDraft: null } : s)));
        clearAll();
      },
    });
  };

  /** Delete a feedback entry (and its files) from Notion. */
  const deleteFeedback = (email: string, submissionId: string, index: number) => {
    setConfirmDialog({
      title: "Eliminar retroalimentación",
      message: (
        <>
          ¿Seguro que quieres eliminar esta retroalimentación? Se borrará de Notion junto con sus archivos. Esta acción no se puede deshacer.
        </>
      ),
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        try {
          const res = await fetch(
            `/api/send-feedback?submissionId=${encodeURIComponent(submissionId)}&index=${index}`,
            { method: "DELETE" }
          );
          const data = await res.json();
          if (data.success) {
            setSubmissions((prev) =>
              prev.map((s) =>
                s.id === submissionId
                  ? { ...s, feedbackHistory: (s.feedbackHistory || []).filter((_, i) => i !== index) }
                  : s
              )
            );
            // Keep the viewer index within bounds after removal.
            setFeedbackView((v) => ({ ...v, [email]: Math.max(0, (v[email] ?? index) - 1) }));
          } else {
            setProjectError(data.error || "No se pudo eliminar la retroalimentación.");
          }
        } catch {
          setProjectError("Error de red al eliminar la retroalimentación.");
        }
      },
    });
  };
  // File currently open in the inline preview modal (null = closed).
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  // Whether the info sidebar (title/description/db/date) is shown. The bar button
  // toggles it; when hidden, the grading table + senders expand to full width.
  const [showSidebar, setShowSidebar] = useState(true);
  // Collapse toggles for the two sections in the detail view.
  const [remitentesCollapsed, setRemitentesCollapsed] = useState(false);
  const [gradingCollapsed, setGradingCollapsed] = useState(false);

  /** Open a project in the detail view. */
  const openProject = (projId: string) => {
    setSelectedMetaProjectId(projId);
    setAdminView("detail");
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // no-op
    }
  };

  /** Open a child activity from the consolidated table, focusing a specific person
   *  so the admin lands right on their submission (to review/change the note). */
  const openActivityForPerson = (projId: string, email: string, document: string) => {
    setRemitentesCollapsed(false);
    setPendingSenderFocus({ projectId: projId, email: (email || "").toLowerCase(), document: (document || "").trim() });
    openProject(projId);
  };



  // Once the focused activity's submissions have loaded, expand that person's panel
  // and scroll to it, then clear the pending focus.
  useEffect(() => {
    if (!pendingSenderFocus || selectedMetaProjectId !== pendingSenderFocus.projectId) return;
    const match = submissions.find(
      (s) =>
        s.projectId === pendingSenderFocus.projectId &&
        (s.senderEmail?.toLowerCase() === pendingSenderFocus.email ||
          (!!pendingSenderFocus.document && (s.document || "").trim() === pendingSenderFocus.document))
    );
    if (!match) return; // submissions for this project not loaded yet
    const email = match.senderEmail;
    setExpandedSenders((prev) => ({ ...prev, [email]: true }));
    const focus = pendingSenderFocus;
    setPendingSenderFocus(null);
    setTimeout(() => {
      try {
        const el = document.getElementById(`sender-row-${normalizeString(email)}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch { /* no-op */ }
    }, 250);
    void focus;
  }, [submissions, selectedMetaProjectId, pendingSenderFocus]);

  // Persist current view + selected project so a refresh keeps you editing in place.
  useEffect(() => {
    try {
      sessionStorage.setItem("envi_admin_view", adminView);
      sessionStorage.setItem("envi_admin_project", selectedMetaProjectId || "");
    } catch {
      // no-op
    }
  }, [adminView, selectedMetaProjectId]);

  // Sync state on load
  useEffect(() => {
    if (config) {
      if (!config.hasSecret) setNotionSecret("");
      setParentPageId(config.parentPageId || "");
    }
    fetchSubmissions();
  }, [config]);

  // Open a delivery when a notification (app-level) is clicked. The nonce changes
  // on every click so the same target can be reopened.
  useEffect(() => {
    if (focusDelivery && focusDelivery.projectId) {
      openActivityForPerson(focusDelivery.projectId, focusDelivery.email, focusDelivery.document);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDelivery?.nonce]);

  // Handle copywriting selection initialization and auto-healing
  useEffect(() => {
    if (projects.length > 0) {
      if (!selectedMetaProjectId || !projects.some(p => p.id === selectedMetaProjectId)) {
        setSelectedMetaProjectId(projects[0].id);
      }
    }
  }, [projects, selectedMetaProjectId]);

  // Load any saved feedback DRAFT into the compose form (once per draft version),
  // so an admin can keep editing where they left off. Text loads immediately;
  // attached files are rebuilt from Notion in the background.
  useEffect(() => {
    submissions.forEach((s) => {
      const draft = s.feedbackDraft;
      const email = s.senderEmail;
      if (!draft || !email) return;
      // Key by the submission's OWN project, so a draft in one project never
      // seeds the same sender's compose form in a different project.
      const key = fbKey(email, s.projectId);
      const version = draft.savedAt || "1";
      if (draftSeededRef.current[key] === version) return;
      draftSeededRef.current[key] = version;
      setFeedback((prev) => {
        const cur = prev[key] || { comment: "", note: "", files: [], sending: false };
        return { ...prev, [key]: { ...cur, comment: draft.comment || "", note: draft.note || "", savingDraft: false } };
      });
      void reconstructDraftFiles(draft).then((fileObjs) => {
        if (!fileObjs.length) return;
        setFeedback((prev) => {
          const cur = prev[key] || { comment: "", note: "", files: [], sending: false };
          return { ...prev, [key]: { ...cur, files: fileObjs } };
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions]);

  // Pull the selected project's meta straight from Notion whenever it changes, so
  // the admin always reflects what's actually stored in Notion (colors, title,
  // etc.) — even on a fresh deployment where the KV cache is still empty.
  useEffect(() => {
    if (selectedMetaProjectId) {
      void refreshProjectMeta(selectedMetaProjectId);
      void loadProjectSubmissions(selectedMetaProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetaProjectId]);

  useEffect(() => {
    setHomeIcon(appearance.homeIcon);
    setHomeBgColor(appearance.homeBgColor);
  }, [appearance.homeIcon, appearance.homeBgColor]);

  const loadProjectMetaIntoForm = (meta?: ProjectMeta) => {
    const active = meta || {
      title: "ENVI",
      description: "ENVI agiliza la entrega de archivos por proyecto. Comparte este enlace para recibir archivos de forma rápida y ordenada.",
      expirationDate: "",
      backgroundImage: "",
      isActive: true
    };

    setCopyTitle(active.title || "");
    setCopyDesc(active.description || "");

    // Load custom fields; migrate legacy step1/2/3 if present and no customFields yet.
    let fields: CustomField[] = Array.isArray(active.customFields) ? [...active.customFields] : [];
    if (fields.length === 0) {
      const legacy = [active.step1, active.step2, active.step3].filter(Boolean) as string[];
      fields = legacy.map((txt) => {
        const idx = txt.indexOf(":");
        const label = idx > -1 ? txt.slice(0, idx).trim() : "Paso";
        const value = idx > -1 ? txt.slice(idx + 1).trim() : txt.trim();
        return { id: genId(), label, value };
      });
    }

    setCopyCustomFields(fields);
    setCopyExpiration(active.expirationDate || "");
    setCopyBackground(active.backgroundImage || "");
    setCopyBgBlur(typeof active.bgBlur === "number" ? active.bgBlur : 0);
    setCopyBgColor(active.bgColor || "");
    setCopyTextColor(active.textColor === "white" || active.textColor === "black" ? active.textColor : "auto");
    setCopyIsActive(active.isActive !== false);
    setCopyIcon(active.icon || "UploadCloud");
    setCopyUseDatabase(!!active.useDatabase);
    setCopyDatabaseId(active.databaseId || "");
    setCopyDbColumns(Array.isArray(active.dbColumns) ? active.dbColumns : []);
    setCopyAllowComment(!!active.allowComment);
    setCopyRegistrationMode(!!active.registrationMode);
    setCopyGroupId(active.groupId || "");
    setMetaMessage(null);
  };

  const getProjectMetaLoadSignature = (meta?: ProjectMeta) => {
    if (!meta) return EMPTY_META_LOAD_SIGNATURE;
    return JSON.stringify({
      title: meta.title || "",
      description: meta.description || "",
      step1: meta.step1 || "",
      step2: meta.step2 || "",
      step3: meta.step3 || "",
      customFields: Array.isArray(meta.customFields) ? meta.customFields : [],
      expirationDate: meta.expirationDate || "",
      backgroundImage: meta.backgroundImage || "",
      bgBlur: typeof meta.bgBlur === "number" ? meta.bgBlur : 0,
      bgColor: meta.bgColor || "",
      isActive: meta.isActive !== false,
      icon: meta.icon || "UploadCloud",
      useDatabase: !!meta.useDatabase,
      databaseId: meta.databaseId || "",
      dbColumns: Array.isArray(meta.dbColumns) ? meta.dbColumns : [],
      allowComment: !!meta.allowComment,
      registrationMode: !!meta.registrationMode,
      groupId: meta.groupId || "",
    });
  };

  // Track last project ID for which we've loaded form fields — prevents refresh from overwriting user edits
  const lastLoadedProjectId = React.useRef<string>("");
  const lastLoadedMetaSignature = React.useRef<string>(EMPTY_META_LOAD_SIGNATURE);

  // Sync copywriting form fields when the project changes, and once more if its metadata arrives later.
  useEffect(() => {
    if (!selectedMetaProjectId) return;

    const activeMeta = projectMeta[selectedMetaProjectId];
    const nextSignature = getProjectMetaLoadSignature(activeMeta);
    const projectChanged = lastLoadedProjectId.current !== selectedMetaProjectId;
    const shouldHydrateLateMeta = !projectChanged
      && lastLoadedMetaSignature.current === EMPTY_META_LOAD_SIGNATURE
      && nextSignature !== EMPTY_META_LOAD_SIGNATURE;

    if (!projectChanged && !shouldHydrateLateMeta) return;

    lastLoadedProjectId.current = selectedMetaProjectId;
    lastLoadedMetaSignature.current = nextSignature;
    loadProjectMetaIntoForm(activeMeta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetaProjectId, projectMeta]);

  // Sync current editing visual customisations to parent App under adminPreview.
  // Debounced so dragging the color picker doesn't re-render the whole app (with its
  // animated background) on every pixel — it only updates once movement settles.
  useEffect(() => {
    if (!onAdminPreviewChange) return;
    const timer = setTimeout(() => {
      if (adminView === "detail" && selectedMetaProjectId) {
        onAdminPreviewChange({
          projectId: selectedMetaProjectId,
          bgColor: copyBgColor,
          backgroundImage: "",
          bgBlur: 0,
          textColor: copyTextColor,
          icon: copyIcon,
        });
      } else {
        // Browse view: preview the homepage cover color + icon particles live.
        // "__home__" is a sentinel so App tints the environment with the cover color.
        onAdminPreviewChange({
          projectId: "__home__",
          bgColor: homeBgColor || "",
          backgroundImage: "",
          bgBlur: 0,
          textColor: "auto",
          icon: homeIcon,
        });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [adminView, selectedMetaProjectId, copyBgColor, copyTextColor, copyIcon, homeBgColor, homeIcon, onAdminPreviewChange]);

  /** Snapshot the current editor state into a ProjectMeta payload. */
  const buildProjectMeta = (): ProjectMeta => ({
    title: copyTitle,
    description: copyDesc,
    customFields: copyCustomFields,
    expirationDate: copyExpiration,
    backgroundImage: "",
    bgBlur: 0,
    bgColor: copyBgColor,
    icon: copyIcon,
    textColor: copyTextColor,
    isActive: copyIsActive,
    useDatabase: copyUseDatabase,
    databaseId: copyDatabaseId,
    dbColumns: copyDbColumns,
    allowComment: copyAllowComment,
    registrationMode: copyRegistrationMode,
    groupId: copyGroupId,
    order: projectMeta[selectedMetaProjectId]?.order ?? 0,
    createdAt: projectMeta[selectedMetaProjectId]?.createdAt,
  });

  /**
   * Persist the project meta and apply it optimistically. Deliberately does NOT
   * refetch or refresh, so saving never bounces you out of the admin view.
   */
  const persistProjectMeta = async (successText: string, overrides?: Partial<ProjectMeta>) => {
    if (!selectedMetaProjectId) return;
    const nextMeta = { ...buildProjectMeta(), ...(overrides || {}) };
    setIsSavingMeta(true);
    setMetaMessage(null);
    try {
      const res = await fetch("/api/project-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedMetaProjectId, ...nextMeta }),
      });
      const data = await res.json();
      if (data.success) {
        applyProjectMetaUpdate(selectedMetaProjectId, nextMeta);
        setMetaMessage({ type: "success", text: successText });
      } else {
        setMetaMessage({ type: "error", text: data.error || "No se pudieron guardar los cambios." });
      }
    } catch (err) {
      setMetaMessage({ type: "error", text: "Error de red al intentar guardar." });
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    void persistProjectMeta("¡Textos guardados correctamente!");
  };

  /** Toggle whether the public link accepts submissions (persists immediately).
   *  When blocked (isActive=false) the landing shows a "not available" notice. */
  const toggleSubmissionsActive = () => {
    const next = !copyIsActive;
    setCopyIsActive(next);
    void persistProjectMeta(
      next ? "Envíos habilitados." : "Envíos bloqueados: el enlace mostrará un aviso.",
      { isActive: next }
    );
  };

  /** Toggle registration mode on a PARENT project (persists immediately). When on,
   *  the parent link registers people and its children autofill by document. */
  const toggleRegistrationMode = () => {
    const next = !copyRegistrationMode;
    setCopyRegistrationMode(next);
    void persistProjectMeta(
      next
        ? "Modo registro activado: el enlace registra personas y los hijos piden solo el documento."
        : "Modo registro desactivado: los hijos vuelven a pedir nombre y correo.",
      { registrationMode: next }
    );
  };

  const handleSaveHomeAppearance = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSavingHomeAppearance(true);
    setHomeAppearanceMessage(null);

    try {
      await saveAppearance({
        ...appearance,
        homeTitle: 'ENVI',
        homeTitleSize: 56,
        homeMessage: 'ENVI agiliza la entrega de archivos por proyecto.\nDesarrollado por wilzamguerrero.',
        homeIcon,
        homeBgColor,
      });
      setHomeAppearanceMessage({ type: "success", text: "Portada guardada correctamente." });
    } catch {
      setHomeAppearanceMessage({ type: "error", text: "No se pudo guardar la portada." });
    } finally {
      setIsSavingHomeAppearance(false);
    }
  };

  /** Create (or recreate) the Notion database for the selected project. */
  const handleCreateDatabase = async () => {
    if (!selectedMetaProjectId) return;
    setIsCreatingDb(true);
    setMetaMessage(null);
    try {
      const projName = projects.find((p) => p.id === selectedMetaProjectId)?.name || "Entregas";
      const res = await fetch("/api/projects/create-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedMetaProjectId,
          title: projName,
          dbColumns: copyDbColumns,
          submitterFields: copyCustomFields
            .filter((f) => f.askSubmitter && f.label)
            .map((f) => f.label),
        }),
      });
      const data = await res.json();
      if (data.success && data.databaseId) {
        setCopyDatabaseId(data.databaseId);
        setMetaMessage({ type: "success", text: "Base de datos creada en Notion. Recuerda guardar los textos." });
      } else {
        setMetaMessage({ type: "error", text: data.error || "No se pudo crear la base de datos." });
      }
    } catch (err) {
      setMetaMessage({ type: "error", text: "Error de red al crear la base de datos." });
    } finally {
      setIsCreatingDb(false);
    }
  };

  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBg(true);
    const formData = new FormData();
    formData.append("bgImage", file);

    try {
      const res = await fetch(`/api/projects/upload-bg?projectId=${selectedMetaProjectId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        setCopyBackground(data.url);
      } else {
        alert(data.error || "No se pudo subir la imagen.");
      }
    } catch (err) {
      alert("Error de red al intentar subir la imagen de fondo.");
    } finally {
      setIsUploadingBg(false);
    }
  };

  const handleToggleProjectActive = async (projId: string, currentActiveStatus: boolean) => {
    const existingMeta = projectMeta[projId] || {
      title: "ENVI",
      description: "ENVI agiliza la entrega de archivos por proyecto. Comparte este enlace para recibir archivos de forma rápida y ordenada.",
      expirationDate: "",
      backgroundImage: ""
    };

    try {
      const res = await fetch("/api/project-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projId,
          ...existingMeta,
          isActive: !currentActiveStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshProjectMeta();
        await refreshProjects();
      } else {
        alert(data.error || "No se pudo cambiar el estado de activaci├│n.");
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    }
  };



  // Light list of ALL submissions (headers only) — used for the per-project
  // counts in the tree. Files are loaded per-project on demand.
  const fetchSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const res = await fetch("/api/submissions");
      const data = await res.json();
      if (data.success) {
        setSubmissions((prev) => {
          // Keep any already-hydrated entry (files, comment, document or feedback),
          // not just ones with files — otherwise the light list wipes comment-only
          // submissions (which have no files). Add the rest from the light list.
          const isHydrated = (s: Submission) =>
            (Array.isArray(s.files) && s.files.length > 0) ||
            (typeof s.comment === "string" && s.comment.trim().length > 0) ||
            (typeof s.document === "string" && s.document.trim().length > 0) ||
            (Array.isArray(s.feedbackHistory) && s.feedbackHistory.length > 0) ||
            !!s.feedbackDraft;
          const hydrated = prev.filter(isHydrated);
          const hydratedIds = new Set(hydrated.map((s) => s.id));
          const incoming = (data.submissions as Submission[]).filter((s) => !hydratedIds.has(s.id));
          return [...hydrated, ...incoming];
        });
      }
    } catch (e) {
      console.error("Error loading submissions", e);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  /** Load a single project's submissions INCLUDING files + grades (from Notion),
   *  and merge them in, replacing that project's lighter entries. */
  const loadProjectSubmissions = async (projId: string) => {
    if (!projId) return;
    setLoadingSubmissions(true);
    try {
      const res = await fetch(`/api/submissions?projectId=${encodeURIComponent(projId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.submissions)) {
        setSubmissions((prev) => {
          const others = prev.filter((s) => s.projectId !== projId);
          return [...others, ...(data.submissions as Submission[])];
        });
      }
    } catch (e) {
      console.error("Error loading project submissions", e);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  /** Delete a submission everywhere: Notion (toggle + db row) and the local log. */
  const handleDeleteSubmission = (submissionId: string, senderName: string) => {
    setConfirmDialog({
      title: "Eliminar envío",
      message: (
        <>
          ¿Seguro que quieres eliminar el envío de{" "}
          <span className="text-white font-semibold">"{senderName}"</span>? Se borrará también de Notion. Esta acción no se puede deshacer.
        </>
      ),
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        setIsDeletingSubmissionId(submissionId);
        try {
          const res = await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) {
            setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
          } else {
            setProjectError(data.error || "No se pudo eliminar el envío.");
          }
        } catch {
          setProjectError("Error de red al eliminar el envío.");
        } finally {
          setIsDeletingSubmissionId(null);
        }
      },
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notionSecret && config?.hasSecret) {
      // User didn't type a new secret, but there is an existing one. Show alert.
      setSaveMessage({ type: "error", text: "Proporciona un nuevo Secreto de Notion o mant├⌐n el anterior." });
      return;
    }

    setIsSavingConfig(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionSecret, parentPageId: parentPageId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage({ type: "success", text: "┬íConfiguraci├│n de Notion actualizada con ├⌐xito!" });
        setNotionSecret(""); // clear field since it's saved server-side
        await refreshConfig();
        await refreshProjects();
      } else {
        setSaveMessage({ type: "error", text: data.error || "No se pudo guardar la configuraci├│n." });
      }
    } catch (err: any) {
      setSaveMessage({ type: "error", text: "Error de red al intentar conectar." });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreatingProject(true);
    setProjectError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim(), icon: randomIconKey() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewProjectName("");
        await refreshProjects();
        await refreshProjectMeta();
        fetchSubmissions();
      } else {
        setProjectError(data.error || "Error al crear el proyecto.");
      }
    } catch (err) {
      setProjectError("Fallo de red al intentar crear el proyecto.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  /** Create a project/folder INSIDE another one (tree). Inherits the parent's color. */
  const handleCreateChild = async (parentId: string, name: string) => {
    const parentColor = projectMeta[parentId]?.bgColor || "";
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parentId, icon: randomIconKey(), bgColor: parentColor }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "No se pudo crear el proyecto dentro de la carpeta.");
      return;
    }
    await refreshProjects();
    await refreshProjectMeta();
  };

  /** Rename a project/folder toggle (or page). */
  const handleRenameProject = async (proj: Project, name: string) => {
    const res = await fetch(`/api/projects/${proj.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: proj.type || "toggle" }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "No se pudo renombrar el proyecto.");
      return;
    }
    await refreshProjects();
  };

  /** Opens the in-UI confirmation modal (no native browser dialog). */
  const handleDeleteProject = async (projId: string, projName: string) => {
    setDeleteTarget({ id: projId, name: projName });
  };

  /** Actually deletes the project after the user confirms in the styled modal. */
  const performDeleteProject = async () => {
    if (!deleteTarget) return;
    const projId = deleteTarget.id;
    setDeleteTarget(null);
    setIsDeletingProjectId(projId);
    try {
      const res = await fetch(`/api/projects/${projId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        if (selectedMetaProjectId === projId) {
          setSelectedMetaProjectId("");
        }
        await refreshProjects();
        await refreshProjectMeta();
      } else {
        setProjectError(data.error || "No se pudo eliminar el proyecto.");
      }
    } catch (err) {
      setProjectError("Error de red al intentar eliminar el proyecto.");
    } finally {
      setIsDeletingProjectId(null);
    }
  };

  const handleClearConfig = () => {
    setConfirmDialog({
      title: "Eliminar credenciales",
      message: (
        <>
          ¿Seguro que quieres eliminar las credenciales de Notion actuales? Tendrás que volver a configurarlas para conectar de nuevo.
        </>
      ),
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/config/clear", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            setNotionSecret("");
            setParentPageId("");
            setSaveMessage({ type: "success", text: "Configuración eliminada." });
            await refreshConfig();
            await refreshProjects();
          }
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  // When a project is selected, scope submissions to that project only.
  const scopedSubmissions = selectedMetaProjectId
    ? submissions.filter((sub) => sub.projectId === selectedMetaProjectId)
    : submissions;

  const selectedProjectName =
    projects.find((p) => p.id === selectedMetaProjectId)?.name || "";

  // Filter (scoped) submissions by search input
  const filteredSubmissions = scopedSubmissions.filter(sub => {
    const term = searchQuery.toLowerCase();
    return (
      sub.senderName.toLowerCase().includes(term) ||
      sub.senderEmail.toLowerCase().includes(term) ||
      sub.projectName.toLowerCase().includes(term) ||
      sub.files.some(f => f.name.toLowerCase().includes(term))
    );
  });

  const getSubmissionsCountForProject = (projId: string) => {
    return submissions.filter(sub => sub.projectId === projId).length;
  };

  /** Short, safe formatting of an expiration date (empty if missing/invalid). */
  const formatExpiration = (raw?: string): string => {
    if (!raw || !raw.trim()) return "";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(raw.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  };

  // Merge stored order/group from metadata into the projects list.
  const orderedProjects = [...projects]
    .map((p) => ({
      ...p,
      order: projectMeta[p.id]?.order ?? 0,
      groupId: projectMeta[p.id]?.groupId || "",
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Build groups: map of groupId -> list of projects, plus ungrouped.
  const groupsMap: Record<string, { name: string; items: typeof orderedProjects }> = {};
  const ungrouped: typeof orderedProjects = [];
  for (const p of orderedProjects) {
    if (p.groupId) {
      const groupProj = projects.find((g) => g.id === p.groupId);
      const key = p.groupId;
      if (!groupsMap[key]) {
        groupsMap[key] = { name: groupProj?.name || "Grupo", items: [] };
      }
      groupsMap[key].items.push(p);
    } else {
      ungrouped.push(p);
    }
  }

  const filteredHomeIcons = ICON_OPTIONS.filter((option) => {
    if (!homeIconSearch.trim()) return true;
    const haystack = normalizeString(`${option.key} ${option.label} ${option.cat}`);
    return haystack.includes(normalizeString(homeIconSearch));
  });

  return (
    <div className="space-y-6">
      {/* Delete confirmation — styled modal matching the interface (no native dialog). */}
      {deleteTarget && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#111111] border border-white/10 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Eliminar proyecto</h3>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-6">
              ¿Seguro que quieres eliminar <span className="text-white font-semibold">"{deleteTarget.name}"</span>? Se borrará tanto de Notion como localmente. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-11 px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void performDeleteProject()}
                className="h-11 px-6 font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro btn-accent-border group overflow-hidden"
                style={{ '--btn-color': '#ffffff' } as React.CSSProperties}
              >
                {/* Accent fill (fades out on hover to reveal the environment) */}
                <div
                  className="absolute inset-0 opacity-100 group-hover:opacity-0 transition-opacity duration-300 rounded-[4px] pointer-events-none"
                  style={{ backgroundColor: '#ff3b30' }}
                />
                {/* Diagonal lines on top of the accent */}
                <div
                  className="absolute inset-[1px] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px]"
                  style={{
                    backgroundColor: '#ff3b30',
                    backgroundImage: `repeating-linear-gradient(119deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 1px, transparent 1px, transparent 10px)`,
                  }}
                />
                <span className="btn-motion-corner btn-motion-corner-tl" />
                <span className="btn-motion-corner btn-motion-corner-tr" />
                <span className="btn-motion-corner btn-motion-corner-bl" />
                <span className="btn-motion-corner btn-motion-corner-br" />
                <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                  Eliminar
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reusable styled confirmation modal (submissions, feedback, config, etc.).
          Rendered via a portal to <body> so the fixed backdrop always covers the
          whole viewport (an ancestor's transform would otherwise clip it). */}
      {confirmDialog && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => { if (!confirmBusy) setConfirmDialog(null); }}
        >
          <div
            className="w-full max-w-sm bg-[#111111] border border-white/10 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${confirmDialog.accentColor || "#ff3b30"}26`, color: confirmDialog.accentColor || "#ff3b30" }}
              >
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">{confirmDialog.title}</h3>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="h-11 px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              {(() => {
                const accent = confirmDialog.accentColor || '#ff3b30';
                const light = isHexLight(accent);
                const stripe = light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.22)';
                return (
                  <button
                    type="button"
                    disabled={confirmBusy}
                    onClick={() => {
                      const dialog = confirmDialog;
                      void (async () => {
                        setConfirmBusy(true);
                        try {
                          await dialog.onConfirm();
                        } finally {
                          setConfirmBusy(false);
                          setConfirmDialog(null);
                        }
                      })();
                    }}
                    className="h-11 px-6 font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro btn-accent-border group overflow-hidden disabled:opacity-60"
                    style={{ '--btn-color': light ? '#111111' : '#ffffff' } as React.CSSProperties}
                  >
                    {/* Accent fill (fades out on hover to reveal the environment) */}
                    <div
                      className="absolute inset-0 opacity-100 group-hover:opacity-0 transition-opacity duration-300 rounded-[4px] pointer-events-none"
                      style={{ backgroundColor: accent }}
                    />
                    {/* Diagonal lines on top of the accent */}
                    <div
                      className="absolute inset-[1px] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px]"
                      style={{
                        backgroundColor: accent,
                        backgroundImage: `repeating-linear-gradient(119deg, ${stripe} 0px, ${stripe} 1px, transparent 1px, transparent 10px)`,
                      }}
                    />
                    <span className="btn-motion-corner btn-motion-corner-tl" />
                    <span className="btn-motion-corner btn-motion-corner-tr" />
                    <span className="btn-motion-corner btn-motion-corner-bl" />
                    <span className="btn-motion-corner btn-motion-corner-br" />
                    <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                      {confirmBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                      {confirmDialog.confirmLabel}
                    </span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add/edit a registered person (registration mode). */}
      {personEditor && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => { if (!savingPerson) setPersonEditor(null); }}
        >
          <div className="w-full max-w-md bg-[#111111] border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">
                {personEditor.mode === "add" ? "Agregar persona" : "Editar persona"}
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1 uppercase tracking-wide">Nombre completo</label>
                <input type="text" value={personEditor.name} onChange={(e) => setPersonEditor((p) => p && { ...p, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm text-white focus:border-white/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1 uppercase tracking-wide">Documento de identidad</label>
                <input type="text" value={personEditor.document} onChange={(e) => setPersonEditor((p) => p && { ...p, document: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm text-white focus:border-white/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1 uppercase tracking-wide">Correo</label>
                <input type="email" value={personEditor.email} onChange={(e) => setPersonEditor((p) => p && { ...p, email: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm text-white focus:border-white/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1 uppercase tracking-wide">Teléfono <span className="text-white/25 normal-case font-normal">(opcional)</span></label>
                <input type="tel" value={personEditor.phone} onChange={(e) => setPersonEditor((p) => p && { ...p, phone: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm text-white focus:border-white/30 focus:outline-none" />
              </div>
              {personEditorError && (
                <div className="p-2.5 border border-red-900/50 bg-red-950/30 text-red-300 text-xs rounded-lg flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" /> <span>{personEditorError}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" disabled={savingPerson} onClick={() => setPersonEditor(null)}
                className="h-11 px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-all disabled:opacity-50">
                Cancelar
              </button>
              {(() => {
                const accent = copyBgColor || "#c72323";
                const stripe = isBgColorLight ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.22)";
                return (
                  <button
                    type="button"
                    disabled={savingPerson}
                    onClick={() => void savePersonEditor()}
                    className="h-11 px-6 font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro btn-accent-border group overflow-hidden disabled:opacity-60"
                    style={{ '--btn-color': (copyBgColor && isBgColorLight) ? '#111111' : '#ffffff' } as React.CSSProperties}
                  >
                    <div className="absolute inset-0 opacity-100 group-hover:opacity-0 transition-opacity duration-300 rounded-[4px] pointer-events-none" style={{ backgroundColor: accent }} />
                    <div
                      className="absolute inset-[1px] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px]"
                      style={{ backgroundColor: accent, backgroundImage: `repeating-linear-gradient(119deg, ${stripe} 0px, ${stripe} 1px, transparent 1px, transparent 10px)` }}
                    />
                    <span className="btn-motion-corner btn-motion-corner-tl" />
                    <span className="btn-motion-corner btn-motion-corner-tr" />
                    <span className="btn-motion-corner btn-motion-corner-bl" />
                    <span className="btn-motion-corner btn-motion-corner-br" />
                    <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                      {savingPerson ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {personEditor.mode === "add" ? "Agregar" : "Guardar"}
                    </span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Registration-mode indicator: a diagonal-lines strip on the left edge.
          Only while actually viewing the registration parent's detail. */}
      {adminView === "detail" && copyRegistrationMode && projects.some((p) => (p.parentId || "") === selectedMetaProjectId) && createPortal(
        <div
          className="fixed left-0 top-0 bottom-0 w-[34px] pointer-events-none z-[45]"
          style={{
            backgroundImage: `repeating-linear-gradient(119deg, ${isBgColorLight ? '#000000' : '#ffffff'} 0px, ${isBgColorLight ? '#000000' : '#ffffff'} 1px, transparent 1px, transparent 9px)`,
          }}
        />,
        document.body
      )}

      {/* Detail view keeps a back arrow; browse view has no header. */}
      {adminView === "detail" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAdminView("browse")}
            className="p-2.5 rounded-xl border transition-all cursor-pointer shrink-0"
            style={
              copyBgColor
                ? (isBgColorLight
                    ? { backgroundColor: "rgba(0,0,0,0.12)", borderColor: "rgba(0,0,0,0.35)", color: "#111111" }
                    : { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.45)", color: "#ffffff" })
                : { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.35)", color: "#ffffff" }
            }
            title="Volver a todos los proyectos"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white truncate">
              {selectedProjectName || "Proyecto"}
            </h2>
            <p className="text-xs text-white/40">Editando proyecto · pulsa la flecha para volver</p>
          </div>

          {/* Control buttons — right side of the header, same row as the back arrow */}
          {selectedMetaProjectId && projects.find((p) => p.id === selectedMetaProjectId) && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Quick jump to the registration parent (consolidated grades) — shown
                  only when this project is a CHILD of a registration-mode parent. */}
              {(() => {
                const cur = projects.find((p) => p.id === selectedMetaProjectId);
                const pid = cur?.parentId || "";
                if (!pid || !projectMeta[pid]?.registrationMode) return null;
                const parentName = projects.find((p) => p.id === pid)?.name || "registro";
                return (
                  <button
                    type="button"
                    onClick={() => openProject(pid)}
                    title={`Ir a las notas consolidadas de "${parentName}"`}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all shrink-0"
                  >
                    <GraduationCap className="w-4 h-4" />
                  </button>
                );
              })()}

              {/* Color picker */}
              <label
                className="relative w-10 h-10 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer shrink-0 flex items-center justify-center transition-all"
                title={`Color de fondo: ${copyBgColor || "sin color"}`}
              >
                <input
                  type="color"
                  value={copyBgColor || "#050505"}
                  onChange={(e) => setCopyBgColorSmooth(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Palette className="w-4 h-4 text-white pointer-events-none" />
              </label>

              {copyBgColor && (
                <button
                  type="button"
                  onClick={() => setCopyBgColor("")}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-red-300 transition-all shrink-0"
                  title="Quitar el color de fondo"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Icon picker — popover opens to the right since we're near the edge */}
              <CategorizedIconPicker
                value={copyIcon}
                onChange={setCopyIcon}
                align="right"
                title="Elegir icono del proyecto"
              />

              {/* Lock / unlock submissions: even with the link shared, block sending. */}
              <button
                type="button"
                onClick={toggleSubmissionsActive}
                disabled={isSavingMeta}
                title={copyIsActive
                  ? "Envíos habilitados · clic para bloquear (el enlace mostrará un aviso)"
                  : "Envíos bloqueados · clic para habilitar"}
                className="w-10 h-10 flex items-center justify-center rounded-lg border transition-all shrink-0 disabled:opacity-50"
                style={copyIsActive
                  ? { borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: "#ffffff" }
                  : { borderColor: "rgba(248,113,113,0.45)", backgroundColor: "rgba(127,29,29,0.28)", color: "#fca5a5" }}
              >
                {copyIsActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              {/* Registration mode — only for PARENT projects (those with children).
                  When on, the parent link registers people (name/document/email/phone)
                  and its children ask only for the document + autofill. */}
              {projects.some((p) => (p.parentId || "") === selectedMetaProjectId) && (
                <button
                  type="button"
                  onClick={toggleRegistrationMode}
                  disabled={isSavingMeta}
                  title={copyRegistrationMode
                    ? "Modo registro ACTIVO · clic para desactivar (los hijos volverán a pedir nombre y correo)"
                    : "Activar modo registro · el enlace registrará personas y los hijos pedirán solo el documento"}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border transition-all shrink-0 disabled:opacity-50"
                  style={copyRegistrationMode
                    ? {
                        borderColor: "rgba(255,255,255,0.55)",
                        backgroundColor: "rgba(255,255,255,0.10)",
                        backgroundImage: "repeating-linear-gradient(119deg, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0.45) 1px, transparent 1px, transparent 6px)",
                        color: "#ffffff",
                      }
                    : { borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: "#ffffff" }}
                >
                  <ClipboardList className="w-4 h-4 relative" />
                </button>
              )}

              {/* Share: copy public link + QR + toggle info sidebar */}
              {(() => {
                const proj = projects.find((p) => p.id === selectedMetaProjectId);
                if (!proj) return null;
                const shareUrl = `${window.location.origin}/${projectSlug(proj.id, proj.name)}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(shareUrl)}`;
                const copyShareLink = async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1500);
                  } catch {
                    window.prompt("Copia el enlace:", shareUrl);
                  }
                };
                const copyShareQr = async () => {
                  try {
                    const resp = await fetch(qrUrl);
                    const blob = await resp.blob();
                    const ClipItem = (window as any).ClipboardItem;
                    if (navigator.clipboard && ClipItem) {
                      await navigator.clipboard.write([new ClipItem({ [blob.type || "image/png"]: blob })]);
                      setCopiedShareQr(true);
                      setTimeout(() => setCopiedShareQr(false), 1500);
                    } else {
                      window.open(qrUrl, "_blank");
                    }
                  } catch {
                    window.open(qrUrl, "_blank");
                  }
                };
                return (
                  <>
                    <button
                      type="button"
                      onClick={copyShareLink}
                      title="Copiar enlace para compartir"
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all"
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={copyShareQr}
                      title="Copiar código QR"
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all"
                    >
                      {copiedShareQr ? <Check className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSidebar((v) => !v)}
                      title={showSidebar ? "Ocultar panel de textos (ensancha las tablas)" : "Mostrar panel de textos"}
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all"
                    >
                      {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

    <div className={adminView === "detail" ? "grid grid-cols-1 lg:grid-cols-3 gap-8 items-start" : "space-y-8"}>

      {/* Portada de Inicio — compact bar on top of the browse view (full width) */}
      {adminView === "browse" && (
        <div className={panelClass} style={panelStyle}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0">
              <h2 className="text-sm font-semibold text-white">Portada de Inicio</h2>
              <p className="text-[11px] text-white/40">Color e icono de la página principal</p>
            </div>

            {/* Color picker — same square button as in projects. */}
            <label
              className="relative w-10 h-10 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer shrink-0 flex items-center justify-center transition-all"
              title={`Color de la portada: ${homeBgColor || "#050505"}`}
            >
              <input
                type="color"
                value={homeBgColor || "#050505"}
                onChange={(e) => setHomeBgColorSmooth(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Palette className="w-4 h-4 text-white pointer-events-none" />
            </label>

            {homeBgColor && (
              <button
                type="button"
                onClick={() => setHomeBgColor("")}
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-red-300 transition-all shrink-0"
                title="Quitar el color de la portada"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Icon picker — same categorized system as in projects. */}
            <CategorizedIconPicker
              value={homeIcon}
              onChange={setHomeIcon}
              align="right"
              title="Elegir icono de la portada"
            />

            {/* Save button — striped style, matching "Crear carpeta" / project save. */}
            <button
              type="button"
              onClick={() => handleSaveHomeAppearance()}
              disabled={isSavingHomeAppearance}
              className="h-11 px-5 font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden shrink-0 disabled:opacity-50"
              style={{ '--btn-color': safeRetroColor(homeBgColor || "#ffffff") } as React.CSSProperties}
            >
              <div className="absolute inset-0 bg-[#000000] border border-black group-hover:bg-transparent group-hover:border-transparent transition-all duration-300 rounded-[4px] pointer-events-none" />
              <div
                className="absolute inset-[1px] bg-[#000000] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px] stripes-overlay"
                style={{ backgroundImage: `repeating-linear-gradient(119deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)` }}
              />
              <span className="btn-motion-corner btn-motion-corner-tl" />
              <span className="btn-motion-corner btn-motion-corner-tr" />
              <span className="btn-motion-corner btn-motion-corner-bl" />
              <span className="btn-motion-corner btn-motion-corner-br" />
              <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                {isSavingHomeAppearance ? "Guardando..." : "Guardar"}
              </span>
            </button>

            {homeAppearanceMessage?.type === "error" && (
              <span className="text-xs shrink-0 text-red-400">
                {homeAppearanceMessage.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Info sidebar (title/description/database/date) — shown on the RIGHT
          (lg:order-2) so the tables take the left. Toggled from the header. */}
      {adminView === "detail" && showSidebar && (
      <div className="col-span-1 space-y-8 lg:order-2">

        {/* Project Custom Copywriting — no borders, as before */}
        {showSidebar && (
        <div className={panelClass} style={panelStyle}>
          {projects.length === 0 ? (
            <div className="text-center py-6 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
              <p className="text-xs text-white/40 leading-relaxed">Crea al menos un proyecto/carpeta para poder personalizar sus textos de bienvenida.</p>
            </div>
          ) : (
            <form onSubmit={handleSaveMeta} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Título de Bienvenida
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: ENVI"
                  value={copyTitle}
                  onChange={(e) => setCopyTitle(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Descripción / Párrafo
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Instrucciones principales..."
                  value={copyDesc}
                  onChange={(e) => setCopyDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all resize-y"
                />
              </div>

              {/* Expiration date — hidden in registration mode (not applicable). */}
              {!copyRegistrationMode && (
              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Fecha y Hora de Vencimiento (Límite)
                </label>
                <DateTimePicker
                  value={copyExpiration}
                  onChange={setCopyExpiration}
                  surfaceColor={copyBgColor}
                />
                <p className="text-[10px] text-white/30 mt-1">
                  Establece el día y la hora límite. Pasado este momento, se inhabilitará la zona de carga para este proyecto.
                </p>
              </div>
              )}

              {metaMessage && (
                <div className={`p-3 rounded-xl text-xs flex gap-2 items-center ${metaMessage.type === "success"
                    ? "bg-white/10 text-white/70 border border-white/15"
                    : "bg-red-950/30 text-red-300 border border-red-900/50"
                  }`}>
                  {metaMessage.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{metaMessage.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingMeta}
                className="w-full h-[46px] font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden"
                style={{
                  '--btn-color': safeRetroColor(copyBgColor)
                }}
              >
                {/* Base black background filled container */}
                <div className="absolute inset-0 bg-[#000000] border border-black group-hover:bg-transparent group-hover:border-transparent transition-all duration-300 rounded-[4px] pointer-events-none" />

                {/* Diagonal stripes */}
                <div
                  className="absolute inset-[1px] bg-[#000000] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px] stripes-overlay"
                  style={{
                    backgroundImage: `repeating-linear-gradient(119deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)`
                  }}
                />

                {/* Corner marks for hover focus */}
                <span className="btn-motion-corner btn-motion-corner-tl" />
                <span className="btn-motion-corner btn-motion-corner-tr" />
                <span className="btn-motion-corner btn-motion-corner-bl" />
                <span className="btn-motion-corner btn-motion-corner-br" />

                <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                  {isSavingMeta ? "Guardando..." : "Guardar"}
                </span>
              </button>
            </form>
          )}
        </div>
        )}

      </div>
      )}

      {/* Projects and creations column — LEFT side (lg:order-1); full width when the sidebar is hidden */}
      <div className={adminView === "detail" && !showSidebar ? "lg:col-span-3 flex flex-col gap-8 lg:order-1" : "col-span-1 lg:col-span-2 flex flex-col gap-8 lg:order-1"}>

        {/* Project creator Section */}
        {adminView === "browse" && (
        <div className={panelClass} style={panelStyle}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/5 text-white rounded-xl">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Proyectos / Carpetas</h2>
                <p className="text-xs text-white/40">Páginas de sub-carpeta en tu Notion</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-white/5 text-white/70 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/10">
                Total: {projects.length}
              </span>
              <button
                type="button"
                onClick={handleRefreshData}
                disabled={isRefreshing}
                title="Refrescar datos desde Notion (sin recargar la página)"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <form onSubmit={handleCreateProject} className="flex gap-2 mb-6">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Nombre de la nueva carpeta o proyecto..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={!config?.isConfigured}
                className="w-full px-3.5 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none disabled:opacity-40 placeholder-white/20 transition-all text-white"
              />
            </div>
            <button
              type="submit"
              disabled={isCreatingProject || !newProjectName.trim() || !config?.isConfigured}
              className="px-5 h-[44px] font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden shrink-0"
              style={{
                '--btn-color': safeRetroColor(homeBgColor || "#ffffff")
              }}
            >
              {/* Base black background filled container */}
              <div className="absolute inset-0 bg-[#000000] border border-black group-hover:bg-transparent group-hover:border-transparent transition-all duration-300 rounded-[4px] pointer-events-none" />

              {/* Diagonal stripes */}
              <div
                className="absolute inset-[1px] bg-[#000000] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px] stripes-overlay"
                style={{
                  backgroundImage: `repeating-linear-gradient(119deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)`
                }}
              />

              {/* Corner marks for hover focus */}
              <span className="btn-motion-corner btn-motion-corner-tl" />
              <span className="btn-motion-corner btn-motion-corner-tr" />
              <span className="btn-motion-corner btn-motion-corner-bl" />
              <span className="btn-motion-corner btn-motion-corner-br" />

              <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300 font-mono hover-text-adaptive btn-text-content">
                {isCreatingProject ? (
                  "Creando..."
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Crear Carpeta
                  </>
                )}
              </span>
            </button>
          </form>

          {projectError && (
            <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-xl text-xs text-red-300 mb-4 flex gap-1.5 items-center">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{projectError}</span>
            </div>
          )}

          {!config?.isConfigured ? (
            <div className="text-center py-8 bg-[#0d0d0d]/50 rounded-2xl border border-white/5">
              <p className="text-sm text-white/40">Configura tus credenciales de Notion para listar y crear proyectos.</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 bg-[#0d0d0d]/20 rounded-2xl border border-dashed border-white/10">
              <p className="text-sm text-white/40">Ningún proyecto creado aún en esta página matriz.</p>
              <p className="text-xs text-white/20 mt-1">Crea tu primer proyecto utilizando el formulario superior.</p>
            </div>
          ) : (
            <div className="flex flex-col max-h-[32rem] overflow-y-auto pr-1">
              <ProjectTreeList
                allProjects={projects}
                parentId=""
                depth={0}
                selectedId={selectedMetaProjectId}
                metaMap={projectMeta}
                submissionsCount={getSubmissionsCountForProject}
                isDeletingId={isDeletingProjectId}
                onOpen={openProject}
                onCreateChild={handleCreateChild}
                onRename={handleRenameProject}
                onDelete={handleDeleteProject}
                onToggleActive={handleToggleProjectActive}
              />
            </div>
          )}
        </div>
        )}

        {adminView === "detail" && (
        <>

        {/* Consolidated registry table — only for a registration-mode PARENT.
            Rows = registered people, columns = child activities, cell = note. */}
        {copyRegistrationMode && projects.some((p) => (p.parentId || "") === selectedMetaProjectId) && (
          <div className={`${panelClass} order-0`} style={panelStyle}>
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-white/5 text-white rounded-xl shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">Registro y notas consolidadas</h2>
                  <p className="text-xs text-white/40 truncate">Personas registradas y su nota en cada actividad de este grupo</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setPersonEditorError(null); setPersonEditor({ mode: "add", name: "", document: "", email: "", phone: "" }); }}
                  className="text-[10px] font-semibold flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
                  title="Agregar una persona manualmente"
                >
                  <Plus className="w-3 h-3" /> Agregar persona
                </button>

                {/* Column visibility: admin chooses which identity fields to show. */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowColsMenu((v) => !v)}
                    className="text-[10px] font-semibold flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
                    title="Mostrar u ocultar columnas de la tabla"
                  >
                    <Table className="w-3 h-3" /> Columnas
                  </button>
                  {showColsMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowColsMenu(false)} />
                      <div className="absolute right-0 mt-1 z-50 w-44 rounded-lg border border-white/15 bg-[#0d0d0d] p-2 shadow-xl">
                        <div className="text-[9px] font-semibold text-white/40 uppercase tracking-widest px-2 pb-1">Columnas visibles</div>
                        {([
                          ["persona", "Persona"],
                          ["documento", "Documento"],
                          ["correo", "Correo"],
                          ["telefono", "Teléfono"],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 cursor-pointer text-[11px] text-white/80">
                            <input
                              type="checkbox"
                              checked={regCols[key]}
                              onChange={(e) => setRegCols((prev) => ({ ...prev, [key]: e.target.checked }))}
                              className="accent-white"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void loadRegistrySummary(selectedMetaProjectId)}
                  disabled={loadingSummary}
                  className="text-[10px] font-semibold flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                  title="Actualizar la tabla consolidada"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingSummary ? "animate-spin" : ""}`} /> Actualizar
                </button>

                {/* Enlace + QR de entregas: una sola URL para todas las actividades. */}
                {(() => {
                  const proj = projects.find((p) => p.id === selectedMetaProjectId);
                  if (!proj) return null;
                  const actUrl = `${window.location.origin}/${projectSlug(proj.id, proj.name)}-e`;
                  const actQr = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(actUrl)}`;
                  const copyActLink = async () => {
                    try { await navigator.clipboard.writeText(actUrl); setCopiedActLink(true); setTimeout(() => setCopiedActLink(false), 1500); }
                    catch { window.prompt("Copia el enlace de entregas:", actUrl); }
                  };
                  const copyActQr = async () => {
                    try {
                      const resp = await fetch(actQr);
                      const blob = await resp.blob();
                      const ClipItem = (window as any).ClipboardItem;
                      if (navigator.clipboard && ClipItem) { await navigator.clipboard.write([new ClipItem({ [blob.type || "image/png"]: blob })]); setCopiedActQr(true); setTimeout(() => setCopiedActQr(false), 1500); }
                      else window.open(actQr, "_blank");
                    } catch { window.open(actQr, "_blank"); }
                  };
                  return (
                    <>
                      <button type="button" onClick={copyActLink} title="Copiar enlace de entregas (un solo enlace para todas las actividades)"
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all shrink-0">
                        {copiedActLink ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={copyActQr} title="Copiar QR de entregas"
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all shrink-0">
                        {copiedActQr ? <Check className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {loadingSummary ? (
              <p className="text-sm text-white/40 text-center py-8">Cargando registro...</p>
            ) : !regSummary || regSummary.people.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-8">
                Aún no hay personas registradas. Comparte el enlace de este grupo para que se registren.
              </p>
            ) : (
              (() => {
                const childCols = projects
                  .filter((p) => (p.parentId || "") === selectedMetaProjectId && p.isActive !== false)
                  .sort((a, b) => a.name.localeCompare(b.name));
                const parseNum = (v: string) => {
                  const n = parseFloat(String(v).replace(",", ".").trim());
                  return isNaN(n) ? null : n;
                };
                return (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-left text-white/40 border-b border-white/10">
                          <th className="py-2 px-2 font-semibold">#</th>
                          {regCols.persona && <th className="py-2 px-2 font-semibold">Persona</th>}
                          {regCols.documento && <th className="py-2 px-2 font-semibold whitespace-nowrap">Documento</th>}
                          {regCols.correo && <th className="py-2 px-2 font-semibold">Correo</th>}
                          {regCols.telefono && <th className="py-2 px-2 font-semibold whitespace-nowrap">Teléfono</th>}
                          {childCols.map((c) => (
                            <th key={c.id} className="py-2 px-2 font-semibold whitespace-nowrap text-center">
                              <button
                                type="button"
                                onClick={() => openProject(c.id)}
                                className="inline-flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                                title={`Ir a la actividad "${c.name}"`}
                              >
                                {c.name}
                                <ExternalLink className="w-3 h-3 opacity-40" />
                              </button>
                            </th>
                          ))}
                          <th className="py-2 px-2 font-semibold whitespace-nowrap text-center">Promedio</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {regSummary.people.map((person, i) => {
                          const doc = String(person.document || "").trim();
                          const perDoc = regSummary.notes[doc] || {};
                          const nums: number[] = [];
                          childCols.forEach((c) => {
                            const n = parseNum(perDoc[c.id]?.note || "");
                            if (n !== null) nums.push(n);
                          });
                          const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null;
                          return (
                            <tr key={doc || i} className="border-b border-white/5 hover:bg-white/5">
                              <td className="py-1.5 px-2 text-white/40 font-mono">{i + 1}</td>
                              {regCols.persona && <td className="py-1.5 px-2 text-white/80 font-medium whitespace-nowrap">{person.name || "—"}</td>}
                              {regCols.documento && <td className="py-1.5 px-2 text-white/60 font-mono whitespace-nowrap">{doc || "—"}</td>}
                              {regCols.correo && <td className="py-1.5 px-2 text-white/50 max-w-[180px] truncate">{person.email || "—"}</td>}
                              {regCols.telefono && <td className="py-1.5 px-2 text-white/50 font-mono whitespace-nowrap">{person.phone || "—"}</td>}
                              {childCols.map((c) => {
                                const cell = perDoc[c.id];
                                const statusTxt = cell?.status === "guardado" ? " · nota guardada (sin enviar)" : cell?.status === "enviado" ? " · nota enviada" : "";
                                const pendingTxt = cell?.pending ? " · entrega sin evaluar o reenviada" : "";
                                return (
                                  <td key={c.id} className="py-1.5 px-2 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => openActivityForPerson(c.id, person.email || "", doc)}
                                      className="w-full inline-flex items-center justify-center gap-1 min-h-[1.25rem] px-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
                                      title={`Abrir "${c.name}" en la entrega de ${person.name || doc || "esta persona"}${statusTxt}${pendingTxt}`}
                                    >
                                      {cell && cell.note ? (
                                        <span className={`font-mono font-bold ${cell.status === "guardado" ? "text-white/50 italic" : "text-white"}`}>
                                          {cell.note}
                                        </span>
                                      ) : (
                                        <span className="text-white/20">—</span>
                                      )}
                                      {cell?.pending && (
                                        <UploadCloud
                                          className="w-3 h-3 text-white shrink-0"
                                          aria-label="Entrega sin evaluar o reenviada"
                                        />
                                      )}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-2 text-center whitespace-nowrap">
                                {avg !== null ? (
                                  <span className="font-mono font-bold text-white text-sm">{Math.round(avg * 10) / 10}</span>
                                ) : (
                                  <span className="text-white/20">—</span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 whitespace-nowrap">
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => { setPersonEditorError(null); setPersonEditor({ mode: "edit", original: doc, name: person.name || "", document: doc, email: person.email || "", phone: person.phone || "" }); }}
                                    className="p-1 text-white/40 hover:text-white hover:bg-white/10 border border-white/5 hover:border-white/15 rounded-md transition-all cursor-pointer"
                                    title="Editar datos de la persona"
                                  >
                                    <PencilLine className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deletePerson(doc, person.name || "")}
                                    className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 hover:border-red-900/20 rounded-md transition-all cursor-pointer"
                                    title="Eliminar del registro"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Remitentes — hidden when the project is a registration-mode parent
            (that view uses the consolidated registry table instead). */}
        {!(copyRegistrationMode && projects.some((p) => (p.parentId || "") === selectedMetaProjectId)) && (
        <div className={`${panelClass} order-1`} style={panelStyle}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <button
              type="button"
              onClick={() => setRemitentesCollapsed((v) => !v)}
              className="flex items-center gap-3 text-left min-w-0"
              title={remitentesCollapsed ? "Expandir remitentes" : "Contraer remitentes"}
            >
              <div className="p-2.5 bg-white/5 text-white rounded-xl shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  Remitentes
                  <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${remitentesCollapsed ? "-rotate-90" : ""}`} />
                </h2>
                <p className="text-xs text-white/40 truncate">
                  {selectedMetaProjectId
                    ? `Envíos de "${selectedProjectName}"`
                    : "Selecciona un proyecto para ver solo sus remitentes"}
                </p>
              </div>
            </button>

            {!remitentesCollapsed && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar remitente, correo, archivo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-[#0d0d0d] border border-white/10 text-white rounded-xl text-xs w-full min-w-[240px] focus:outline-none focus:border-white/20 placeholder-white/20 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void fetchSubmissions();
                  if (selectedMetaProjectId) void loadProjectSubmissions(selectedMetaProjectId);
                }}
                disabled={loadingSubmissions}
                title="Actualizar remitentes"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSubmissions ? "animate-spin" : ""}`} />
              </button>
            </div>
            )}
          </div>

          {!remitentesCollapsed && (loadingSubmissions ? (
            <div className="text-center py-10">
              <p className="text-sm text-white/40">Cargando remitentes...</p>
            </div>
          ) : (
            (() => {
              // Group submissions by sender email (scoped to selected project + search filter)
              const grouped: Record<string, { name: string; email: string; submissions: Submission[] }> = {};
              for (const sub of filteredSubmissions) {
                const email = sub.senderEmail.toLowerCase();
                if (!grouped[email]) {
                  grouped[email] = { name: sub.senderName, email: sub.senderEmail, submissions: [] };
                }
                grouped[email].submissions.push(sub);
              }
              const people = Object.values(grouped);

              // Entry-order number per sender (earliest submission = #1), computed over
              // ALL of the project's submissions so it stays stable while searching.
              // NB: a plain object is used because the lucide "Map" icon shadows the
              // global Map constructor in this file.
              const senderOrder: Record<string, number> = (() => {
                const earliest: Record<string, number> = {};
                for (const sub of scopedSubmissions) {
                  const em = sub.senderEmail.toLowerCase();
                  const t = new Date(sub.timestamp).getTime();
                  if (!(em in earliest) || t < earliest[em]) earliest[em] = t;
                }
                const order: Record<string, number> = {};
                Object.entries(earliest)
                  .sort((a, b) => a[1] - b[1])
                  .forEach(([em], i) => { order[em] = i + 1; });
                return order;
              })();

              if (people.length === 0) {
                return (
                  <div className="text-center py-10 bg-[#0d0d0d]/35 rounded-2xl border border-dashed border-white/5">
                    <p className="text-sm text-white/40">No hay remitentes registrados.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {people.map((person) => {
                    const totalFiles = person.submissions.reduce((acc, s) => acc + s.files.length, 0);
                    const isOpen = expandedSenders[person.email] || false;
                    const fbAnchor = [...person.submissions].sort(
                      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )[0];
                    const fbCount = fbAnchor?.feedbackHistory?.length || 0;
                    const hasDraft = !!fbAnchor?.feedbackDraft;
                    const { note: gradeNote, status: gradeStatus } = latestFeedbackNote(fbAnchor);
                    return (
                      <div key={person.email} id={`sender-row-${normalizeString(person.email)}`} className="border border-white/5 rounded-xl overflow-hidden scroll-mt-24">
                        <button
                          type="button"
                          onClick={() => setExpandedSenders(prev => ({ ...prev, [person.email]: !prev[person.email] }))}
                          className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-all cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {senderOrder[person.email.toLowerCase()] !== undefined && (
                              <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-white/10 text-white/70 text-[10px] font-mono font-bold" title="Orden de entrada">
                                {senderOrder[person.email.toLowerCase()]}
                              </span>
                            )}
                            <div className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                              <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-white truncate block">{person.name}</span>
                              <span className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3" /> {person.email}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {hasDraft && (
                              <span
                                className="text-[10px] text-white/50 font-mono bg-white/5 px-2 py-1 rounded-md border border-white/5 whitespace-nowrap flex items-center gap-1"
                                title="Retroalimentación guardada (borrador), aún sin enviar"
                              >
                                <Save className="w-3 h-3" /> Borrador
                              </span>
                            )}
                            {fbCount > 0 && (
                              <span
                                className="text-[10px] text-white font-mono bg-white/15 px-2 py-1 rounded-md border border-white/25 whitespace-nowrap flex items-center gap-1"
                                title={`${fbCount} retroalimentación(es) enviada(s)`}
                              >
                                <Check className="w-3 h-3" /> {fbCount} resp{fbCount === 1 ? 'uesta' : 'uestas'}
                              </span>
                            )}
                            <span className="text-[10px] text-white/50 font-mono bg-white/5 px-2 py-1 rounded-md border border-white/5 whitespace-nowrap">
                              {person.submissions.length} env{person.submissions.length === 1 ? 'ío' : 'íos'}
                            </span>
                            <span className="text-[10px] text-white/50 font-mono bg-white/5 px-2 py-1 rounded-md border border-white/5 whitespace-nowrap">
                              {totalFiles} arch{totalFiles === 1 ? 'ivo' : 'ivos'}
                            </span>
                            {gradeStatus && (
                              <span
                                className="flex items-center gap-1.5 pl-3 ml-1 border-l border-white/15 whitespace-nowrap"
                                title={gradeStatus === "enviado" ? "Nota enviada por correo" : "Nota guardada (borrador)"}
                              >
                                <span className="text-[9px] uppercase tracking-wider text-white/40 font-mono">Nota</span>
                                <span className="text-xl font-bold font-mono text-white leading-none">
                                  {gradeNote || "—"}
                                </span>
                              </span>
                            )}
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-white/5 bg-black/10">
                            {person.submissions.map((sub) => (
                              <div key={sub.id} className="p-3 border-b border-white/5 last:border-b-0">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] text-white/30 font-mono">
                                    <Calendar className="w-3 h-3 inline mr-1" />
                                    {new Date(sub.timestamp).toLocaleString()}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-white/40 font-semibold bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                      {sub.projectName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSubmission(sub.id, sub.senderName)}
                                      disabled={isDeletingSubmissionId === sub.id}
                                      className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 hover:border-red-900/20 rounded-md transition-all disabled:opacity-50 cursor-pointer shrink-0"
                                      title="Eliminar envío (también en Notion)"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                {sub.comment && sub.comment.trim() && (
                                  <div className="mb-2 rounded-lg border border-white/10 bg-white/5 p-2.5">
                                    <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                      <MessageCircle className="w-3 h-3" /> Comentario del remitente
                                    </div>
                                    <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap break-words">{sub.comment}</p>
                                  </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {sub.files.map((file, fIdx) => {
                                    // Resolve files through a same-origin proxy that fetches the
                                    // fresh Notion URL on demand (avoids CORS + URL expiry).
                                    const blockId = (sub as unknown as { notionBlockId?: string }).notionBlockId;
                                    const viewUrl = blockId
                                      ? `/api/submission-file?block=${encodeURIComponent(blockId)}&i=${fIdx}`
                                      : file.url;
                                    const vf = { name: file.name, size: file.size, url: viewUrl };
                                    return (
                                      <InlineFilePreview
                                        key={fIdx}
                                        file={vf}
                                        onExpand={() => setViewerFile(vf)}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            ))}

                            {/* Nota actual del remitente — mostrada tras los archivos. */}
                            {(() => {
                              const anchorSub = [...person.submissions].sort(
                                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                              )[0];
                              const { note, status } = latestFeedbackNote(anchorSub);
                              if (!status) return null;
                              return (
                                <div className="px-3 pt-3 pb-3">
                                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Nota</div>
                                      {status === "enviado" ? (
                                        <span className="text-[10px] font-mono inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-white/15 text-white border border-white/25">
                                          <Check className="w-3 h-3" /> Enviada
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-white/5 text-white/60 border border-white/10">
                                          <Save className="w-3 h-3" /> Guardada (sin enviar)
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-4xl font-bold font-mono text-white leading-none shrink-0">
                                      {note || "—"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Feedback: comentario + adjuntos + nota opcional + enviar */}
                            {(() => {
                              const fb = getFeedback(person.email);
                              const anchor = [...person.submissions].sort(
                                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                              )[0];
                              const history = anchor?.feedbackHistory || [];
                              const viewIdx = history.length
                                ? Math.min(feedbackView[person.email] ?? history.length - 1, history.length - 1)
                                : -1;
                              const current = viewIdx >= 0 ? history[viewIdx] : null;
                              return (
                                <div className="p-3 border-t border-white/10 space-y-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                                      <Mail className="w-3 h-3" /> Retroalimentación por correo
                                    </div>
                                    {history.length > 0 && (
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => setFeedbackView((v) => ({ ...v, [person.email]: Math.max(0, viewIdx - 1) }))}
                                          disabled={viewIdx <= 0}
                                          className="w-6 h-6 flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-30"
                                          title="Retroalimentación anterior"
                                        >
                                          <ArrowLeft className="w-3 h-3" />
                                        </button>
                                        <span className="text-[10px] text-white/50 font-mono whitespace-nowrap">{viewIdx + 1} / {history.length}</span>
                                        <button
                                          type="button"
                                          onClick={() => setFeedbackView((v) => ({ ...v, [person.email]: Math.min(history.length - 1, viewIdx + 1) }))}
                                          disabled={viewIdx >= history.length - 1}
                                          className="w-6 h-6 flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-30"
                                          title="Retroalimentación siguiente"
                                        >
                                          <ArrowRight className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {current && (
                                    <div className="rounded-lg border border-white/10 bg-white/5 p-2.5 space-y-1.5">
                                      <div className="flex items-center justify-between gap-2 text-[10px] text-white/40 font-mono">
                                        <span><Calendar className="w-3 h-3 inline mr-1" />{new Date(current.sentAt).toLocaleString()}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                          {current.note && current.note.trim() && (
                                            <span className="text-white/80 font-bold whitespace-nowrap">Nota: {current.note}</span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => deleteFeedback(person.email, anchor?.id || "", viewIdx)}
                                            className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 hover:border-red-900/20 rounded-md transition-all shrink-0"
                                            title="Eliminar esta retroalimentación de Notion"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                      {current.comment && current.comment.trim() && (
                                        <p className="text-xs text-white/80 whitespace-pre-wrap break-words">{current.comment}</p>
                                      )}
                                      {current.files && current.files.length > 0 && (
                                        current.filesBlockId ? (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                                            {current.files.map((f, i) => {
                                              const fname = typeof f === "string" ? f : f.name;
                                              const fsize = typeof f === "string" ? undefined : f.size;
                                              const vf: ViewableFile = {
                                                name: fname,
                                                size: fsize,
                                                url: `/api/submission-file?block=${encodeURIComponent(current.filesBlockId as string)}&i=${i}`,
                                              };
                                              return (
                                                <InlineFilePreview
                                                  key={i}
                                                  file={vf}
                                                  onExpand={() => setViewerFile(vf)}
                                                  heightClass="h-40"
                                                />
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div className="flex flex-wrap gap-1 pt-0.5">
                                            {current.files.map((f, i) => (
                                              <span key={i} className="text-[10px] text-white/50 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 truncate max-w-[180px]">
                                                📎 {typeof f === "string" ? f : f.name}
                                              </span>
                                            ))}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  )}

                                  <div className="text-[10px] text-white/30 uppercase tracking-widest">Nueva retroalimentación</div>

                                  <textarea
                                    value={fb.comment}
                                    onChange={(e) => setFeedbackFor(person.email, { comment: e.target.value })}
                                    rows={3}
                                    placeholder="Escribe tus comentarios / feedback..."
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:border-white/30 focus:outline-none resize-y"
                                  />

                                  {/* Adjuntos (arrastra o haz clic) */}
                                  <label
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const dropped = Array.from(e.dataTransfer.files || []);
                                      if (dropped.length) setFeedbackFor(person.email, { files: [...fb.files, ...dropped] });
                                    }}
                                    className="flex items-center gap-2 px-3 py-2.5 bg-white/5 border border-dashed border-white/15 rounded-lg text-xs text-white/50 hover:text-white/80 hover:border-white/30 cursor-pointer transition-all"
                                  >
                                    <UploadCloud className="w-4 h-4 shrink-0" />
                                    <span>Arrastra archivos o haz clic para adjuntar al correo</span>
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => {
                                        const selected = Array.from(e.target.files || []);
                                        if (selected.length) setFeedbackFor(person.email, { files: [...fb.files, ...selected] });
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>

                                  {fb.files.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {fb.files.map((f, i) => (
                                        <LocalFilePreview
                                          key={i}
                                          file={f}
                                          onExpand={(vf) => setViewerFile(vf)}
                                          onRemove={() => setFeedbackFor(person.email, { files: fb.files.filter((_, idx) => idx !== i) })}
                                        />
                                      ))}
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={fb.note}
                                      onChange={(e) => setFeedbackFor(person.email, { note: e.target.value })}
                                      placeholder="Nota (ej: 4.5 / 5) · opcional"
                                      className="w-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
                                    />
                                    <div className="ml-auto flex items-center gap-3">
                                      {fb.msg && (
                                        <span className={`text-[11px] ${fb.msg.type === "success" ? "text-white/70" : "text-red-300"}`}>
                                          {fb.msg.text}
                                        </span>
                                      )}
                                      {/* Guardar / Cancelar: aparecen cuando hay algo que guardar o ya
                                          existe un borrador; desaparecen tras enviar. */}
                                      {(fb.comment.trim() || fb.note.trim() || fb.files.length > 0 || !!anchor?.feedbackDraft) && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => cancelFeedbackDraft(person.email, anchor?.id || "")}
                                            disabled={fb.savingDraft || fb.sending}
                                            className="h-10 px-4 rounded-lg border border-white/20 bg-white/5 hover:bg-red-950/25 hover:border-red-900/40 text-white/70 hover:text-red-300 text-[11px] font-mono uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                                            title="Descartar comentario, nota y archivos (también en Notion)"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                            Cancelar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => saveFeedbackDraft(person.email, anchor?.id || "")}
                                            disabled={fb.savingDraft || fb.sending}
                                            className="h-10 px-4 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white text-[11px] font-mono uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                                            title="Guardar sin enviar (borrador)"
                                          >
                                            {fb.savingDraft ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            {fb.savingDraft ? "Guardando..." : "Guardar"}
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => sendFeedback(person.email, person.name, anchor?.id || "")}
                                        disabled={fb.sending}
                                        className="h-10 px-5 font-mono tracking-widest text-[11px] uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro btn-accent-border group overflow-hidden shrink-0 disabled:opacity-50"
                                        style={{ '--btn-color': (copyBgColor && isBgColorLight ? '#111111' : '#ffffff') } as React.CSSProperties}
                                      >
                                        {/* Accent-colored fill (fades out on hover to reveal the environment) */}
                                        <div
                                          className="absolute inset-0 opacity-100 group-hover:opacity-0 transition-opacity duration-300 rounded-[4px] pointer-events-none"
                                          style={{ backgroundColor: copyBgColor || '#c72323' }}
                                        />
                                        {/* Diagonal lines on top of the accent */}
                                        <div
                                          className="absolute inset-[1px] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px]"
                                          style={{
                                            backgroundColor: copyBgColor || '#c72323',
                                            backgroundImage: `repeating-linear-gradient(119deg, ${isBgColorLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.22)'} 0px, ${isBgColorLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.22)'} 1px, transparent 1px, transparent 10px)`,
                                          }}
                                        />
                                        <span className="btn-motion-corner btn-motion-corner-tl" />
                                        <span className="btn-motion-corner btn-motion-corner-tr" />
                                        <span className="btn-motion-corner btn-motion-corner-bl" />
                                        <span className="btn-motion-corner btn-motion-corner-br" />
                                        <span className="relative z-10 flex items-center justify-center gap-2 font-extrabold">
                                          {fb.sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                          {fb.sending ? "Enviando..." : "Enviar"}
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ))}
        </div>
        )}

        </>
        )}

      </div>

    </div>

    {/* Inline file preview modal (view files directly instead of only downloading). */}
    <FileViewer file={viewerFile} onClose={() => setViewerFile(null)} accentColor={copyBgColor} />

    </div>
  );
}
