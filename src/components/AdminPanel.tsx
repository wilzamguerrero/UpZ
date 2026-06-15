import React, { useState, useEffect } from "react";
import {
  Key, FolderPlus, FileSpreadsheet, Eye, EyeOff, Check,
  AlertCircle, Plus, Search, Mail, Calendar, ExternalLink, Download, ArrowRight, Trash2,
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
import DateTimePicker from "./DateTimePicker";
import GradingTable from "./GradingTable";
import { useTheme } from "../ThemeContext";

const genId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const genColId = () => `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const EMPTY_META_LOAD_SIGNATURE = "__missing__";

const ICON_OPTIONS: { key: string; Icon: LucideIcon; label: string; cat: string }[] = [
  // Archivos
  { key: "UploadCloud", Icon: UploadCloud, label: "Subida", cat: "Archivos" },
  { key: "FileText", Icon: FileText, label: "Documento", cat: "Archivos" },
  { key: "File", Icon: File, label: "Archivo", cat: "Archivos" },
  { key: "Folder", Icon: Folder, label: "Carpeta", cat: "Archivos" },
  { key: "FolderOpen", Icon: FolderOpen, label: "Abierto", cat: "Archivos" },
  { key: "Archive", Icon: Archive, label: "Archivo ZIP", cat: "Archivos" },
  { key: "Download", Icon: Download, label: "Descargar", cat: "Archivos" },
  { key: "Image", Icon: Image, label: "Imagen", cat: "Archivos" },
  // Tecnología
  { key: "Code2", Icon: Code2, label: "Código", cat: "Tecnología" },
  { key: "Terminal", Icon: Terminal, label: "Terminal", cat: "Tecnología" },
  { key: "Cpu", Icon: Cpu, label: "CPU", cat: "Tecnología" },
  { key: "Server", Icon: Server, label: "Servidor", cat: "Tecnología" },
  { key: "Database", Icon: Database, label: "Base datos", cat: "Tecnología" },
  { key: "Wifi", Icon: Wifi, label: "WiFi", cat: "Tecnología" },
  { key: "Monitor", Icon: Monitor, label: "Monitor", cat: "Tecnología" },
  { key: "Laptop", Icon: Laptop, label: "Laptop", cat: "Tecnología" },
  { key: "Smartphone", Icon: Smartphone, label: "Móvil", cat: "Tecnología" },
  { key: "HardDrive", Icon: HardDrive, label: "Disco", cat: "Tecnología" },
  { key: "Keyboard", Icon: Keyboard, label: "Teclado", cat: "Tecnología" },
  // Educación
  { key: "GraduationCap", Icon: GraduationCap, label: "Graduación", cat: "Educación" },
  { key: "BookOpen", Icon: BookOpen, label: "Libro", cat: "Educación" },
  { key: "Microscope", Icon: Microscope, label: "Microscopio", cat: "Educación" },
  { key: "FlaskConical", Icon: FlaskConical, label: "Química", cat: "Educación" },
  { key: "Atom", Icon: Atom, label: "Física", cat: "Educación" },
  { key: "Calculator", Icon: Calculator, label: "Calculadora", cat: "Educación" },
  { key: "Ruler", Icon: Ruler, label: "Regla", cat: "Educación" },
  { key: "PencilLine", Icon: PencilLine, label: "Lápiz", cat: "Educación" },
  { key: "Brain", Icon: Brain, label: "Mente", cat: "Educación" },
  { key: "Sigma", Icon: Sigma, label: "Sigma", cat: "Educación" },
  { key: "FunctionSquare", Icon: FunctionSquare, label: "Función", cat: "Educación" },
  // Arte & Diseño
  { key: "Palette", Icon: Palette, label: "Paleta", cat: "Arte" },
  { key: "Layers", Icon: Layers, label: "Capas", cat: "Arte" },
  { key: "Scissors", Icon: Scissors, label: "Tijeras", cat: "Arte" },
  { key: "Wand2", Icon: Wand2, label: "Varita", cat: "Arte" },
  { key: "Sparkles", Icon: Sparkles, label: "Brillos", cat: "Arte" },
  { key: "Lightbulb", Icon: Lightbulb, label: "Idea", cat: "Arte" },
  // Medios
  { key: "Camera", Icon: Camera, label: "Cámara", cat: "Medios" },
  { key: "Film", Icon: Film, label: "Película", cat: "Medios" },
  { key: "Video", Icon: Video, label: "Video", cat: "Medios" },
  { key: "Music", Icon: Music, label: "Música", cat: "Medios" },
  { key: "Headphones", Icon: Headphones, label: "Audífonos", cat: "Medios" },
  { key: "Mic", Icon: Mic, label: "Micrófono", cat: "Medios" },
  { key: "Radio", Icon: Radio, label: "Radio", cat: "Medios" },
  { key: "Tv", Icon: Tv, label: "TV", cat: "Medios" },
  { key: "Newspaper", Icon: Newspaper, label: "Prensa", cat: "Medios" },
  // Naturaleza
  { key: "Sun", Icon: Sun, label: "Sol", cat: "Naturaleza" },
  { key: "Moon", Icon: Moon, label: "Luna", cat: "Naturaleza" },
  { key: "Cloud", Icon: Cloud, label: "Nube", cat: "Naturaleza" },
  { key: "Snowflake", Icon: Snowflake, label: "Nieve", cat: "Naturaleza" },
  { key: "Flame", Icon: Flame, label: "Fuego", cat: "Naturaleza" },
  { key: "Leaf", Icon: Leaf, label: "Hoja", cat: "Naturaleza" },
  { key: "Mountain", Icon: Mountain, label: "Montaña", cat: "Naturaleza" },
  { key: "Flower2", Icon: Flower2, label: "Flor", cat: "Naturaleza" },
  { key: "Globe", Icon: Globe, label: "Mundo", cat: "Naturaleza" },
  // Logros
  { key: "Award", Icon: Award, label: "Premio", cat: "Logros" },
  { key: "Trophy", Icon: Trophy, label: "Trofeo", cat: "Logros" },
  { key: "Star", Icon: Star, label: "Estrella", cat: "Logros" },
  { key: "Zap", Icon: Zap, label: "Rayo", cat: "Logros" },
  { key: "Rocket", Icon: Rocket, label: "Cohete", cat: "Logros" },
  { key: "Target", Icon: Target, label: "Meta", cat: "Logros" },
  { key: "Activity", Icon: Activity, label: "Actividad", cat: "Logros" },
  { key: "Dumbbell", Icon: Dumbbell, label: "Gym", cat: "Logros" },
  // Negocios
  { key: "Briefcase", Icon: Briefcase, label: "Trabajo", cat: "Negocios" },
  { key: "Building2", Icon: Building2, label: "Empresa", cat: "Negocios" },
  { key: "Package", Icon: Package, label: "Paquete", cat: "Negocios" },
  { key: "ShoppingCart", Icon: ShoppingCart, label: "Tienda", cat: "Negocios" },
  { key: "Truck", Icon: Truck, label: "Envío", cat: "Negocios" },
  { key: "Wallet", Icon: Wallet, label: "Cartera", cat: "Negocios" },
  { key: "CreditCard", Icon: CreditCard, label: "Pago", cat: "Negocios" },
  { key: "TrendingUp", Icon: TrendingUp, label: "Tendencia", cat: "Negocios" },
  { key: "BarChart3", Icon: BarChart3, label: "Gráfica", cat: "Negocios" },
  // Comunicación
  { key: "Mail", Icon: Mail, label: "Correo", cat: "Comunicación" },
  { key: "Phone", Icon: Phone, label: "Teléfono", cat: "Comunicación" },
  { key: "MessageCircle", Icon: MessageCircle, label: "Chat", cat: "Comunicación" },
  { key: "Bell", Icon: Bell, label: "Notif.", cat: "Comunicación" },
  { key: "Share2", Icon: Share2, label: "Compartir", cat: "Comunicación" },
  { key: "Users", Icon: Users, label: "Equipo", cat: "Comunicación" },
  { key: "User", Icon: User, label: "Usuario", cat: "Comunicación" },
  { key: "Heart", Icon: Heart, label: "Me gusta", cat: "Comunicación" },
  // Herramientas
  { key: "Settings", Icon: Settings, label: "Ajustes", cat: "Herramientas" },
  { key: "Wrench", Icon: Wrench, label: "Llave", cat: "Herramientas" },
  { key: "Hammer", Icon: Hammer, label: "Martillo", cat: "Herramientas" },
  { key: "Compass", Icon: Compass, label: "Brújula", cat: "Herramientas" },
  { key: "Map", Icon: Map, label: "Mapa", cat: "Herramientas" },
  { key: "Shield", Icon: Shield, label: "Seguridad", cat: "Herramientas" },
  { key: "Lock", Icon: Lock, label: "Candado", cat: "Herramientas" },
  { key: "Fingerprint", Icon: Fingerprint, label: "Huella", cat: "Herramientas" },
  { key: "Bug", Icon: Bug, label: "Debug", cat: "Herramientas" },
  { key: "Gamepad2", Icon: Gamepad2, label: "Juego", cat: "Herramientas" },
];

const normalizeString = (s: string) => {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "-") // replace non-alphanumeric with dashes
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
  onAdminPreviewChange?: (preview: {
    projectId: string;
    bgColor: string;
    backgroundImage: string;
    bgBlur: number;
  }) => void;
}

export default function AdminPanel({
  projects,
  refreshProjects,
  config,
  refreshConfig,
  projectMeta,
  refreshProjectMeta,
  applyProjectMetaUpdate,
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
  const [homeTitle, setHomeTitle] = useState(appearance.homeTitle);
  const [homeTitleSize, setHomeTitleSize] = useState(appearance.homeTitleSize);
  const [homeMessage, setHomeMessage] = useState(appearance.homeMessage);
  const [homeIcon, setHomeIcon] = useState(appearance.homeIcon);
  const [homeBgColor, setHomeBgColor] = useState(appearance.homeBgColor);
  const [homeIconSearch, setHomeIconSearch] = useState("");
  const [isSavingHomeAppearance, setIsSavingHomeAppearance] = useState(false);
  const [homeAppearanceMessage, setHomeAppearanceMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Copywriting editor states
  const [selectedMetaProjectId, setSelectedMetaProjectId] = useState("");
  const [copyTitle, setCopyTitle] = useState("");
  const [copyDesc, setCopyDesc] = useState("");
  const [copyCustomFields, setCopyCustomFields] = useState<CustomField[]>([]);
  const [copyExpiration, setCopyExpiration] = useState("");
  const [copyBackground, setCopyBackground] = useState("");
  const [copyBgBlur, setCopyBgBlur] = useState(0);
  const [copyBgColor, setCopyBgColor] = useState("");
  const [copyIsActive, setCopyIsActive] = useState(true);
  const [copyIcon, setCopyIcon] = useState("UploadCloud");
  const [iconSearch, setIconSearch] = useState("");
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
  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [copyGroupId, setCopyGroupId] = useState("");

  // Drag & drop ordering state
  const [dragId, setDragId] = useState<string | null>(null);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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
    setHomeTitle(appearance.homeTitle);
    setHomeTitleSize(appearance.homeTitleSize);
    setHomeMessage(appearance.homeMessage);
    setHomeIcon(appearance.homeIcon);
    setHomeBgColor(appearance.homeBgColor);
  }, [appearance.homeTitle, appearance.homeTitleSize, appearance.homeMessage, appearance.homeIcon, appearance.homeBgColor]);

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

  // Sync current editing visual customisations to parent App under adminPreview
  useEffect(() => {
    if (onAdminPreviewChange && selectedMetaProjectId) {
      onAdminPreviewChange({
        projectId: selectedMetaProjectId,
        bgColor: copyBgColor,
        backgroundImage: "",
        bgBlur: 0,
      });
    }
  }, [selectedMetaProjectId, copyBgColor, onAdminPreviewChange]);

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMetaProjectId) return;

    const nextMeta: ProjectMeta = {
      title: copyTitle,
      description: copyDesc,
      customFields: copyCustomFields,
      expirationDate: copyExpiration,
      backgroundImage: "",
      bgBlur: 0,
      bgColor: copyBgColor,
      icon: copyIcon,
      isActive: copyIsActive,
      useDatabase: copyUseDatabase,
      databaseId: copyDatabaseId,
      dbColumns: copyDbColumns,
      groupId: copyGroupId,
      order: projectMeta[selectedMetaProjectId]?.order ?? 0,
    };

    setIsSavingMeta(true);
    setMetaMessage(null);
    try {
      const res = await fetch("/api/project-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedMetaProjectId,
          ...nextMeta,
        }),
      });
      const data = await res.json();
      if (data.success) {
        applyProjectMetaUpdate(selectedMetaProjectId, nextMeta);
        setMetaMessage({ type: "success", text: "┬íTextos guardados correctamente!" });
        await refreshProjectMeta(selectedMetaProjectId);
      } else {
        setMetaMessage({ type: "error", text: data.error || "No se pudieron guardar los textos." });
      }
    } catch (err) {
      setMetaMessage({ type: "error", text: "Error de red al intentar guardar los textos." });
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleSaveHomeAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingHomeAppearance(true);
    setHomeAppearanceMessage(null);

    try {
      await saveAppearance({
        ...appearance,
        homeTitle,
        homeTitleSize,
        homeMessage,
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

  /** Persist only group/order for a project without touching the editor form. */
  const persistOrderGroup = async (projId: string, patch: { groupId?: string; order?: number }) => {
    const existing = projectMeta[projId] || { title: "", description: "" };
    await fetch("/api/project-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projId,
        ...existing,
        groupId: patch.groupId !== undefined ? patch.groupId : existing.groupId || "",
        order: patch.order !== undefined ? patch.order : existing.order ?? 0,
      }),
    });
  };

  /** Reorder projects via drag & drop, persisting the new order to each project. */
  const handleDropReorder = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ordered = [...orderedProjects];
    const fromIdx = ordered.findIndex((p) => p.id === dragId);
    const toIdx = ordered.findIndex((p) => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDragId(null);
      return;
    }
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    setDragId(null);
    // Persist new order index for every project.
    await Promise.all(ordered.map((p, i) => persistOrderGroup(p.id, { order: i })));
    await refreshProjectMeta();
    await refreshProjects();
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

  // Filter submissions by search input
  const filteredSubmissions = submissions.filter(sub => {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

      {/* Settings column */}
      <div className="col-span-1 space-y-8">

        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-none">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-white">Portada de Inicio</h2>
          </div>

          <form onSubmit={handleSaveHomeAppearance} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                Título Principal
              </label>
              <input
                type="text"
                required
                value={homeTitle}
                onChange={(e) => setHomeTitle(e.target.value)}
                maxLength={140}
                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide">
                  Tamaño del Título
                </label>
                <span className="text-[11px] font-mono text-white/45">{homeTitleSize}px</span>
              </div>
              <input
                type="range"
                min={36}
                max={96}
                step={1}
                value={homeTitleSize}
                onChange={(e) => setHomeTitleSize(Number(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
              <p className="text-[10px] text-white/30 mt-1">
                Ajusta el tamaño del título principal de la portada.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                Mensaje Central
              </label>
              <textarea
                rows={4}
                required
                value={homeMessage}
                onChange={(e) => setHomeMessage(e.target.value)}
                maxLength={400}
                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all resize-y"
              />
              <p className="text-[10px] text-white/30 mt-1">
                Usa Enter para hacer saltos de línea y mostrarlos más abajo en la portada.
              </p>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wide">
                  Color de Fondo de la Portada
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={homeBgColor || "#050505"}
                  onChange={(e) => setHomeBgColor(e.target.value)}
                  className="w-9 h-9 cursor-pointer bg-transparent border border-white/10 p-0.5 rounded-lg"
                />
                <input
                  type="text"
                  value={homeBgColor}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#?[0-9a-fA-F]{0,6}$/.test(value)) {
                      setHomeBgColor(value.startsWith("#") || value === "" ? value : `#${value}`);
                    }
                  }}
                  maxLength={7}
                  className="flex-1 px-2.5 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs font-mono text-white focus:border-white/30 focus:outline-none transition-all"
                />
                <div className="w-9 h-9 shrink-0 rounded-lg border border-white/10" style={{ background: homeBgColor || "#050505" }} />
              </div>
            </div>

            <div className="border-t border-white/5 pt-4 space-y-3">
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide">
                Icono de la Portada
              </label>
              <input
                type="text"
                placeholder="Buscar icono..."
                value={homeIconSearch}
                onChange={(e) => setHomeIconSearch(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all"
              />
              <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
                {filteredHomeIcons.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHomeIcon(key)}
                    className={`h-11 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${homeIcon === key ? "border-white bg-white/10 text-white" : "border-white/10 bg-[#0d0d0d] text-white/55 hover:text-white hover:border-white/25"}`}
                    title={key}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {homeAppearanceMessage && (
              <div className={`p-3 rounded-xl text-xs flex gap-2 items-center ${homeAppearanceMessage.type === "success" ? "bg-emerald-950/30 border border-emerald-900/40 text-emerald-300" : "bg-red-950/30 border border-red-900/50 text-red-300"}`}>
                {homeAppearanceMessage.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{homeAppearanceMessage.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingHomeAppearance}
              className="w-full h-[46px] font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden"
              style={{ '--btn-color': "var(--accent, #f5f011)" } as React.CSSProperties}
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
                {isSavingHomeAppearance ? "Guardando..." : "Guardar portada"}
              </span>
            </button>
          </form>
        </div>

        {/* Project Custom Copywriting */}
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-none">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-white/5 text-white rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Personalizar Textos</h2>
              <p className="text-xs text-white/40">Configura el copywriting de cada proyecto</p>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-6 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
              <p className="text-xs text-white/40 leading-relaxed">Crea al menos un proyecto/carpeta para poder personalizar sus textos de bienvenida.</p>
            </div>
          ) : (
            <form onSubmit={handleSaveMeta} className="space-y-4">
              <div className="mb-2 p-2.5 bg-white/5 text-[11px] font-semibold text-white bg-[#0d0d0d] rounded-xl border border-white/5 flex items-center justify-between select-none">
                <span className="text-white/40 uppercase tracking-widest text-[9px]">Editando textos de:</span>
                <span className="text-white font-bold truncate max-w-[180px]" title={projects.find(p => p.id === selectedMetaProjectId)?.name || ""}>
                  {projects.find(p => p.id === selectedMetaProjectId)?.name || "Ninguno"}
                </span>
              </div>

              {(() => {
                const selectedProject = projects.find(p => p.id === selectedMetaProjectId);
                if (!selectedProject) return null;
                const landingSlug = normalizeString(selectedProject.name);
                const directUrl = `${window.location.origin}/${landingSlug}`;

                const handleCopyLink = () => {
                  navigator.clipboard.writeText(directUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                };

                return (
                  <div className="bg-[#0a0a0a] rounded-xl p-3.5 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                        <Link className="w-3 h-3 text-purple-400" /> Acceso Directo y QR
                      </span>
                      {copiedLink ? (
                        <span className="text-[10px] text-emerald-400 font-semibold animate-pulse bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/30">
                          ┬íCopiado!
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 flex-1 select-all font-mono text-xs text-white truncate">
                        {directUrl}
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center shrink-0"
                        title="Copiar URL Completa"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <a
                        href={directUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-white transition-colors flex items-center justify-center cursor-pointer shrink-0"
                        title="Abrir en nueva pesta├▒a"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="flex items-start gap-3 bg-white/5 p-2.5 rounded-lg border border-white/5">
                      <div className="bg-white p-1 rounded shrink-0 self-center">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(directUrl)}`}
                          alt="C├│digo QR"
                          className="w-[72px] h-[72px]"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white flex items-center gap-1">
                          <QrCode className="w-3 h-3 text-emerald-400" /> QR del Proyecto
                        </p>
                        <p className="text-[9px] text-white/40 mt-0.5 leading-relaxed">
                          Escanea o haz clic abajo para descargar una versi├│n imprimible del QR.
                        </p>
                        <a
                          href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(directUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[9px] text-blue-400 hover:text-blue-300 hover:underline mt-1 font-semibold"
                        >
                          <Download className="w-2.5 h-2.5" /> Descargar QR Imprimible
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  T├¡tulo de Bienvenida
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
                  Descripci├│n / P├írrafo
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
                  Sin base de datos: cada env├¡o crea un toggle por persona (modo actual). Con base de datos: cada env├¡o se guarda como fila en una tabla de Notion y puedes calificar.
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
                        Ej: Nota, Estado, Comentarios. Nombre, Correo, Fecha y Archivos se a├▒aden autom├íticamente.
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
                            <option value="number">N├║mero</option>
                            <option value="select">Selecci├│n</option>
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
                        <span className="text-[10px] text-amber-400/80">A├║n no se ha creado la base de datos.</span>
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

              {/* Parent group selector (point 7) */}
              <div className="border-t border-white/5 pt-4">
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Grupo / Materia (contenedor)
                </label>
                <select
                  value={copyGroupId}
                  onChange={(e) => setCopyGroupId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all cursor-pointer"
                >
                  <option value="">Sin grupo (suelto)</option>
                  {projects
                    .filter((p) => p.id !== selectedMetaProjectId)
                    .map((p) => (
                      <option key={p.id} value={p.id} className="bg-[#111] text-white">
                        {p.name}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-white/30 mt-1">
                  Agrupa este proyecto dentro de otro (ej. una materia) para organizarlo. El orden se ajusta arrastrando en la lista de proyectos.
                </p>
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

              {/* Solid background color */}
              <div className="border-t border-white/5 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wide">
                    Color de Fondo Sólido
                  </label>
                  {copyBgColor && (
                    <button
                      type="button"
                      onClick={() => setCopyBgColor("")}
                      className="text-[10px] text-red-400 hover:underline cursor-pointer"
                    >
                      Quitar color
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-white/30 mb-2.5">
                  El texto, los inputs y los campos de entrega se adaptan de forma inteligente al fondo (claro u oscuro).
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={copyBgColor || "#f5f011"}
                    onChange={(e) => setCopyBgColor(e.target.value)}
                    className="w-9 h-9 cursor-pointer bg-transparent border border-white/10 p-0.5 rounded-lg"
                    title="Elegir color de fondo"
                  />
                  <input
                    type="text"
                    value={copyBgColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
                        setCopyBgColor(v.startsWith("#") || v === "" ? v : "#" + v);
                      }
                    }}
                    maxLength={7}
                    placeholder="#f5f011"
                    className="flex-1 px-2.5 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs font-mono text-white focus:border-white/30 focus:outline-none transition-all"
                  />
                  {copyBgColor && (
                    <div
                      className="w-9 h-9 shrink-0 rounded-lg border border-white/10"
                      style={{ background: copyBgColor }}
                    />
                  )}
                </div>
                {!copyBgColor && (
                  <p className="text-[10px] text-white/30 mt-2">
                    Este proyecto no tiene un color guardado todavía. El selector muestra un color temporal hasta que elijas uno y guardes.
                  </p>
                )}
                {/* Quick color presets */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {["#f5f011", "#ffffff", "#f0f0f0", "#111111", "#0a0a0a", "#ff3b30", "#ff9500", "#34c759", "#007aff", "#af52de", "#ff2d55", "#e8d5b7"].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      onClick={() => setCopyBgColor(hex)}
                      className="w-6 h-6 rounded-md border transition-all hover:scale-110 shrink-0"
                      style={{
                        background: hex,
                        borderColor: copyBgColor === hex ? "white" : "rgba(255,255,255,0.15)",
                        outline: copyBgColor === hex ? "2px solid white" : "none",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Icon picker for the card corner box */}
              <div className="border-t border-white/5 pt-4">
                <label className="block text-xs font-semibold text-white/40 mb-2 uppercase tracking-wide">
                  Icono del Proyecto
                </label>
                <p className="text-[10px] text-white/30 mb-2.5">
                  Se muestra en la esquina superior derecha y flota como partículas en el fondo.
                </p>

                {/* Selected preview + search input */}
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const found = ICON_OPTIONS.find(o => o.key === copyIcon);
                    const SelectedIcon = found?.Icon ?? UploadCloud;
                    return (
                      <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white">
                        <SelectedIcon className="w-5 h-5" />
                      </div>
                    );
                  })()}
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-white/30" />
                    <input
                      type="text"
                      placeholder="Buscar icono..."
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white placeholder-white/20 transition-all"
                    />
                  </div>
                </div>

                {/* Scrollable grid */}
                <div className="overflow-y-auto max-h-48 rounded-xl border border-white/5 bg-[#0a0a0a] p-1.5">
                  {(() => {
                    const query = iconSearch.toLowerCase();
                    const filtered = ICON_OPTIONS.filter(
                      ({ key, label, cat }) =>
                        !query ||
                        label.toLowerCase().includes(query) ||
                        key.toLowerCase().includes(query) ||
                        cat.toLowerCase().includes(query)
                    );
                    if (filtered.length === 0) {
                      return (
                        <p className="text-[10px] text-white/30 text-center py-4">Sin resultados para "{iconSearch}"</p>
                      );
                    }
                    return (
                      <div className="grid grid-cols-7 gap-1">
                        {filtered.map(({ key, Icon, label }) => (
                          <button
                            key={key}
                            type="button"
                            title={label}
                            onClick={() => setCopyIcon(key)}
                            className={`flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-lg border transition-all cursor-pointer ${
                              copyIcon === key
                                ? "bg-white/15 border-white/40 text-white"
                                : "bg-transparent border-transparent text-white/40 hover:border-white/15 hover:text-white/70 hover:bg-white/5"
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="text-[7px] font-semibold truncate w-full text-center leading-tight">{label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
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
                  '--btn-color': copyBgColor ? copyBgColor : "var(--accent, #f5f011)"
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
                  {isSavingMeta ? "Guardando..." : "Guardar Textos"}
                </span>
              </button>
            </form>
          )}
        </div>

      </div>

      {/* Projects and creations column */}
      <div className="col-span-1 lg:col-span-2 space-y-8">

        {/* Project creator Section */}
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-none">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/5 text-white rounded-xl">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Proyectos / Carpetas</h2>
                <p className="text-xs text-white/40">P├íginas de sub-carpeta en tu Notion</p>
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
                '--btn-color': copyBgColor ? copyBgColor : "var(--accent, #f5f011)"
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
              <p className="text-sm text-white/40">Ning├║n proyecto creado a├║n en esta p├ígina matriz.</p>
              <p className="text-xs text-white/20 mt-1">Crea tu primer proyecto utilizando el formulario superior.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
              {orderedProjects.map((proj, position) => (
                <div
                  key={proj.id}
                  draggable
                  onDragStart={() => setDragId(proj.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropReorder(proj.id)}
                  onClick={() => setSelectedMetaProjectId(proj.id)}
                  className={`p-3 border rounded-xl flex items-center justify-between transition-all cursor-pointer group animate-fade-in ${dragId === proj.id ? "opacity-40 border-dashed" : ""
                    } ${proj.id === selectedMetaProjectId
                      ? "border-white/30 bg-white/5"
                      : proj.isActive !== false
                        ? "border-white/5 bg-[#0d0d0d] hover:border-white/12"
                        : "border-dashed border-red-900/40 bg-red-950/5 hover:border-red-900/60"
                    }`}
                  title="Arrastra para reordenar ΓÇó Clic para personalizar"
                >
                  <div className="flex items-center gap-1 shrink-0 text-white/20 group-hover:text-white/40" title="Arrastrar para reordenar">
                    <GripVertical className="w-4 h-4" />
                    <span className="text-[10px] font-mono font-bold text-white/40 w-5 text-center">{position + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1 px-2">
                    <p className="text-sm font-semibold text-white/95 truncate flex items-center gap-1.5">
                      {proj.groupId && (
                        <span className="text-[9px] text-purple-300 bg-purple-950/30 border border-purple-900/30 px-1 py-[1px] rounded" title="Pertenece a un grupo">
                          {groupsMap[proj.groupId]?.name || "Grupo"}
                        </span>
                      )}
                      {projectMeta[proj.id]?.useDatabase && (
                        <Database className="w-3 h-3 text-emerald-400 shrink-0" />
                      )}
                      {proj.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/40 font-mono">
                        {getSubmissionsCountForProject(proj.id)} entregas
                      </span>

                      {formatExpiration(projectMeta[proj.id]?.expirationDate) && (
                        <span
                          className="text-[9px] text-amber-300 font-medium px-1.5 py-[1px] bg-amber-950/30 border border-amber-900/30 rounded-sm flex items-center gap-1"
                          title="Fecha de vencimiento"
                        >
                          <Calendar className="w-2.5 h-2.5 shrink-0" />
                          {formatExpiration(projectMeta[proj.id]?.expirationDate)}
                        </span>
                      )}

                      <span className="text-[10px] text-purple-400 hover:text-purple-300 font-mono truncate select-all flex items-center gap-0.5" title="Enlace directo p├║blico para entregas">
                        <Link className="w-2.5 h-2.5 shrink-0" />
                        /{normalizeString(proj.name)}
                      </span>

                      {proj.isActive === false ? (
                        <span className="text-[9px] text-red-400 font-sans font-medium px-1.5 py-[1px] bg-red-950/40 border border-red-900/40 rounded-sm">
                          Inactivo
                        </span>
                      ) : (
                        <span className="text-[9px] text-emerald-400 font-sans font-medium px-1.5 py-[1px] bg-emerald-950/40 border border-emerald-950/40 rounded-sm">
                          Activo
                        </span>
                      )}

                      {proj.id === selectedMetaProjectId && (
                        <span className="text-[9px] text-[#22c55e] font-sans font-medium px-1.5 py-[1px] bg-emerald-950/30 border border-emerald-900/40 rounded-sm">
                          Editando
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Direct activation toggle switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleProjectActive(proj.id, proj.isActive !== false)}
                      className={`p-1.5 border rounded-lg transition-all cursor-pointer flex items-center justify-center ${proj.isActive !== false
                          ? "text-emerald-400 hover:text-emerald-350 bg-emerald-950/20 border-emerald-900/20 hover:border-emerald-700/40"
                          : "text-white/20 hover:text-white bg-white/5 border-white/5 hover:bg-white/10"
                        }`}
                      title={proj.isActive !== false ? "Proyecto Activo (Pulsa para desactivar)" : "Proyecto Desactivado (Pulsa para activar)"}
                    >
                      {proj.isActive !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    {proj.url && (
                      <a
                        href={proj.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-white/40 hover:text-white bg-white/5 border border-white/10 rounded-lg transition-colors"
                        title="Abrir en Notion"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(proj.id, proj.name)}
                      disabled={isDeletingProjectId === proj.id}
                      className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 hover:border-red-900/20 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                      title="Eliminar Proyecto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grading table per project (point 9) */}
        {selectedMetaProjectId && projects.find((p) => p.id === selectedMetaProjectId) && (
          <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-none">
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

        {/* Deliveries Submission Log */}
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-none">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/5 text-white rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Historial de Entregas</h2>
                <p className="text-xs text-white/40">Hist├│rico de transferencias registradas</p>
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
              <p className="text-sm text-white/40">Cargando hist├│rico...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="text-center py-10 bg-[#0d0d0d]/35 rounded-2xl border border-dashed border-white/5">
              <p className="text-sm text-white/40">No se encontraron entregas en la plataforma.</p>
              <p className="text-xs text-white/20 mt-1">Env├¡a tus primeros archivos usando la interfaz principal.</p>
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
                    <div className="text-right">
                      <span className="inline-block bg-white/5 text-white/70 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-white/5 select-none">
                        Proyecto: {sub.projectName}
                      </span>
                      <p className="text-[10px] text-white/35 mt-1 flex items-center justify-end gap-1 font-mono">
                        <Calendar className="w-3 h-3" /> {new Date(sub.timestamp).toLocaleString()}
                      </p>
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

      </div>

    </div>
  );
}
