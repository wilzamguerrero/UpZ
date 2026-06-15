import React, { useState, useEffect } from "react";
import {
  ShieldCheck, Mail, User, ListFilter, Send,
  CheckCircle2, Loader2, ArrowRight, Settings2, RefreshCcw, AlertTriangle, Clock, EyeOff, AlertCircle, UploadCloud,
  FileText, BookOpen, Code2, Palette, Microscope, GraduationCap, Briefcase,
  Star, Zap, Globe, Music, Camera, Cpu, Layers, Award, Package, Rocket,
  File, Folder, FolderOpen, Archive, Terminal, Server, Wifi, Monitor, Laptop, Smartphone,
  HardDrive, Keyboard, Image, Film, Video, Headphones, Mic, Radio, Tv,
  Sun, Moon, Cloud, Leaf, Mountain, Flower2, Snowflake, Flame,
  Activity, Dumbbell, Trophy, Target, Heart, Bell, Phone, Users,
  MessageCircle, Share2, ShoppingCart, Truck, Building2, Wallet, CreditCard,
  Wrench, Hammer, Settings, Calculator, Ruler, PencilLine, Scissors,
  Hexagon, Hash, Percent, FlaskConical, Atom, Compass,
  Gamepad2, Newspaper, Map, Lightbulb, Wand2, Sparkles, Brain,
  Lock, Shield, Fingerprint, Bug,
  TrendingUp, BarChart3, Sigma, FunctionSquare,
  Download,
  type LucideIcon
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  UploadCloud, FileText, BookOpen, Code2, Palette, Microscope,
  GraduationCap, Briefcase, Star, Zap, Globe, Music, Camera, Cpu, Layers, Award, Package, Rocket,
  File, Folder, FolderOpen, Archive, Terminal, Server, Wifi, Monitor, Laptop, Smartphone,
  HardDrive, Keyboard, Image, Film, Video, Headphones, Mic, Radio, Tv,
  Sun, Moon, Cloud, Leaf, Mountain, Flower2, Snowflake, Flame,
  Activity, Dumbbell, Trophy, Target, Heart, Bell, Phone, Users,
  MessageCircle, Share2, ShoppingCart, Truck, Building2, Wallet, CreditCard,
  Wrench, Hammer, Settings, Calculator, Ruler, PencilLine, Scissors,
  Hexagon, Hash, Percent, FlaskConical, Atom, Compass,
  Gamepad2, Newspaper, Map, Lightbulb, Wand2, Sparkles, Brain,
  Lock, Shield, Fingerprint, Bug,
  TrendingUp, BarChart3, Sigma, FunctionSquare,
  Download, Mail, User,
};
import { Project, ProjectMeta } from "./types";
import Dropzone from "./components/Dropzone";
import AdminPanel from "./components/AdminPanel";
import AppLoader from "./components/AppLoader";
import { ScrambleReveal } from "./components/ScrambleText";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "./ThemeContext";

