import React, { useState, useEffect, useRef } from "react";
import {
  Key, FolderPlus, FileSpreadsheet, Eye, EyeOff, Check,
  AlertCircle, Plus, Search, Mail, Calendar, ExternalLink, Download, ArrowRight, ArrowLeft, Trash2,
  ChevronDown, ChevronRight, X,
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
import { Project, Submission, NotionConfig, ProjectMeta, CustomField, DbColumn } from "../types";
import { ICON_OPTIONS, ICON_BY_KEY, ICON_CATEGORIES } from "../icons";
import DateTimePicker from "./DateTimePicker";
import GradingTable from "./GradingTable";
import { useTheme } from "../ThemeContext";

const genId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const genColId = () => `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const EMPTY_META_LOAD_SIGNATURE = "__missing__";

// ICON_OPTIONS, ICON_BY_KEY and ICON_CATEGORIES now live in ../icons (shared with the landing).

const normalizeString = (s: string) => {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "-") // replace non-alphanumeric with dashes
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

  // Public share link for this project (what you send to other people).
  const shareUrl = `${window.location.origin}/${normalizeString(node.name)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(shareUrl)}`;

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
  const MetaIcon = meta?.icon ? ICON_BY_KEY[meta.icon] : undefined;
  const colorSwatch = meta?.bgColor || "";

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
            {meta?.useDatabase && <Database className="w-3 h-3 text-emerald-400" />}
            {!isActive && <span className="text-[9px] text-red-400">Inactivo</span>}
          </div>
        </div>

        {/* Color + icon assigned to this project/folder */}
        <div className="flex items-center gap-1.5 shrink-0">
          {colorSwatch && (
            <span
              className="w-5 h-5 rounded-md border border-white/20 shrink-0"
              style={{ background: colorSwatch }}
              title={`Color: ${colorSwatch}`}
            />
          )}
          {MetaIcon && (
            <span
              className="w-6 h-6 rounded-md border border-white/10 flex items-center justify-center shrink-0"
              style={{ background: colorSwatch || "rgba(255,255,255,0.05)" }}
              title="Icono del proyecto"
            >
              <MetaIcon className="w-3.5 h-3.5 text-white" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onOpen(node.id)} title="Administrar / editar" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"><ArrowRight className="w-3.5 h-3.5" /></button>
          <button onClick={() => setAdding((v) => !v)} title="Crear dentro" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setRenameName(node.name); setRenaming((v) => !v); }} title="Renombrar" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"><PencilLine className="w-3.5 h-3.5" /></button>
          <button onClick={() => onToggleActive(node.id, isActive)} title={isActive ? "Desactivar" : "Activar"} className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10">{isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
          <button onClick={copyLink} title="Copiar enlace para compartir" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10">{copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link className="w-3.5 h-3.5" />}</button>
          <button onClick={copyQr} title="Copiar código QR" className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10">{copiedQr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <QrCode className="w-3.5 h-3.5" />}</button>
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

export default function AdminPanel({
  projects,
  refreshProjects,
  config,
  refreshConfig,
  projectMeta,
  refreshProjectMeta,
  applyProjectMetaUpdate,
  applyProjectMetaUpdates,
  onAdminPreviewChange
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
  const [projIconOpen, setProjIconOpen] = useState(false);
  const projIconRef = useRef<HTMLDivElement>(null);
  const [copyUseDatabase, setCopyUseDatabase] = useState(false);
  const [copyDatabaseId, setCopyDatabaseId] = useState("");
  const [copyDbColumns, setCopyDbColumns] = useState<DbColumn[]>([]);

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
  const useAdaptivePanel = adminView === "detail" && !!copyBgColor;
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

  // Close the icon picker when clicking anywhere outside of it.
  useEffect(() => {
    if (!projIconOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (projIconRef.current && !projIconRef.current.contains(event.target as Node)) {
        setProjIconOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [projIconOpen]);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedShareQr, setCopiedShareQr] = useState(false);
  const [metaMessage, setMetaMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Project state
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isDeletingProjectId, setIsDeletingProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSenders, setExpandedSenders] = useState<Record<string, boolean>>({});
  const [isDeletingSubmissionId, setIsDeletingSubmissionId] = useState<string | null>(null);

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

  // Handle copywriting selection initialization and auto-healing
  useEffect(() => {
    if (projects.length > 0) {
      if (!selectedMetaProjectId || !projects.some(p => p.id === selectedMetaProjectId)) {
        setSelectedMetaProjectId(projects[0].id);
      }
    }
  }, [projects, selectedMetaProjectId]);

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
    if (!onAdminPreviewChange || !selectedMetaProjectId) return;
    const timer = setTimeout(() => {
      onAdminPreviewChange({
        projectId: selectedMetaProjectId,
        bgColor: adminView === "detail" ? copyBgColor : "",
        backgroundImage: "",
        bgBlur: 0,
        textColor: copyTextColor,
        icon: copyIcon,
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [selectedMetaProjectId, copyBgColor, copyTextColor, copyIcon, onAdminPreviewChange, adminView]);

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
    groupId: copyGroupId,
    order: projectMeta[selectedMetaProjectId]?.order ?? 0,
  });

  /**
   * Persist the project meta and apply it optimistically. Deliberately does NOT
   * refetch or refresh, so saving never bounces you out of the admin view.
   */
  const persistProjectMeta = async (successText: string) => {
    if (!selectedMetaProjectId) return;
    const nextMeta = buildProjectMeta();
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



  const fetchSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const res = await fetch("/api/submissions");
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.submissions);
      }
    } catch (e) {
      console.error("Error loading submissions", e);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  /** Delete a submission everywhere: Notion (toggle + db row) and the local log. */
  const handleDeleteSubmission = async (submissionId: string, senderName: string) => {
    if (!window.confirm(`¿Eliminar el envío de "${senderName}"? Se borrará también de Notion y no se puede deshacer.`)) return;
    setIsDeletingSubmissionId(submissionId);
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      } else {
        alert(data.error || "No se pudo eliminar el envío.");
      }
    } catch {
      alert("Error de red al eliminar el envío.");
    } finally {
      setIsDeletingSubmissionId(null);
    }
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
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewProjectName("");
        await refreshProjects();
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

  /** Create a project/folder INSIDE another one (tree). */
  const handleCreateChild = async (parentId: string, name: string) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parentId }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "No se pudo crear el proyecto dentro de la carpeta.");
      return;
    }
    await refreshProjects();
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

  const handleDeleteProject = async (projId: string, projName: string) => {
    if (!window.confirm(`┬┐Est├ís seguro de que quieres eliminar la carpeta del proyecto "${projName}"? Se borrar├í tanto de Notion como localmente.`)) return;

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
        alert(data.error || "No se pudo eliminar el proyecto.");
      }
    } catch (err) {
      alert("Error de red al intentar eliminar el proyecto.");
    } finally {
      setIsDeletingProjectId(null);
    }
  };

  const handleClearConfig = async () => {
    if (!window.confirm("┬┐Est├ís seguro de que quieres eliminar las credenciales de Notion actuales?")) return;
    try {
      const res = await fetch("/api/config/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setNotionSecret("");
        setParentPageId("");
        setSaveMessage({ type: "success", text: "Configuraci├│n eliminada." });
        await refreshConfig();
        await refreshProjects();
      }
    } catch (e) {
      console.error(e);
    }
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
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              {selectedProjectName || "Proyecto"}
            </h2>
            <p className="text-xs text-white/40">Editando proyecto · pulsa la flecha para volver</p>
          </div>
        </div>
      )}

    <div className={adminView === "detail" ? "grid grid-cols-1 lg:grid-cols-3 gap-8" : "space-y-8"}>

      {/* Portada de Inicio — compact bar on top of the browse view (full width) */}
      {adminView === "browse" && (
        <div className={panelClass} style={panelStyle}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0">
              <h2 className="text-sm font-semibold text-white">Portada de Inicio</h2>
              <p className="text-[11px] text-white/40">Color e icono de la página principal</p>
            </div>

            {/* Color picker button */}
            <label
              className="relative w-10 h-10 rounded-lg border border-white/15 cursor-pointer shrink-0 flex items-center justify-center overflow-hidden"
              style={{ background: homeBgColor || "#050505" }}
              title={`Color de fondo: ${homeBgColor || "#050505"}`}
            >
              <input
                type="color"
                value={homeBgColor || "#050505"}
                onChange={(e) => setHomeBgColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Palette className="w-4 h-4 text-white pointer-events-none mix-blend-difference" />
            </label>

            {/* Icon dropdown toggle */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setHomeIconOpen((v) => !v)}
                className="h-10 px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white flex items-center gap-2 transition-all"
                title="Elegir icono de la portada"
              >
                {(() => { const I = ICON_BY_KEY[homeIcon] || UploadCloud; return <I className="w-4 h-4" />; })()}
                <span className="text-xs">Icono</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${homeIconOpen ? "rotate-180" : ""}`} />
              </button>
              {homeIconOpen && (
                <div className="absolute right-0 mt-2 z-20 w-72 p-2 rounded-xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
                  <input
                    type="text"
                    placeholder="Buscar icono..."
                    value={homeIconSearch}
                    onChange={(e) => setHomeIconSearch(e.target.value)}
                    className="w-full mb-2 px-2.5 py-2 bg-[#111111] border border-white/10 rounded-lg text-xs text-white placeholder-white/20 focus:border-white/30 focus:outline-none"
                  />
                  <div className="grid grid-cols-6 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {filteredHomeIcons.map(({ key, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setHomeIcon(key); setHomeIconOpen(false); }}
                        className={`h-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${homeIcon === key ? "border-white bg-white/10 text-white" : "border-white/10 bg-[#111111] text-white/55 hover:text-white hover:border-white/25"}`}
                        title={key}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Save button */}
            <button
              type="button"
              onClick={() => handleSaveHomeAppearance()}
              disabled={isSavingHomeAppearance}
              className="h-10 px-4 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wide hover:bg-white/90 transition-all disabled:opacity-50 shrink-0"
            >
              {isSavingHomeAppearance ? "Guardando..." : "Guardar"}
            </button>

            {homeAppearanceMessage && (
              <span className={`text-xs shrink-0 ${homeAppearanceMessage.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {homeAppearanceMessage.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Project editor column — detail view only */}
      {adminView === "detail" && (
      <div className="col-span-1 space-y-8">

        {/* Compact appearance bar — icon-only controls on a single line. */}
        {selectedMetaProjectId && projects.find((p) => p.id === selectedMetaProjectId) && (
          <div className={`${panelClass} relative ${projIconOpen ? "z-50" : "z-10"}`} style={panelStyle}>
            <div className="flex items-center gap-2">
              {/* Color picker — same look as the other icon buttons (the chosen color
                  already shows across the whole environment). */}
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

              {/* Icon picker — icon-only button + large categorized popover */}
              <div className="relative shrink-0" ref={projIconRef}>
                <button
                  type="button"
                  onClick={() => setProjIconOpen((v) => !v)}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all ${projIconOpen ? "border-white/50 bg-white/15 text-white" : "border-white/15 bg-white/5 hover:bg-white/10 text-white"}`}
                  title="Elegir icono del proyecto"
                >
                  {(() => { const I = ICON_BY_KEY[copyIcon] || UploadCloud; return <I className="w-4 h-4" />; })()}
                </button>
                {projIconOpen && (
                  <div className="admin-dark-popover absolute left-0 mt-2 z-50 w-[24rem] max-w-[calc(100vw-3rem)] p-3 rounded-xl border border-white/10 shadow-2xl">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Buscar icono por nombre o categoría..."
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      className="w-full mb-3 px-2.5 py-2 bg-[#111111] border border-white/10 rounded-lg text-xs text-white placeholder-white/20 focus:border-white/30 focus:outline-none"
                    />
                    {(() => {
                      const q = iconSearch.trim().toLowerCase();
                      const matches = (o: typeof ICON_OPTIONS[number]) =>
                        !q || o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q) || o.cat.toLowerCase().includes(q);

                      const renderButton = (opt: typeof ICON_OPTIONS[number]) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => { setCopyIcon(opt.key); setProjIconOpen(false); setIconSearch(""); }}
                          className={`h-10 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${copyIcon === opt.key ? "border-white bg-white/15 text-white" : "border-white/10 bg-[#111111] text-white/60 hover:text-white hover:border-white/30"}`}
                          title={`${opt.label} · ${opt.cat}`}
                        >
                          <opt.Icon className="w-4 h-4" />
                        </button>
                      );

                      const filtered = ICON_OPTIONS.filter(matches);

                      return (
                        <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-3">
                          {q ? (
                            filtered.length > 0 ? (
                              <div className="grid grid-cols-7 gap-1.5">{filtered.map(renderButton)}</div>
                            ) : (
                              <p className="text-[11px] text-white/40 text-center py-6">Sin resultados para "{iconSearch}"</p>
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
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Share: copy public link + copy QR image (like the project tree / home) */}
              {(() => {
                const proj = projects.find((p) => p.id === selectedMetaProjectId);
                if (!proj) return null;
                const shareUrl = `${window.location.origin}/${normalizeString(proj.name)}`;
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
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={copyShareLink}
                      title="Copiar enlace para compartir"
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Link className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={copyShareQr}
                      title="Copiar código QR"
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all"
                    >
                      {copiedShareQr ? <Check className="w-4 h-4 text-emerald-400" /> : <QrCode className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Project Custom Copywriting */}
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

              {/* Database mode (point 8) */}
              <div className="space-y-2 border-t border-white/5 pt-4">
                <div
                  className="flex items-center gap-2 p-1.5 rounded-xl"
                  style={{
                    backgroundColor: databaseSurface,
                    border: `1px solid ${databaseBorder}`,
                    color: databaseText,
                  }}
                >
                  <input
                    type="checkbox"
                    id="use-database-checkbox"
                    checked={copyUseDatabase}
                    onChange={(e) => setCopyUseDatabase(e.target.checked)}
                    className="w-4 h-4 rounded focus:ring-0 cursor-pointer"
                    style={{ accentColor: databaseAccent }}
                  />
                  <label htmlFor="use-database-checkbox" className="text-[11px] font-bold cursor-pointer select-none" style={{ color: databaseText }}>
                    Usar base de datos (tabla en Notion)
                  </label>
                </div>
                <p className="text-[10px]" style={{ color: databaseMuted }}>
                  Sin base de datos: cada envío crea un toggle por persona (modo actual). Con base de datos: cada envío se guarda como fila en una tabla de Notion y puedes calificar.
                </p>

                {copyUseDatabase && (
                  <div
                    className="space-y-2 rounded-xl p-3"
                    style={{
                      backgroundColor: databaseSurface,
                      border: `1px solid ${databaseBorder}`,
                      color: databaseText,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: databaseMuted }}>
                        Columnas de control
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCopyDbColumns((prev) => [...prev, { id: genColId(), name: "", type: "text" }])
                        }
                        className="text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                        style={{ color: databaseAccent }}
                      >
                        <Plus className="w-3 h-3" /> Agregar columna
                      </button>
                    </div>

                    {copyDbColumns.length === 0 ? (
                      <p className="text-[10px] text-center py-1" style={{ color: databaseMuted }}>
                        Ej: Nota, Estado, Comentarios. Nombre, Correo, Fecha y Archivos se añaden automáticamente.
                      </p>
                    ) : (
                      copyDbColumns.map((col, idx) => (
                        <div key={col.id} className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Nombre (ej: Nota)"
                            value={col.name}
                            onChange={(e) =>
                              setCopyDbColumns((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                              )
                            }
                            className="min-w-[140px] flex-1 px-2.5 py-2 rounded-lg text-xs focus:outline-none"
                            style={{
                              backgroundColor: databaseSurface,
                              border: `1px solid ${databaseBorder}`,
                              color: databaseText,
                            }}
                          />
                          <select
                            value={col.type}
                            onChange={(e) =>
                              setCopyDbColumns((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, type: e.target.value as DbColumn["type"] } : c))
                              )
                            }
                            className="px-2 py-2 rounded-lg text-xs cursor-pointer"
                            style={{
                              backgroundColor: databaseSurface,
                              border: `1px solid ${databaseBorder}`,
                              color: databaseText,
                            }}
                          >
                            <option value="text">Texto</option>
                            <option value="number">Número</option>
                            <option value="select">Selección</option>
                            <option value="checkbox">Casilla</option>
                            <option value="date">Fecha</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setCopyDbColumns((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-2 rounded-lg transition-all cursor-pointer shrink-0"
                            style={{
                              color: isBgColorLight ? "#b91c1c" : "#fecaca",
                              backgroundColor: isBgColorLight ? "rgba(220, 38, 38, 0.08)" : "rgba(127, 29, 29, 0.18)",
                              border: `1px solid ${databaseBorder}`,
                            }}
                            title="Eliminar columna"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {copyDatabaseId ? (
                        <span className="text-[10px] font-mono truncate flex items-center gap-1" style={{ color: databaseAccent }}>
                          <Check className="w-3 h-3 shrink-0" /> BD: {copyDatabaseId.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400/80">Aún no se ha creado la base de datos.</span>
                      )}
                      <button
                        type="button"
                        onClick={handleCreateDatabase}
                        disabled={isCreatingDb}
                        className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-50 cursor-pointer"
                        style={{
                          backgroundColor: databaseSurface,
                          borderColor: databaseBorder,
                          color: databaseText,
                        }}
                      >
                        {isCreatingDb ? "Creando..." : copyDatabaseId ? "Recrear BD" : "Crear base de datos"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

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

              {metaMessage && (
                <div className={`p-3 rounded-xl text-xs flex gap-2 items-center ${metaMessage.type === "success"
                    ? "bg-emerald-950/30 text-emerald-300 border border-emerald-900/50"
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

      </div>
      )}

      {/* Projects and creations column */}
      <div className="col-span-1 lg:col-span-2 space-y-8">

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
            <span className="bg-white/5 text-white/70 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/10">
              Total: {projects.length}
            </span>
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

        {/* Grading table per project (point 9) */}
        {selectedMetaProjectId && projects.find((p) => p.id === selectedMetaProjectId) && (
          <div className={panelClass} style={panelStyle}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-white/5 text-white rounded-xl">
                <Table className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Tabla de Calificaciones</h2>
                <p className="text-xs text-white/40">
                  {projects.find((p) => p.id === selectedMetaProjectId)?.name}
                </p>
              </div>
            </div>
            <GradingTable
              project={projects.find((p) => p.id === selectedMetaProjectId)!}
              meta={projectMeta[selectedMetaProjectId]}
              submissions={submissions}
              refreshSubmissions={fetchSubmissions}
            />
          </div>
        )}

        {/* Senders Toggle List */}
        <div className={panelClass} style={panelStyle}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-white/5 text-white rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Remitentes</h2>
              <p className="text-xs text-white/40">
                {selectedMetaProjectId
                  ? `Envíos de "${selectedProjectName}"`
                  : "Selecciona un proyecto para ver solo sus remitentes"}
              </p>
            </div>
          </div>

          {loadingSubmissions ? (
            <div className="text-center py-10">
              <p className="text-sm text-white/40">Cargando remitentes...</p>
            </div>
          ) : (
            (() => {
              // Group submissions by sender email (scoped to selected project)
              const grouped: Record<string, { name: string; email: string; submissions: Submission[] }> = {};
              for (const sub of scopedSubmissions) {
                const email = sub.senderEmail.toLowerCase();
                if (!grouped[email]) {
                  grouped[email] = { name: sub.senderName, email: sub.senderEmail, submissions: [] };
                }
                grouped[email].submissions.push(sub);
              }
              const people = Object.values(grouped);

              if (people.length === 0) {
                return (
                  <div className="text-center py-10 bg-[#0d0d0d]/35 rounded-2xl border border-dashed border-white/5">
                    <p className="text-sm text-white/40">No hay remitentes registrados.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {people.map((person) => {
                    const totalFiles = person.submissions.reduce((acc, s) => acc + s.files.length, 0);
                    const isOpen = expandedSenders[person.email] || false;
                    return (
                      <div key={person.email} className="border border-white/5 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedSenders(prev => ({ ...prev, [person.email]: !prev[person.email] }))}
                          className="w-full flex items-center justify-between p-3 bg-[#0d0d0d] hover:bg-[#141414] transition-all cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
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
                            <span className="text-[10px] text-white/50 font-mono bg-white/5 px-2 py-1 rounded-md border border-white/5 whitespace-nowrap">
                              {person.submissions.length} env{person.submissions.length === 1 ? 'ío' : 'íos'}
                            </span>
                            <span className="text-[10px] text-white/50 font-mono bg-white/5 px-2 py-1 rounded-md border border-white/5 whitespace-nowrap">
                              {totalFiles} arch{totalFiles === 1 ? 'ivo' : 'ivos'}
                            </span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-white/5 bg-[#090909]">
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {sub.files.map((file, fIdx) => (
                                    <div
                                      key={fIdx}
                                      className="flex items-center justify-between p-2 rounded-lg bg-[#111111] border border-white/5 text-xs text-white/80 min-w-0"
                                    >
                                      <span className="truncate flex-1 pr-2" title={file.name}>
                                        📎 {file.name}
                                      </span>
                                      <span className="text-[10px] text-white/40 font-mono shrink-0 whitespace-nowrap pr-2">
                                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                                      </span>
                                      <a
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-white/5 hover:bg-white/15 p-1 rounded-md border border-white/10 shrink-0 text-white/60 hover:text-white transition-colors"
                                        title="Descargar Archivo"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>

        {/* Deliveries Submission Log */}
        <div className={panelClass} style={panelStyle}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/5 text-white rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Historial de Entregas</h2>
                <p className="text-xs text-white/40">
                  {selectedMetaProjectId
                    ? `Entregas de "${selectedProjectName}"`
                    : "Histórico de todas las transferencias registradas"}
                </p>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar remitente, correo, archivo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-[#0d0d0d] border border-white/10 text-white rounded-xl text-xs w-full min-w-[240px] focus:outline-none focus:border-white/20 placeholder-white/20 transition-all"
              />
            </div>
          </div>

          {loadingSubmissions ? (
            <div className="text-center py-10">
              <p className="text-sm text-white/40">Cargando histórico...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="text-center py-10 bg-[#0d0d0d]/35 rounded-2xl border border-dashed border-white/5">
              <p className="text-sm text-white/40">No se encontraron entregas en la plataforma.</p>
              <p className="text-xs text-white/20 mt-1">Envía tus primeros archivos usando la interfaz principal.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
              {filteredSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-4 border border-white/5 hover:border-white/10 bg-[#0d0d0d] rounded-xl hover:shadow-none transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                    <div>
                      <h4 className="text-sm font-semibold text-white">{sub.senderName}</h4>
                      <p className="text-xs text-white/50 flex items-center gap-1.5 mt-0.5">
                        <Mail className="w-3.5 h-3.5 shrink-0" /> {sub.senderEmail}
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <span className="inline-block bg-white/5 text-white/70 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-white/5 select-none">
                          Proyecto: {sub.projectName}
                        </span>
                        <p className="text-[10px] text-white/35 mt-1 flex items-center justify-end gap-1 font-mono">
                          <Calendar className="w-3 h-3" /> {new Date(sub.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubmission(sub.id, sub.senderName)}
                        disabled={isDeletingSubmissionId === sub.id}
                        className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 hover:border-red-900/20 rounded-lg transition-all disabled:opacity-50 cursor-pointer shrink-0"
                        title="Eliminar envío (también en Notion)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest">
                      Archivos entregados ({sub.files.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sub.files.map((file, fIdx) => (
                        <div
                          key={fIdx}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#111111] border border-white/5 text-xs text-white/80 min-w-0"
                        >
                          <span className="truncate flex-1 pr-2" title={file.name}>
                            ≡ƒôÄ {file.name}
                          </span>
                          <span className="text-[10px] text-white/40 font-mono shrink-0 whitespace-nowrap pr-2">
                            {(file.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white/5 hover:bg-white/15 p-1 rounded-md border border-white/10 shrink-0 text-white/60 hover:text-white transition-colors"
                            title="Descargar Archivo"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

      </div>

    </div>

    </div>
  );
}