const normalizeString = (s: string) => {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "-") // replace non-alphanumeric with dashes
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const getCachedProjectMeta = (): Record<string, ProjectMeta> => {
  try {
    const cached = localStorage.getItem("cached_project_meta");
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const getCachedProjects = (): Project[] => {
  try {
    const cached = localStorage.getItem("cached_projects");
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
};

const getCurrentPathSlug = (): string => {
  return window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
};

const getCachedSelectedProjectId = (): string => {
  try {
    const cleanPath = getCurrentPathSlug();
    if (!cleanPath || cleanPath.toLowerCase() === "admin") {
      return "";
    }
    return localStorage.getItem("cached_selected_project_id") || "";
  } catch {
    return "";
  }
};

export default function App() {
  const { isLoaded: themeLoaded, appearance } = useTheme();
  const currentPathSlug = getCurrentPathSlug();
  const isRootLandingPath = !currentPathSlug || currentPathSlug.toLowerCase() === "admin";

  const persistProjectMetaCache = (meta: Record<string, ProjectMeta>) => {
    try {
      localStorage.setItem("cached_project_meta", JSON.stringify(meta));
    } catch (err) {
      console.error("Localstorage cache write issue", err);
    }
  };

  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  // Extra flag: loader stays until the selected project's meta has been resolved at least once
  const [isMetaSettled, setIsMetaSettled] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "admin">("upload");
  const [projects, setProjects] = useState<Project[]>(getCachedProjects);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isProjectLocked, setIsProjectLocked] = useState(false);
  const [lockedProjectName, setLockedProjectName] = useState("");

  // App Config Info
  const [config, setConfig] = useState<{
    isConfigured: boolean;
    hasSecret: boolean;
    hasParentId: boolean;
    parentPageId: string;
    maskedSecret: string;
  } | null>(null);

  // Project meta copywriting customization
  const [projectMeta, setProjectMeta] = useState<Record<string, ProjectMeta>>(getCachedProjectMeta);

  const applyProjectMetaUpdate = (projectId: string, metaPatch: ProjectMeta) => {
    setProjectMeta((prev: Record<string, ProjectMeta>) => {
      const next = {
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          ...metaPatch,
        },
      };
      persistProjectMetaCache(next);
      return next;
    });
  };

  // Admin dynamic authentication states
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Form states
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(getCachedSelectedProjectId);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Submit engine states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<any | null>(null);

  // Background visual customization states
  const [dominantColor, setDominantColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [adminPreview, setAdminPreview] = useState<{
    projectId: string;
    bgColor: string;
    backgroundImage: string;
    bgBlur: number;
  } | null>(null);

  // Load configuration, projects and copy text meta
  useEffect(() => {
    const initApp = async () => {
      const cleanPath = getCurrentPathSlug();
      if (cleanPath.toLowerCase() === "admin") {
        setActiveTab("admin");
      }
      try {
        await Promise.all([
          fetchConfig(),
          fetchProjectMeta()
        ]);
      } catch (e) {
        console.error("Error during initial app boot:", e);
      } finally {
        setIsInitialLoadDone(true);
      }
    };
    initApp();
  }, []);

  // Once initial load is done + we have a project + its meta is known → mark settled
  // A short additional delay lets the background color transition paint before fading the loader
  useEffect(() => {
    if (!isInitialLoadDone) return;
    // If we have a selected project and its meta color is known, give 120ms for the bg to paint
    // If no project / no color configured, settle immediately
    const hasMeta = !!(selectedProjectId && projectMeta[selectedProjectId]);
    const delay = hasMeta ? 120 : 0;
    const t = setTimeout(() => setIsMetaSettled(true), delay);
    return () => clearTimeout(t);
  }, [isInitialLoadDone, selectedProjectId, projectMeta]);

  const fetchProjectMeta = async (projectId?: string) => {
    if (projectId) {
      await fetchProjectMetaForProject(projectId);
      return;
    }

    try {
      const res = await fetch("/api/project-meta");
      const data = await res.json();
      if (data.success) {
        setProjectMeta(data.meta || {});
        persistProjectMetaCache(data.meta || {});
      }
    } catch (e) {
      console.error("Error setting up project meta details", e);
    }
  };

  // Fetch specific project metadata and expiration date on selection in real-time
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectMetaForProject(selectedProjectId);
      try {
        localStorage.setItem("cached_selected_project_id", selectedProjectId);
      } catch (err) {
        console.error("Localstorage save selectedProjectId issue", err);
      }
    } else {
      try {
        localStorage.removeItem("cached_selected_project_id");
      } catch (err) {
        console.error("Localstorage clear selectedProjectId issue", err);
      }
    }
  }, [selectedProjectId]);

  // Extract dominant color from background image for adaptive UI theming
  useEffect(() => {
    const bgImage = projectMeta[selectedProjectId]?.backgroundImage || null;
    if (!bgImage) {
      setDominantColor(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 60;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        // Boost saturation so the extracted color is more vibrant
        const avg = (r + g + b) / 3;
        const boost = 1.9;
        r = Math.min(255, Math.max(0, Math.round(avg + (r - avg) * boost)));
        g = Math.min(255, Math.max(0, Math.round(avg + (g - avg) * boost)));
        b = Math.min(255, Math.max(0, Math.round(avg + (b - avg) * boost)));
        setDominantColor({ r, g, b });
      } catch {
        setDominantColor(null);
      }
    };
    img.onerror = () => setDominantColor(null);
    img.src = bgImage;
  }, [selectedProjectId, projectMeta]);

  const fetchProjectMetaForProject = async (projId: string) => {
    try {
      const res = await fetch(`/api/project-meta?projectId=${projId}`);
      const data = await res.json();
      if (data.success && data.meta) {
        const existing = projectMeta[projId] || {};
        applyProjectMetaUpdate(projId, {
          ...existing,
          ...data.meta,
          // Never overwrite existing non-empty values with empty ones from Notion
          icon: data.meta.icon || existing.icon || "",
          bgColor: data.meta.bgColor || existing.bgColor || "",
          bgBlur: data.meta.bgBlur != null ? data.meta.bgBlur : (existing.bgBlur ?? 0),
        });
      }
    } catch (e) {
      console.error("Error fetching dynamic project meta", e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.success) {
        setConfig(data);
        if (data.isConfigured) {
          await fetchProjects();
        }
      }
    } catch (e) {
      console.error("Error setting up app config state", e);
    }
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
        try {
          localStorage.setItem("cached_projects", JSON.stringify(data.projects));
        } catch (err) {
          console.error("Localstorage save projects issue", err);
        }

        // Resolve path url matching
        const cleanPath = getCurrentPathSlug();
        if (cleanPath && cleanPath.toLowerCase() !== "admin") {
          const match = data.projects.find((p: Project) => {
            const matchesId = p.id.toLowerCase() === cleanPath.toLowerCase() || p.id.replace(/-/g, "").toLowerCase() === cleanPath.toLowerCase();
            const matchesSlug = normalizeString(p.name) === normalizeString(decodeURIComponent(cleanPath));
            return matchesId || matchesSlug;
          });

          if (match) {
            setSelectedProjectId(match.id);
            setLockedProjectName(match.name);
            setIsProjectLocked(true);
            return;
          }

          setSelectedProjectId("");
          setLockedProjectName("");
          setIsProjectLocked(false);
          return;
        }

        setSelectedProjectId("");
        setLockedProjectName("");
        setIsProjectLocked(false);

        if (data.projects.length > 0 && !isRootLandingPath) {
          // Only change selection if current one is not in the list (avoids triggering
          // fetchProjectMetaForProject unnecessarily and overwriting freshly saved data)
          const isCurrentValid = selectedProjectId && data.projects.some((p: any) => p.id === selectedProjectId);
          if (!isCurrentValid) {
            const activeProjects = data.projects.filter((p: any) => p.isActive !== false);
            if (activeProjects.length > 0) {
              setSelectedProjectId(activeProjects[0].id);
            } else {
              setSelectedProjectId(data.projects[0].id);
            }
          }
        }
      } else {
        setProjects([]);
      }
    } catch (e) {
      console.error("Error listing projects", e);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleFilesAdded = (newFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileRemoved = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  // ─── Upload progress state ───
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);

  // 8 MiB chunks — safely under Cloudflare's 100 MB request body limit even with
  // multipart/form-data overhead, and within Notion's 5–20 MB per-part range.
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024; // 20 MiB
  const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (Notion limit)

  // Extensions accepted by Notion's File Upload API (mirrors server-side NOTION_MIME_TYPES)
  const NOTION_SUPPORTED_EXTENSIONS = new Set([
    // Archives
    "zip", "gz", "gzip", "tar", "7z", "bz2", "rar",
    // Images
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "tif", "ico", "heic", "avif", "apng",
    // Audio
    "aac", "adts", "mid", "midi", "mp3", "mpga", "m4a", "m4b", "oga", "ogg", "opus", "wav", "wma", "weba", "flac",
    // Video
    "amv", "asf", "wmv", "avi", "f4v", "flv", "gifv", "m4v", "mp4", "mkv", "webm", "mov", "qt", "mpeg", "ogv", "3gp", "3g2",
    // Documents
    "pdf", "txt", "csv", "json", "doc", "dot", "docx", "dotx", "xls", "xlt", "xla", "xlsx", "xltx",
    "ppt", "pot", "pps", "ppa", "pptx", "potx", "rtf", "md", "markdown", "html", "htm", "epub", "xml", "css",
    "odt", "ods", "odp", "ics", "yaml", "yml", "tsv",
  ]);

  /** Check if a file needs to be compressed to ZIP for Notion compatibility */
  const needsZipCompression = (filename: string): boolean => {
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex === -1) return true; // no extension
    const ext = filename.slice(dotIndex + 1).toLowerCase();
    return !NOTION_SUPPORTED_EXTENSIONS.has(ext);
  };

  /** Compress a file into a real ZIP using JSZip */
  const compressFileToZip = async (file: File): Promise<File> => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(file.name, file);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new File([blob], file.name + ".zip", { type: "application/zip" });
  };

  /**
   * Upload a single file to Notion.
   * - Unsupported extensions → compressed to real ZIP first
   * - Files ≤ 20MB: single request to /api/upload-file
   * - Files > 20MB: chunked flow (init → parts → complete)
   */
  const uploadOneFile = async (
    file: File,
    fileIndex: number,
    totalFiles: number
  ): Promise<{
    name: string; finalName: string; size: number;
    uploadId: string; extModified: boolean; mimeType: string;
  }> => {
    const originalName = file.name;
    const label = `${originalName} (${fileIndex + 1}/${totalFiles})`;

    // ── Validate file size ──
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`"${originalName}" excede el límite de 5 GB.`);
    }

    // ── Compress unsupported file types to real ZIP ──
    let uploadFile = file;
    let wasCompressed = false;
    if (needsZipCompression(file.name)) {
      setSubmitStep(`Comprimiendo ${label} a ZIP...`);
      setUploadProgress({ fileName: originalName, percent: 0 });
      uploadFile = await compressFileToZip(file);
      wasCompressed = true;
    }

    // ── Small file: existing single-request flow ──
    if (uploadFile.size <= SMALL_FILE_THRESHOLD) {
      setSubmitStep(`Subiendo ${label}...`);
      setUploadProgress({ fileName: originalName, percent: 0 });

      const fd = new FormData();
      fd.append("file", uploadFile, uploadFile.name);
      const res = await fetch("/api/upload-file", { method: "POST", body: fd });

      // Guard against Cloudflare returning HTML (e.g. body too large)
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        throw new Error(`Respuesta inesperada del servidor al subir "${originalName}". Puede que el archivo sea demasiado grande.`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Error al subir "${originalName}"`);
      }

      setUploadProgress({ fileName: originalName, percent: 100 });

      return {
        name: originalName,
        finalName: data.finalName as string,
        size: file.size, // original size for display
        uploadId: data.id as string,
        extModified: wasCompressed || (data.extModified as boolean),
        mimeType: file.type || "application/octet-stream",
      };
    }

    // ── Large file: chunked flow ──
    const numberOfParts = Math.ceil(uploadFile.size / CHUNK_SIZE);

    // Step 1: Initialize the upload on Notion
    setSubmitStep(`Inicializando ${label} (${numberOfParts} partes)...`);
    setUploadProgress({ fileName: originalName, percent: 0 });

    const initRes = await fetch("/api/upload-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: uploadFile.name,
        mimeType: uploadFile.type,
        fileSize: uploadFile.size,
      }),
    });
    const initData = await initRes.json();
    if (!initRes.ok || !initData.success) {
      throw new Error(initData.error || `Error al inicializar upload de "${originalName}"`);
    }

    const { id: uploadId, uploadName, contentType, mode, uploadUrl, completeUrl } = initData;

    // Step 2: Send each chunk directly to Notion using the pre-signed upload_url.
    // Notion returns this URL pointing to their S3 bucket which has CORS configured.
    // This bypasses Cloudflare entirely — no CPU/memory/body-size limits to worry about.
    // Local dev falls back to the proxy because localhost can't reach Notion's S3 directly
    // (CORS preflight fails for file:// or non-https origins).
    const isLocalDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const directUploadUrl = !isLocalDev && uploadUrl ? uploadUrl : null;

    for (let partNumber = 1; partNumber <= numberOfParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, uploadFile.size);
      const chunk = uploadFile.slice(start, end);

      const pct = Math.round(((partNumber - 1) / numberOfParts) * 100);
      setSubmitStep(`Subiendo ${label} — parte ${partNumber}/${numberOfParts} (${pct}%)`);
      setUploadProgress({ fileName: originalName, percent: pct });

      if (directUploadUrl) {
        // Direct upload to Notion's S3 — no proxy, no limits.
        const fd = new FormData();
        if (mode === "multi_part") {
          fd.append("part_number", String(partNumber));
        }
        fd.append("file", chunk, uploadName);

        const partRes = await fetch(directUploadUrl, { method: "POST", body: fd });
        if (!partRes.ok) {
          const errText = await partRes.text();
          let msg = errText;
          try { msg = JSON.parse(errText).message || errText; } catch {}
          throw new Error(`Error en parte ${partNumber} de "${originalName}": ${msg}`);
        }
      } else {
        // Local dev: proxy through Express (avoids CORS).
        const headers: Record<string, string> = {
          "Content-Type": contentType || "application/octet-stream",
          "X-Upload-Id": uploadId,
          "X-Content-Type": contentType || "application/octet-stream",
          "X-Upload-Name": uploadName,
        };
        if (mode === "multi_part") {
          headers["X-Part-Number"] = String(partNumber);
        }

        const partRes = await fetch("/api/upload-part", {
          method: "POST",
          headers,
          body: chunk,
        });
        const partText = await partRes.text();
        let partData: any;
        try { partData = JSON.parse(partText); } catch {
          throw new Error(`Respuesta inesperada al subir parte ${partNumber} de "${originalName}".`);
        }
        if (!partRes.ok || !partData.success) {
          throw new Error(partData.error || `Error en parte ${partNumber} de "${originalName}"`);
        }
      }
    }

    // Step 3: Complete the multi-part upload
    if (mode === "multi_part") {
      setSubmitStep(`Finalizando ${label}...`);
      setUploadProgress({ fileName: originalName, percent: 99 });

      // Use Notion's complete_url directly if available (production), otherwise proxy.
      const completeEndpoint = completeUrl && !isLocalDev
        ? completeUrl
        : "/api/upload-complete";

      const completeRes = await fetch(completeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok || !completeData.success) {
        throw new Error(completeData.error || `Error al completar upload de "${originalName}"`);
      }
    }

    setUploadProgress({ fileName: originalName, percent: 100 });

    return {
      name: originalName,
      finalName: uploadName,
      size: file.size, // original size for display
      uploadId,
      extModified: wasCompressed || (initData.extModified || false),
      mimeType: file.type || "application/octet-stream",
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName || !senderEmail || !selectedProjectId || selectedFiles.length === 0) {
      setSubmitError("Por favor completa todos los campos y añade al menos un archivo.");
      return;
    }

    // Validate required submitter custom fields.
    const requiredAsk = (projectMeta[selectedProjectId]?.customFields || []).filter(
      (f) => f.askSubmitter && f.required
    );
    for (const f of requiredAsk) {
      if (!customValues[f.id] || !customValues[f.id].trim()) {
        setSubmitError(`El campo "${f.label || "obligatorio"}" es obligatorio.`);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    setUploadProgress(null);

    const chosenProj = projects.find(p => p.id === selectedProjectId);
    const projectName = chosenProj ? chosenProj.name : "";

    // Step 1: Upload each file (sequentially to avoid rate limits)
    const fileRecords: {
      name: string; finalName: string; size: number;
      uploadId: string; extModified: boolean; mimeType: string;
    }[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const record = await uploadOneFile(selectedFiles[i], i, selectedFiles.length);
        fileRecords.push(record);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Error al subir archivos.");
      setIsSubmitting(false);
      setSubmitStep("");
      setUploadProgress(null);
      return;
    }

    // Step 2: POST metadata + upload IDs to create the Notion toggle block
    setSubmitStep("Registrando en Notion...");
    setUploadProgress(null);
    try {
      const submitMeta = projectMeta[selectedProjectId];
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName,
          senderEmail,
          projectId: selectedProjectId,
          projectName,
          fileRecords,
          customValues,
          customFields: (submitMeta?.customFields || [])
            .filter((cf) => cf.askSubmitter)
            .map((cf) => ({ id: cf.id, label: cf.label })),
          useDatabase: !!submitMeta?.useDatabase,
          databaseId: submitMeta?.databaseId || "",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(data.submission);
        setSenderName("");
        setSenderEmail("");
        setSelectedFiles([]);
        setCustomValues({});
      } else {
        setSubmitError(data.error || "Algo salió mal al sincronizar.");
      }
    } catch {
      setSubmitError("Hubo un error de conexión con la red o el servidor.");
    } finally {
      setIsSubmitting(false);
      setSubmitStep("");
      setUploadProgress(null);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdminAuthenticated(true);
        setLoginError(null);
      } else {
        setLoginError(data.error || "La contraseña ingresada no coincide.");
      }
    } catch (err) {
      setLoginError("Error de comunicación de red al consultar contraseña. Verifica la conexión.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const renderStepText = (text: string) => {
    const parts = text.split(":");
    if (parts.length > 1) {
      return (
        <>
          <strong className="text-white/80">{parts[0]}:</strong>
          {parts.slice(1).join(":")}
        </>
      );
    }
    return text;
  };

  // Resolve active meta: if on admin tab, default to the adminPreview's projectId if present
  const activeProjectId = activeTab === "admin"
    ? (adminPreview?.projectId || selectedProjectId)
    : selectedProjectId;

  const isHomeUploadView = activeTab === "upload" && isRootLandingPath && !selectedProjectId && !isProjectLocked;
  const isRootExperience = isRootLandingPath && !selectedProjectId;

  const activeProjectName = activeProjectId
    ? (projects.find((project) => project.id === activeProjectId)?.name || "")
    : "";
  const activeMeta = activeProjectId ? projectMeta[activeProjectId] : null;

  /** Check if expiration date is a valid, non-empty date string */
  const hasValidExpiration = (() => {
    if (!activeMeta?.expirationDate || activeMeta.expirationDate.trim() === "") return false;
    const d = new Date(activeMeta.expirationDate);
    return !isNaN(d.getTime());
  })();

  const isProjectExpired = (() => {
    if (!hasValidExpiration) return false;
    const expDate = new Date(activeMeta!.expirationDate!);
    // If it is just a date (no T/time structure), include 23:59:59 of that day
    if (!activeMeta!.expirationDate!.includes("T")) {
      expDate.setHours(23, 59, 59, 999);
    }
    return new Date() > expDate;
  })();

  const hasLegacyProjectTitle = activeMeta?.title?.trim() === "Comparte tus archivos directo a Notion.";
  const hasLegacyProjectDescription = activeMeta?.description?.trim() === "Nuestra plataforma te permite arrastrar y soltar cualquier documento de manera instantánea. Tus archivos se organizan de forma automática bajo un indicador desplegable (Toggle List) personalizado con tus datos, directamente en la página del proyecto que elijas.";
  const HOME_TITLE = 'ENVI';
  const HOME_MESSAGE = 'ENVI agiliza la entrega de archivos por proyecto.\nDesarrollado por wilzamguerrero.';
  const displayTitle = isHomeUploadView
    ? HOME_TITLE
    : ((activeMeta?.title && !hasLegacyProjectTitle ? activeMeta.title : "") || activeProjectName || "ENVI");
  const displayDescription = isHomeUploadView
    ? HOME_MESSAGE
    : ((activeMeta?.description && !hasLegacyProjectDescription ? activeMeta.description : "") || `ENVI agiliza la entrega de archivos para ${activeProjectName || "este proyecto"}. Comparte este enlace para recibir archivos de forma rápida y ordenada.`);
  const displayCustomFields = activeMeta?.customFields || [];
  const infoFields = displayCustomFields.filter((f) => !f.askSubmitter);
  const askFields = displayCustomFields.filter((f) => f.askSubmitter);
  const activeIconKey = isRootExperience ? appearance.homeIcon : (activeMeta?.icon || "UploadCloud");

  // Read current visual properties supporting real-time preview editing in the admin panel
  const currentBgColor = activeTab === "admin" && adminPreview && adminPreview.projectId === activeProjectId
    ? adminPreview.bgColor
    : (isRootExperience ? appearance.homeBgColor : (activeMeta?.bgColor || ""));

  const hasBgColor = !!currentBgColor;

  // Adaptive text/field color for solid bgColor (light bg → dark text, dark bg → light text)
  const bgColorLuminance = (() => {
    if (!hasBgColor || !currentBgColor) return null;
    const hex = currentBgColor.replace('#', '').trim();
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
    } else {
      return null;
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  })();
  const bgColorIsLight = bgColorLuminance !== null && bgColorLuminance > 0.5;
  const adaptiveText = hasBgColor ? (bgColorIsLight ? '#111111' : '#f0f0f0') : undefined;
  const adaptiveFieldBg = hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)') : undefined;
  const adaptiveFieldBorder = hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)') : undefined;

  // Dynamically sync the document body background color for a perfect seamless layout
  useEffect(() => {
    if (hasBgColor && currentBgColor) {
      document.body.style.transition = 'background-color 0.5s ease';
      document.body.style.backgroundColor = currentBgColor;
    } else {
      document.body.style.transition = 'background-color 0.5s ease';
      document.body.style.backgroundColor = "";
    }
    return () => {
      document.body.style.backgroundColor = "";
      document.body.style.transition = "";
    };
  }, [hasBgColor, currentBgColor]);

  return (
    <>
      <AppLoader
        visible={!themeLoaded || !isInitialLoadDone || !isMetaSettled}
        bgColor={currentBgColor}
        isLight={bgColorIsLight}
        textColor={adaptiveText}
      />
      <div className={`min-h-screen flex flex-col antialiased relative transition-opacity duration-300 ${(!themeLoaded || !isInitialLoadDone || !isMetaSettled) ? 'opacity-0 pointer-events-none' : 'opacity-100 animate-fade-in'}`}
        data-adaptive={hasBgColor ? (bgColorIsLight ? "light" : "dark") : "dark"}
        data-has-bgcolor={hasBgColor ? "true" : "false"}
        style={{
          color: hasBgColor ? adaptiveText : 'var(--text-primary, #e0e0e0)',
          backgroundColor: hasBgColor ? currentBgColor : 'var(--app-bg, #050505)',
          transition: 'background-color 0.5s ease, color 0.4s ease',
        }}
      >

        {/* Solid background color layer */}
        {hasBgColor && (
          <div
            className="fixed inset-0 -z-50 pointer-events-none"
            style={{ backgroundColor: currentBgColor, transition: 'background-color 0.5s ease' }}
          />
        )}

        {/* Floating particles layer — renders between background and card content */}
        {activeTab === "upload" && (() => {
          const ParticleIcon = ICON_MAP[activeIconKey] ?? UploadCloud;
          const iconColor = bgColorIsLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)';
          return (
            <div
              className="particles-container"
              style={{
                '--particles-fade': currentBgColor || '#050505',
                transition: 'all 0.5s ease',
              } as React.CSSProperties}
            >
              <div className="squares">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="square icon-particle">
                    <ParticleIcon style={{ width: '100%', height: '100%', color: iconColor }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Dynamic Header Nav Bar — only visible on root, hidden on shared project URLs */}
        {isRootLandingPath && (
          <div className="fixed top-4 right-4 z-50 flex gap-1.5">
            {activeTab === "admin" && (
              <button
                id="tab-btn-upload"
                onClick={() => { setActiveTab("upload"); setAdminPreview(null); }}
                title="Volver"
                className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:bg-black/10"
                style={{ color: (hasBgColor && bgColorIsLight) ? '#111111' : 'rgba(255,255,255,0.6)' }}
              >
                <Send className="w-4 h-4" />
              </button>
            )}
            <button
              id="tab-btn-admin"
              onClick={() => setActiveTab("admin")}
              title="Administración"
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${activeTab === "admin"
                  ? "bg-black/20 backdrop-blur-sm"
                  : "hover:bg-black/10"
                }`}
              style={{ color: (hasBgColor && bgColorIsLight) ? '#111111' : 'rgba(255,255,255,0.6)' }}
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Primary Content Container */}
        <main className="flex-1 w-full mx-auto px-5 sm:px-8 pt-14 pb-10">

          <AnimatePresence mode="wait">
            {activeTab === "upload" ? (
              <motion.div
                key="upload-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col min-h-[calc(100vh-5rem)] justify-center py-8 max-w-2xl mx-auto w-full"
              >

                <div
                  className="adaptive-card relative z-[2] p-6 sm:p-8 backdrop-blur-xl"
                  data-adaptive={hasBgColor ? (bgColorIsLight ? "light" : "dark") : "dark"}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                    borderRadius: 'var(--card-radius)',
                    '--field-bg': hasBgColor ? adaptiveFieldBg : 'var(--field-bg-base, #0d0d0d)',
                    '--field-border': hasBgColor ? adaptiveFieldBorder : undefined,
                    color: hasBgColor ? adaptiveText : undefined,
                  } as React.CSSProperties}
                >
                  {isHomeUploadView ? (() => {
                    return (
                      <div className="min-h-[70vh] flex items-center justify-center text-center">
                        <div className="max-w-2xl mx-auto space-y-6 px-2">
                          <div className="space-y-3">
                            <h1
                              className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]"
                              style={{
                                color: adaptiveText || '#ffffff',
                                fontSize: 'clamp(2.25rem, 8vw, 56px)',
                              }}
                            >
                              <ScrambleReveal text={displayTitle} duration={900} delay={80} />
                            </h1>
                            <p
                              className="text-sm sm:text-base leading-relaxed max-w-xl mx-auto"
                              style={{
                                color: hasBgColor ? (bgColorIsLight ? 'rgba(17,17,17,0.72)' : 'rgba(255,255,255,0.7)') : 'rgba(255,255,255,0.7)',
                                whiteSpace: 'pre-line',
                              }}
                            >
                              {displayDescription}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })() : submitSuccess ? (
                    // Submission Success feedback View
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center py-8 space-y-6"
                    >
                      <div className="w-16 h-16 bg-emerald-950/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-900/50">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>

                      <div>
                        <h2 className="text-2xl font-bold text-white">¡Archivos Enviados!</h2>
                        <p className="text-xs text-white/40 mt-2">
                          Se ha creado tu Toggle List en Notion correctamente.
                        </p>
                      </div>

                      <div className="bg-[#0d0d0d] rounded-2xl p-5 text-left text-xs space-y-3.5 border border-white/5 max-w-md mx-auto">
                        <div className="flex justify-between">
                          <span className="text-white/40">Remitente:</span>
                          <span className="font-semibold text-slate-200">{submitSuccess.senderName} ({submitSuccess.senderEmail})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">Proyecto:</span>
                          <span className="font-semibold text-slate-200">{submitSuccess.projectName}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/5 pt-3">
                          <span className="text-white/40">Archivos totales:</span>
                          <span className="font-mono font-bold text-white">{submitSuccess.files.length}</span>
                        </div>
                        <div className="space-y-1.5 pt-1.5">
                          {submitSuccess.files.map((file: any, fIdx: number) => (
                            <div key={fIdx} className="flex justify-between text-[11px] text-white/50 bg-[#111111] p-2 rounded-lg border border-white/5">
                              <span className="truncate flex-1 pr-2">📎 {file.name}</span>
                              <span className="font-mono text-white/30">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        id="submit-another-btn"
                        onClick={() => setSubmitSuccess(null)}
                        className="h-[44px] px-6 font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden pointer-events-auto"
                        style={{
                          '--btn-color': hasBgColor ? currentBgColor : "var(--accent, #f5f011)"
                        } as React.CSSProperties}
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
                          Enviar más archivos
                        </span>
                      </button>
                    </motion.div>
                  ) : (
                    // Regular Transfer Form
                    <form onSubmit={handleSubmit} className="space-y-6">

                      {/* Header info inside card */}
                      <div className="space-y-3 pb-1 pr-10">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-[1.15]">
                          <ScrambleReveal text={displayTitle} duration={900} delay={80} />
                        </h2>
                        <p className="text-sm text-white/40 leading-relaxed">{displayDescription}</p>
                        {infoFields.length > 0 && (
                          <div className="border-t border-white/5 pt-3 space-y-3">
                            {infoFields.map((field, idx) => (
                              <div key={field.id} className="flex gap-3">
                                <span className="w-6 h-6 rounded-full bg-white/5 border border-white/10 text-white/60 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                                <p className="text-xs text-white/40">
                                  {field.label ? (
                                    <>
                                      <strong className="text-white/80">{field.label}:</strong> {field.value}
                                    </>
                                  ) : (
                                    field.value
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <hr className="border-white/5" />

                      <div className="space-y-4">
                        {hasValidExpiration && !isProjectExpired && activeMeta?.isActive !== false && (() => {
                          // Inline countdown — re-renders every second via state in parent is too heavy,
                          // so we use a small dedicated component
                          const ExpiryBadge = () => {
                            const [remaining, setRemaining] = React.useState(() => {
                              const exp = new Date(activeMeta.expirationDate!);
                              if (!activeMeta.expirationDate!.includes("T")) exp.setHours(23, 59, 59, 999);
                              return Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
                            });
                            React.useEffect(() => {
                              const id = setInterval(() => {
                                const exp = new Date(activeMeta.expirationDate!);
                                if (!activeMeta.expirationDate!.includes("T")) exp.setHours(23, 59, 59, 999);
                                setRemaining(Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000)));
                              }, 1000);
                              return () => clearInterval(id);
                            }, []);

                            const d = Math.floor(remaining / 86400);
                            const h = Math.floor((remaining % 86400) / 3600);
                            const m = Math.floor((remaining % 3600) / 60);
                            const s = remaining % 60;
                            const pad = (n: number) => String(n).padStart(2, "0");

                            const dateStr = new Date(activeMeta.expirationDate!).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              ...(activeMeta.expirationDate!.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}),
                            });

                            return (
                              <div className="border-2 border-dashed border-amber-400/40 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--accent, #f5f011)', opacity: 0.8 }}>
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>Disponible · {dateStr}</span>
                                </div>
                                <div className="flex items-center gap-3 font-mono font-bold text-2xl tabular-nums" style={{ color: 'var(--accent, #f5f011)' }}>
                                  {d > 0 && <span>{d}d</span>}
                                  <span>{pad(h)}h</span>
                                  <span className="opacity-40">:</span>
                                  <span>{pad(m)}m</span>
                                  <span className="opacity-40">:</span>
                                  <span>{pad(s)}s</span>
                                </div>
                              </div>
                            );
                          };
                          return <ExpiryBadge />;
                        })()}
                      </div>

                      {/* Client parameters input fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                            Tu Nombre
                          </label>
                          <div className="relative">
                            <User className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                            <input
                              type="text"
                              required
                              placeholder="Ej: Laura Castro"
                              value={senderName}
                              onChange={(e) => setSenderName(e.target.value)}
                              className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none placeholder-white/20 transition-all text-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                            Tu Correo
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                            <input
                              type="email"
                              required
                              placeholder="Ej: laura@empresa.com"
                              value={senderEmail}
                              onChange={(e) => setSenderEmail(e.target.value)}
                              className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none placeholder-white/20 transition-all text-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Submitter-filled custom fields (point 5C) */}
                      {askFields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {askFields.map((field) => (
                            <div key={field.id}>
                              <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                                {field.label || "Campo"}{field.required ? " *" : ""}
                              </label>
                              <input
                                type="text"
                                required={!!field.required}
                                placeholder={field.value || `Escribe ${field.label || "valor"}`}
                                value={customValues[field.id] || ""}
                                onChange={(e) =>
                                  setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                                }
                                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none placeholder-white/20 transition-all text-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Project selector logic from Notion listing */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide">
                            {isProjectLocked ? "Carpeta de Destino en Notion" : "Selecciona Proyecto / Carpeta de Notion"}
                          </label>
                          {!isProjectLocked && config?.isConfigured && (
                            <button
                              type="button"
                              onClick={fetchProjects}
                              className="p-1 hover:bg-white/5 rounded-md transition-colors text-white/40 hover:text-white"
                              title="Refrescar lista de Notion"
                            >
                              <RefreshCcw className="w-3.5 h-3.5 animate-hover-spin" />
                            </button>
                          )}
                        </div>

                        {isProjectLocked ? (
                          <div className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl flex items-center justify-between select-none">
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm font-bold text-white tracking-wide">{lockedProjectName}</span>
                              {hasValidExpiration && (
                                <span className="text-[10px] text-amber-300 font-medium px-1.5 py-0.5 bg-amber-950/30 border border-amber-900/30 rounded flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5 shrink-0" />
                                  {new Date(activeMeta!.expirationDate!).toLocaleDateString("es-ES", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: activeMeta!.expirationDate!.includes("T") ? "2-digit" : undefined,
                                    minute: activeMeta!.expirationDate!.includes("T") ? "2-digit" : undefined,
                                  })}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-white/40 font-mono tracking-wider uppercase bg-white/5 px-2 py-0.5 rounded-md border border-white/10">Enlace Directo Activo</span>
                          </div>
                        ) : loadingProjects ? (
                          <div className="w-full py-2.5 px-3 border border-white/5 rounded-xl bg-[#0d0d0d] flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                            <span className="text-xs text-white/30">Sincronizando carpetas de Notion...</span>
                          </div>
                        ) : !config?.isConfigured ? (
                          <div className="p-3 border border-amber-900/50 bg-amber-950/30 rounded-xl text-xs text-amber-300 flex items-start gap-2 leading-relaxed">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span>No se han configurado las credenciales de Notion.</span>
                              <button
                                type="button"
                                onClick={() => setActiveTab("admin")}
                                className="block font-semibold underline text-amber-400 hover:text-amber-300 mt-1"
                              >
                                Configurar ahora en Administración
                              </button>
                            </div>
                          </div>
                        ) : projects.length === 0 ? (
                          <div className="p-3 border border-white/10 bg-[#0d0d0d] rounded-xl text-xs text-white/50 flex items-start gap-2 leading-relaxed">
                            <ListFilter className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                            <div>
                              <span>No existen carpetas o proyectos creados en tu página de Notion.</span>
                              <button
                                type="button"
                                onClick={() => setActiveTab("admin")}
                                className="block font-semibold underline text-white hover:text-white/80 mt-1"
                              >
                                Crear un Proyecto / Carpeta
                              </button>
                            </div>
                          </div>
                        ) : projects.filter(p => p.isActive !== false).length === 0 ? (
                          <div className="p-3 border border-red-900/40 bg-red-950/20 rounded-xl text-xs text-red-300 flex items-start gap-2 leading-relaxed">
                            <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5 animate-pulse" />
                            <div>
                              <span className="font-semibold block mb-0.5 text-white">Entregas no disponibles</span>
                              <span>Todos los proyectos están temporalmente inactivos o deshabilitados.</span>
                            </div>
                          </div>
                        ) : (
                          <select
                            id="select-project"
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            required
                            className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white transition-all font-medium cursor-pointer animate-fade-in"
                          >
                            {(() => {
                              const available = projects
                                .filter((p) => p.isActive !== false)
                                .map((p) => ({
                                  ...p,
                                  order: projectMeta[p.id]?.order ?? 0,
                                  groupId: projectMeta[p.id]?.groupId || "",
                                }))
                                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                              const grouped: Record<string, typeof available> = {};
                              const loose: typeof available = [];
                              for (const p of available) {
                                if (p.groupId) {
                                  (grouped[p.groupId] ||= []).push(p);
                                } else {
                                  loose.push(p);
                                }
                              }

                              return (
                                <>
                                  {loose.map((proj) => (
                                    <option key={proj.id} value={proj.id} className="bg-[#111111] text-white">
                                      {proj.name}
                                    </option>
                                  ))}
                                  {Object.entries(grouped).map(([gid, items]) => {
                                    const groupName = projects.find((g) => g.id === gid)?.name || "Grupo";
                                    return (
                                      <optgroup key={gid} label={groupName} className="bg-[#111111] text-white">
                                        {items.map((proj) => (
                                          <option key={proj.id} value={proj.id} className="bg-[#111111] text-white">
                                            {proj.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </select>
                        )}
                      </div>

                      {/* Dropzone visual module / Active / Inactive check or Expired state alert */}
                      {activeMeta?.isActive === false ? (
                        <div className="p-6 border border-amber-900/40 bg-amber-950/20 rounded-2xl text-center space-y-4">
                          <div className="w-12 h-12 bg-amber-950/40 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-900/40 animate-pulse">
                            <EyeOff className="w-6 h-6" />
                          </div>
                          <div className="space-y-1 bg-[#1c120c]/50 p-4 rounded-xl border border-amber-950">
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Proyecto Inactivo</h3>
                            <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto mt-2">
                              Este proyecto ha sido <strong className="text-amber-300">desactivado/inhabilitado temporalmente</strong> por el administrador de Notion y no recibe nuevas entregas.
                            </p>
                          </div>
                          <p className="text-[10px] text-white/30">
                            Por favor ponte en contacto con tu supervisor o administrador de Notion si necesitas prorrogar la entrega.
                          </p>
                        </div>
                      ) : isProjectExpired ? (
                        <div className="p-6 border border-red-900/30 bg-red-950/20 rounded-2xl text-center space-y-4">
                          <div className="w-12 h-12 bg-red-950/40 text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-900/40 animate-pulse">
                            <Clock className="w-6 h-6" />
                          </div>
                          <div className="space-y-1 bg-[#150a0a]/50 p-4 rounded-xl border border-red-950">
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Plazo de entrega vencido</h3>
                            <p className="text-xs text-white/55 leading-relaxed max-w-sm mx-auto mt-2">
                              La fecha límite para cargar archivos en esta carpeta expiró el{" "}
                              <strong className="text-red-300">
                                {new Date(activeMeta!.expirationDate!).toLocaleDateString('es-ES', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: activeMeta!.expirationDate!.includes("T") ? "2-digit" : undefined,
                                  minute: activeMeta!.expirationDate!.includes("T") ? "2-digit" : undefined,
                                })}
                              </strong>.
                            </p>
                          </div>
                          <p className="text-[10px] text-white/30">
                            Por favor ponte en contacto con tu supervisor o administrador de Notion si necesitas prorrogar la entrega.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide">
                              Archivos a adjuntar
                            </label>
                            <Dropzone
                              files={selectedFiles}
                              onFilesAdded={handleFilesAdded}
                              onFileRemoved={handleFileRemoved}
                            />
                          </div>

                          {submitError && (
                            <div className="p-3 border border-red-900/50 bg-red-950/30 text-red-300 text-xs rounded-xl flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                              <span>{submitError}</span>
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={isSubmitting || selectedFiles.length === 0 || !selectedProjectId}
                            className="w-full h-[52px] font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden"
                            style={{
                              '--btn-color': hasBgColor ? currentBgColor : "var(--accent, #f5f011)"
                            } as React.CSSProperties}
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

                            <div className="relative z-10 flex items-center justify-center gap-2 font-extrabold transition-colors duration-300">
                              {isSubmitting && uploadProgress ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                                  <span className="truncate max-w-[70%] text-white font-semibold font-sans normal-case">{submitStep}</span>
                                  <span className="font-mono text-[11px] bg-black/40 text-white px-2 py-0.5 rounded">{uploadProgress.percent}%</span>
                                </>
                              ) : isSubmitting ? (
                                <div className="flex items-center justify-center gap-2 text-white font-sans normal-case">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>{submitStep}</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2 font-mono hover-text-adaptive">
                                  <Send className="w-3.5 h-3.5 btn-text-content" />
                                  <span className="btn-text-content">Transferir Archivos</span>
                                </div>
                              )}
                            </div>
                          </button>
                        </>
                      )}

                    </form>
                  )}

                </div>

              </motion.div>
            ) : (
              <motion.div
                key="admin-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className={`w-full mx-auto flex flex-col ${!isAdminAuthenticated ? "max-w-md min-h-[calc(100vh-5rem)] justify-center py-8" : "max-w-5xl py-4"}`}
              >
                {!isAdminAuthenticated ? (
                  <div
                    className={`w-full p-8 space-y-6 rounded-3xl transition-all ${hasBgColor
                        ? 'bg-transparent border-none shadow-none adaptive-card'
                        : 'bg-[#111111] border border-white/10 shadow-lg'
                      }`}
                    data-adaptive={hasBgColor ? (bgColorIsLight ? "light" : "dark") : "dark"}
                    style={{
                      '--field-bg': hasBgColor ? adaptiveFieldBg : 'var(--field-bg-base, #0d0d0d)',
                      '--field-border': hasBgColor ? adaptiveFieldBorder : 'rgba(255,255,255,0.1)',
                    } as React.CSSProperties}
                  >
                    <div className="text-center space-y-2">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto border"
                        style={{
                          backgroundColor: hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)') : 'rgba(255,255,255,0.05)',
                          borderColor: hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.1)',
                          color: adaptiveText || '#ffffff'
                        }}
                      >
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <h2
                        className="text-lg font-bold tracking-tight"
                        style={{ color: adaptiveText || '#ffffff' }}
                      >
                        Acceso a Administración
                      </h2>
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.4)' }}
                      >
                        Por seguridad, introduce la contraseña configurada en tu Notion (dentro de un bloque de Cita / Quote).
                      </p>
                    </div>

                    <form onSubmit={handleAdminLogin} className="space-y-4">
                      <div>
                        <label
                          className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                          style={{ color: hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.4)' }}
                        >
                          Contraseña
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={adminPasswordInput}
                          onChange={(e) => setAdminPasswordInput(e.target.value)}
                          className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none transition-all font-mono text-center"
                          style={{
                            backgroundColor: 'var(--field-bg)',
                            borderColor: 'var(--field-border)',
                            color: adaptiveText || '#ffffff'
                          }}
                        />
                      </div>

                      {loginError && (
                        <div className="p-3 bg-red-950/30 border border-red-900/50 text-red-300 text-xs rounded-xl text-center leading-relaxed">
                          {loginError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isLoggingIn}
                        className="w-full h-[46px] font-mono tracking-widest text-xs uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden mt-2"
                        style={{
                          '--btn-color': hasBgColor
                            ? (bgColorIsLight ? '#111111' : '#ffffff')
                            : '#ffffff'
                        } as React.CSSProperties}
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
                          {isLoggingIn ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="btn-text-content">Validando...</span>
                            </>
                          ) : (
                            <>
                              <span className="btn-text-content">Ingresar</span>
                              <ArrowRight className="w-3.5 h-3.5 btn-text-content" />
                            </>
                          )}
                        </span>
                      </button>
                    </form>
                  </div>
                ) : (
                  <AdminPanel
                    projects={projects}
                    refreshProjects={fetchProjects}
                    config={config}
                    refreshConfig={fetchConfig}
                    projectMeta={projectMeta}
                    refreshProjectMeta={fetchProjectMeta}
                    applyProjectMetaUpdate={applyProjectMetaUpdate}
                    onAdminPreviewChange={setAdminPreview}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </main>

        {/* Floating blur slider — REMOVED: blur is now configured in Admin settings */}

      </div>
    </>
  );
}
