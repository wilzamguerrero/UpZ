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
import { uploadFiles, type UploadRecord } from "./uploadService";

import { ICON_BY_KEY } from "./icons";
// Shared, extensive icon set (same collection the admin picker offers).
const ICON_MAP: Record<string, LucideIcon> = ICON_BY_KEY;
import { Project, ProjectMeta } from "./types";
import Dropzone from "./components/Dropzone";
import AdminPanel from "./components/AdminPanel";
import NotificationCenter from "./components/NotificationCenter";
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

/** First 6 hex chars of a Notion block id — a stable, unique short id used to
 *  disambiguate same-named projects in their public link. */
const shortProjectId = (id: string) => (id || "").replace(/-/g, "").slice(0, 6).toLowerCase();
/** Id-prefixed public slug: "<shortId>-<name-slug>". */
const projectSlug = (id: string, name: string) => {
  const base = normalizeString(name);
  const sid = shortProjectId(id);
  return sid ? `${sid}-${base}` : base;
};

/** The "entregas" variant of a registration link is the same slug with a short
 *  "-e" suffix (e.g. "3a3264-materia-e") instead of "?entregar=1". */
const hasEntregasSuffix = (slug: string) => /-e$/i.test(slug || "");
const stripEntregasSuffix = (slug: string) => (slug || "").replace(/-e$/i, "");

/** True when a #rgb/#rrggbb color is light (needs a dark icon/text on top). */
const isHexLight = (hex?: string | null): boolean => {
  if (!hex) return false;
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
};

/** Rasterizes a Lucide icon to a base64 PNG data URL so it can be embedded in the
 *  receipt email (Gmail strips inline SVG). Returns "" on any failure. */
async function rasterizeIconDataUrl(iconKey: string, color: string, size = 128): Promise<string> {
  try {
    const Icon = ICON_MAP[iconKey] || UploadCloud;
    const { renderToStaticMarkup } = await import("react-dom/server");
    let svg = renderToStaticMarkup(
      React.createElement(Icon as LucideIcon, { color, size, strokeWidth: 2.5 } as any)
    );
    if (!/xmlns=/.test(svg)) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new window.Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = svgUrl;
    });
    if (!loaded) return "";
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

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
  const [activeTab, setActiveTab] = useState<"upload" | "admin">(() => {
    try { return sessionStorage.getItem("envi_active_tab") === "admin" ? "admin" : "upload"; } catch { return "upload"; }
  });
  const [projects, setProjects] = useState<Project[]>(getCachedProjects);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isProjectLocked, setIsProjectLocked] = useState(false);
  const [lockedProjectName, setLockedProjectName] = useState("");
  // When a FOLDER link is visited, its child projects become selectable from one link.
  const [folderScopeId, setFolderScopeId] = useState("");
  const [folderScopeName, setFolderScopeName] = useState("");
  // True when the visited path is the "entregas" variant of a registration link
  // ("<slug>-e"): show the activity picker instead of the registration form.
  const [pathEntregas, setPathEntregas] = useState(false);

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

  // Admin dynamic authentication states. Persisted for the browser session so a
  // reload (or an accidental navigation) never bounces you back to the home view.
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try { return sessionStorage.getItem("envi_admin_auth") === "1"; } catch { return false; }
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Form states
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(getCachedSelectedProjectId);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");

  // Registration-mode form (parent link): registers a person into the roster.
  const [regName, setRegName] = useState("");
  const [regDocument, setRegDocument] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<{ name: string; document: string } | null>(null);

  // Child submission in registration mode: identify the submitter by document.
  const [childDocument, setChildDocument] = useState("");
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [loadedPerson, setLoadedPerson] = useState<{ name: string; email: string; document: string } | null>(null);

  // Submit engine states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<any | null>(null);
  const [titleKey, setTitleKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTitleKey((k) => k + 1), 3500);
    return () => clearInterval(timer);
  }, []);

  // Background visual customization states
  const [dominantColor, setDominantColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [adminPreview, setAdminPreview] = useState<{
    projectId: string;
    bgColor: string;
    backgroundImage: string;
    bgBlur: number;
    textColor?: "auto" | "white" | "black";
    icon?: string;
  } | null>(null);

  // When a notification is clicked, ask the admin panel to open that delivery.
  // The changing `nonce` re-triggers the navigation even for the same target.
  const [focusDelivery, setFocusDelivery] = useState<{ projectId: string; email: string; document: string; nonce: number } | null>(null);
  const handleOpenDelivery = (projectId: string, email: string, document: string) => {
    setActiveTab("admin");
    setFocusDelivery({ projectId, email, document, nonce: Date.now() });
  };

  // Clicking a native OS notification (handled by the service worker) posts a
  // message here so the app opens that delivery even from the upload tab.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.type === "OPEN_DELIVERY" && d.projectId) {
        handleOpenDelivery(d.projectId, d.email || "", d.document || "");
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  // Persist the active tab and admin auth for the session, so a reload keeps you
  // exactly where you were (the selected project + view are already persisted).
  useEffect(() => {
    try { sessionStorage.setItem("envi_active_tab", activeTab); } catch { /* no-op */ }
  }, [activeTab]);

  useEffect(() => {
    try { sessionStorage.setItem("envi_admin_auth", isAdminAuthenticated ? "1" : "0"); } catch { /* no-op */ }
  }, [isAdminAuthenticated]);

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
          const matchBy = (slug: string): Project | null => {
            const norm = normalizeString(decodeURIComponent(slug));
            return (
              data.projects.find((p: Project) => {
                const matchesId = p.id.toLowerCase() === slug.toLowerCase() || p.id.replace(/-/g, "").toLowerCase() === slug.toLowerCase();
                // New id-prefixed slug ("<shortId>-<name>") — resolves a single project
                // even when several share the same name.
                const matchesShortSlug = projectSlug(p.id, p.name) === norm;
                // Legacy plain-name slug (kept so old links keep working).
                const matchesSlug = normalizeString(p.name) === norm;
                return matchesId || matchesShortSlug || matchesSlug;
              }) || null
            );
          };

          // Try the path as-is first (regular link, or a project whose slug ends in
          // "-e"). Only if that fails and the path ends with "-e" treat it as the
          // entregas variant of a registration link.
          let match = matchBy(cleanPath);
          let entregas = false;
          if (!match && hasEntregasSuffix(cleanPath)) {
            match = matchBy(stripEntregasSuffix(cleanPath));
            entregas = !!match;
          }
          setPathEntregas(entregas);

          if (match) {
            // If the matched project is a FOLDER (has active child projects), don't
            // lock: expose its children so one link lets visitors pick any of them.
            const activeChildren = data.projects.filter(
              (p: Project) => p.parentId === match.id && p.isActive !== false
            );
            if (activeChildren.length > 0) {
              setFolderScopeId(match.id);
              setFolderScopeName(match.name);
              setIsProjectLocked(false);
              setLockedProjectName("");
              setSelectedProjectId(activeChildren[0].id);
              return;
            }

            setFolderScopeId("");
            setFolderScopeName("");
            setSelectedProjectId(match.id);
            setLockedProjectName(match.name);
            setIsProjectLocked(true);
            return;
          }

          setFolderScopeId("");
          setFolderScopeName("");
          setSelectedProjectId("");
          setLockedProjectName("");
          setIsProjectLocked(false);
          return;
        }

        setPathEntregas(false);
        setFolderScopeId("");
        setFolderScopeName("");
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
  // El motor de subida vive en ./uploadService (semáforo adaptativo AIMD,
  // subida de archivos en paralelo, manejo de throttling y reintentos).
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);

  /** Register a person into a parent's roster (registration mode). */
  const handleRegister = async (parentId: string) => {
    if (!regName.trim() || !regDocument.trim() || !regEmail.trim()) {
      setRegError("Completa nombre, documento y correo.");
      return;
    }
    setIsRegistering(true);
    setRegError(null);
    try {
      const parentName = projects.find((p) => p.id === parentId)?.name || "Registro";
      const res = await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          parentName,
          name: regName.trim(),
          document: regDocument.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRegSuccess({ name: data.person?.name || regName.trim(), document: data.person?.document || regDocument.trim() });
        setRegName(""); setRegDocument(""); setRegEmail(""); setRegPhone("");
      } else {
        setRegError(data.error || "No se pudo completar el registro.");
      }
    } catch {
      setRegError("Error de red al registrar.");
    } finally {
      setIsRegistering(false);
    }
  };

  /** Look up a registered person by document (child form, registration mode). */
  const handleLoadByDocument = async (parentId: string) => {
    const doc = childDocument.trim();
    if (!doc) { setDocError("Ingresa tu documento."); return; }
    setIsLoadingDoc(true);
    setDocError(null);
    try {
      const res = await fetch(`/api/registry?parentId=${encodeURIComponent(parentId)}&document=${encodeURIComponent(doc)}`);
      const data = await res.json();
      if (data.success && data.person) {
        setLoadedPerson({ name: data.person.name, email: data.person.email, document: data.person.document });
        setSenderName(data.person.name);
        setSenderEmail(data.person.email);
        setDocError(null);
      } else {
        setLoadedPerson(null);
        setSenderName("");
        setSenderEmail("");
        setDocError("No encontramos ese documento. Regístrate primero en el enlace de registro del grupo.");
      }
    } catch {
      setDocError("Error de red al cargar tus datos.");
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The parent link in registration mode only registers people (no upload here),
    // EXCEPT the "?entregar" variant, which is precisely the upload flow.
    const regScope = folderScopeId || (isProjectLocked ? selectedProjectId : "");
    const wantsAct = pathEntregas || (() => {
      try { return new URLSearchParams(window.location.search).has("entregar"); } catch { return false; }
    })();
    if (regScope && projectMeta[regScope]?.registrationMode && !wantsAct) return;
    if (!senderName || !senderEmail || !selectedProjectId) {
      setSubmitError("Por favor completa tu nombre, correo y selecciona un proyecto.");
      return;
    }
    // Se puede enviar con archivos o solo con un comentario/enlace (al menos uno).
    if (selectedFiles.length === 0 && !comment.trim()) {
      setSubmitError("Adjunta al menos un archivo o escribe un comentario / enlace.");
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

    // Step 1: Upload files in parallel (adaptive semaphore + throttling handling).
    // Skipped entirely when sending only a comment/link with no attachments.
    let fileRecords: UploadRecord[] = [];

    if (selectedFiles.length > 0) {
      try {
        fileRecords = await uploadFiles(selectedFiles, {
          onStep: (step) => setSubmitStep(step),
          onProgress: (percent) =>
            setUploadProgress({ fileName: `${selectedFiles.length} archivo(s)`, percent }),
        });
      } catch (err: any) {
        setSubmitError(err.message || "Error al subir archivos.");
        setIsSubmitting(false);
        setSubmitStep("");
        setUploadProgress(null);
        return;
      }
    }

    // Step 2: POST metadata + upload IDs to create the Notion toggle block
    setUploadProgress({ fileName: fileRecords[0]?.name || "", percent: 100 });
    try {
      const submitMeta = projectMeta[selectedProjectId];
      // Rasterize the ACTIVITY's own icon so the receipt email shows it next to
      // "ENVI" (works for individual deliveries and per-activity in registration mode).
      let iconPng = "";
      if (submitMeta?.icon) {
        const iconColor = submitMeta.bgColor && isHexLight(submitMeta.bgColor) ? "#111111" : "#ffffff";
        iconPng = await rasterizeIconDataUrl(submitMeta.icon, iconColor, 128);
      }
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
          // Mensaje opcional del remitente (el campo siempre está disponible).
          comment,
          // Documento de identidad (cuando el proyecto padre está en modo registro).
          document: loadedPerson?.document || "",
          // Color del proyecto, para que el correo de comprobante use el mismo color.
          bgColor: submitMeta?.bgColor || "",
          // Icono del proyecto (PNG base64) para la cabecera del correo.
          iconPng,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(data.submission);
        setSenderName("");
        setSenderEmail("");
        setSelectedFiles([]);
        setCustomValues({});
        setComment("");
        setChildDocument("");
        setLoadedPerson(null);
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

  // Registration view: the visited link is a PARENT project in registration mode.
  // (folder link → folderScopeId; single locked project → selectedProjectId.)
  // The "?entregar" variant of the same link skips the registration form and instead
  // lets the person load by document and pick which activity (child) to submit to.
  const wantsActivities = pathEntregas || (() => {
    try { return new URLSearchParams(window.location.search).has("entregar"); } catch { return false; }
  })();
  const registrationScopeId = folderScopeId || (isProjectLocked ? selectedProjectId : "");
  const isRegistrationParentLink = activeTab !== "admin" && !!registrationScopeId && !!projectMeta[registrationScopeId]?.registrationMode;
  const isRegistrationView = isRegistrationParentLink && !wantsActivities;
  const registrationParentId = isRegistrationView ? registrationScopeId : "";

  // Child submission in registration mode: the selected child's PARENT has it on.
  const childSubmitParentId = !isRegistrationView && selectedProjectId
    ? (projects.find((p) => p.id === selectedProjectId)?.parentId || "")
    : "";
  const childRegistrationMode = activeTab !== "admin" && !!childSubmitParentId && !!projectMeta[childSubmitParentId]?.registrationMode;

  // Resolve active meta: if on admin tab, default to the adminPreview's projectId if present.
  // In registration view, the header/theme reflect the PARENT project.
  const activeProjectId = activeTab === "admin"
    ? (adminPreview?.projectId || selectedProjectId)
    : (isRegistrationView ? registrationParentId : selectedProjectId);

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
  const adminPreviewActive = activeTab === "admin" && !!adminPreview && adminPreview.projectId === activeProjectId;
  const activeIconKey = adminPreviewActive
    ? (adminPreview!.icon || "UploadCloud")
    : (isRootExperience ? appearance.homeIcon : (activeMeta?.icon || "UploadCloud"));

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
  // Forced contrast override (per project). Falls back to luminance when "auto".
  const forcedTextColor = activeTab === "admin" && adminPreview && adminPreview.projectId === activeProjectId
    ? adminPreview.textColor
    : (activeMeta?.textColor);
  const bgColorIsLight = forcedTextColor === "black"
    ? true
    : forcedTextColor === "white"
      ? false
      : (bgColorLuminance !== null && bgColorLuminance > 0.5);
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

        {/* Floating particles layer — renders on the upload view and mirrored in the
            admin detail preview (when a project color is active) for consistency. */}
        {(activeTab === "upload" || adminPreviewActive) && (() => {
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

        {/* Registration-mode indicator: a diagonal-lines strip on the left edge. */}
        {isRegistrationView && (
          <div
            className="fixed left-0 top-0 bottom-0 w-[34px] pointer-events-none z-[45]"
            style={{
              backgroundImage: `repeating-linear-gradient(119deg, ${bgColorIsLight ? '#000000' : '#ffffff'} 0px, ${bgColorIsLight ? '#000000' : '#ffffff'} 1px, transparent 1px, transparent 9px)`,
            }}
          />
        )}

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
            {activeTab === "admin" && (
              <NotificationCenter
                light={hasBgColor && bgColorIsLight}
                onOpenDelivery={handleOpenDelivery}
              />
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
                              <ScrambleReveal key={titleKey} text={displayTitle} duration={900} delay={80} />
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
                    // Submission Success feedback View — stays on screen until the
                    // user decides to send again (via the button below). No auto page reset.
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center py-8 space-y-6"
                    >
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto border"
                        style={{
                          backgroundColor: hasBgColor ? currentBgColor : 'rgba(0,0,0,0.4)',
                          borderColor: hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.1)',
                          color: hasBgColor ? (bgColorIsLight ? '#111111' : '#f0f0f0') : '#34d399',
                        }}
                      >
                        <CheckCircle2 className="w-10 h-10" />
                      </div>

                      <div>
                        <h2 className="text-2xl font-bold text-white">¡Archivos Enviados!</h2>
                        <p className="text-xs text-white/40 mt-2">
                          Dev by WilZamGuerrero
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
                        <div className="flex justify-between gap-3">
                          <span className="text-white/40 shrink-0">Fecha y hora de envío:</span>
                          <span className="font-semibold text-slate-200 text-right">
                            {(() => {
                              const raw = submitSuccess.timestamp;
                              const d = raw ? new Date(raw) : new Date();
                              if (isNaN(d.getTime())) return "—";
                              return d.toLocaleString("es-ES", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-white/5 pt-3">
                          <span className="text-white/40">Archivos totales:</span>
                          <span className="font-mono font-bold text-white">{submitSuccess.files.length}</span>
                        </div>
                        <div className="space-y-1.5 pt-1.5">
                          {submitSuccess.files.map((file: any, fIdx: number) => (
                            <div key={fIdx} className="flex justify-between text-[11px] text-white/50 bg-[#111111] p-2 rounded-lg border border-white/5">
                              <span className="truncate flex-1 pr-2"><File className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />{file.name}</span>
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
                          <ScrambleReveal key={titleKey} text={displayTitle} duration={900} delay={80} />
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

                      {isRegistrationView ? (
                        activeMeta?.isActive === false ? (
                          /* Registration closed by the lock button */
                          <div className="p-6 border border-white/10 bg-white/5 rounded-2xl text-center space-y-4">
                            <div className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center mx-auto border border-white/15 animate-pulse">
                              <EyeOff className="w-6 h-6" />
                            </div>
                            <div className="space-y-1 bg-white/5 p-4 rounded-xl border border-white/10">
                              <h3 className="text-sm font-bold text-white tracking-wide uppercase">Registro cerrado</h3>
                              <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto mt-2">
                                El registro de este grupo está <strong className="text-white font-semibold">deshabilitado temporalmente</strong> por el administrador.
                              </p>
                            </div>
                          </div>
                        ) : (
                        /* Registration form (parent link in registration mode) */
                        <div className="space-y-4">
                          {regSuccess ? (
                            <div className="p-5 border border-white/10 bg-white/5 rounded-2xl text-center space-y-3">
                              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto border border-white/15 bg-white/5">
                                <CheckCircle2 className="w-6 h-6 text-white" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-white">¡Registro completado!</h3>
                                <p className="text-xs text-white/50 mt-1 leading-relaxed">
                                  <strong className="text-white/80">{regSuccess.name}</strong> quedó registrado con el documento{" "}
                                  <strong className="text-white/80">{regSuccess.document}</strong>. En cada actividad de este grupo solo tendrás que ingresar tu documento para cargar tus datos.
                                </p>
                              </div>
                              <button type="button" onClick={() => setRegSuccess(null)} className="text-xs font-semibold text-white/70 hover:text-white underline">
                                Registrar otra persona
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-white/40 leading-relaxed">
                                Regístrate una sola vez. Luego, en cada actividad de este grupo, solo necesitarás tu documento para identificarte.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">Nombre completo</label>
                                  <div className="relative">
                                    <User className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                                    <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">Documento de identidad</label>
                                  <div className="relative">
                                    <CreditCard className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                                    <input type="text" value={regDocument} onChange={(e) => setRegDocument(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">Correo</label>
                                  <div className="relative">
                                    <Mail className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                                    <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                                    Teléfono <span className="text-white/25 normal-case font-normal">(opcional)</span>
                                  </label>
                                  <div className="relative">
                                    <Phone className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                                    <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white" />
                                  </div>
                                </div>
                              </div>

                              {regError && (
                                <div className="p-3 border border-red-900/50 bg-red-950/30 text-red-300 text-xs rounded-xl flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                  <span>{regError}</span>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRegister(registrationParentId)}
                                disabled={isRegistering}
                                className="w-full h-[56px] font-mono tracking-widest text-sm uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden disabled:opacity-60"
                                style={{ '--btn-color': hasBgColor ? currentBgColor : "var(--accent, #f5f011)" } as React.CSSProperties}
                              >
                                <div className="absolute inset-0 bg-[#000000] border border-black group-hover:bg-transparent group-hover:border-transparent transition-all duration-300 rounded-[4px] pointer-events-none" />
                                <div className="absolute inset-[1px] bg-[#000000] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px] stripes-overlay" style={{ backgroundImage: `repeating-linear-gradient(119deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)` }} />
                                <span className="btn-motion-corner btn-motion-corner-tl" />
                                <span className="btn-motion-corner btn-motion-corner-tr" />
                                <span className="btn-motion-corner btn-motion-corner-bl" />
                                <span className="btn-motion-corner btn-motion-corner-br" />
                                <div className="relative z-10 flex items-center justify-center transition-colors duration-300">
                                  {isRegistering ? (
                                    <span className="text-white font-semibold font-sans normal-case text-base">Registrando...</span>
                                  ) : (
                                    <div className="flex items-center justify-center gap-2.5 font-mono hover-text-adaptive">
                                      <User className="w-4 h-4 btn-text-content" />
                                      <span className="btn-text-content text-sm">Registrarme</span>
                                    </div>
                                  )}
                                </div>
                              </button>
                            </>
                          )}
                        </div>
                        )
                      ) : (
                      <>

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
                              <div
                                className="border-2 border-dashed rounded-2xl px-4 py-3 flex flex-col gap-1.5"
                                style={{ borderColor: hasBgColor ? (bgColorIsLight ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)') : 'rgba(245,240,17,0.4)' }}
                              >
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: adaptiveText || 'var(--accent, #f5f011)', opacity: 0.8 }}>
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>Disponible hasta · {dateStr}</span>
                                </div>
                                <div className="flex items-center gap-3 font-mono font-bold text-2xl tabular-nums" style={{ color: adaptiveText || 'var(--accent, #f5f011)' }}>
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

                      {/* Identity: document lookup (registration mode) or name + email. */}
                      {childRegistrationMode && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">Documento de identidad</label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <CreditCard className="absolute left-3 top-3 text-white/30 w-4 h-4" />
                                <input
                                  type="text"
                                  value={childDocument}
                                  onChange={(e) => { setChildDocument(e.target.value); if (loadedPerson) { setLoadedPerson(null); setSenderName(""); setSenderEmail(""); } }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleLoadByDocument(childSubmitParentId); } }}
                                  placeholder="Ingresa tu documento"
                                  className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleLoadByDocument(childSubmitParentId)}
                                disabled={isLoadingDoc || !childDocument.trim()}
                                className="px-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold uppercase tracking-wide transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                              >
                                {isLoadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Cargar mis datos
                              </button>
                            </div>
                          </div>
                          {docError && (
                            <div className="p-3 border border-red-900/50 bg-red-950/30 text-red-300 text-xs rounded-xl flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                              <span>{docError}</span>
                            </div>
                          )}
                          {loadedPerson && (
                            <div className="p-3 border border-white/10 bg-white/5 rounded-xl flex items-center gap-2.5">
                              <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white truncate">{loadedPerson.name}</div>
                                <div className="text-xs text-white/50 truncate">{loadedPerson.email}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setLoadedPerson(null); setSenderName(""); setSenderEmail(""); setChildDocument(""); }}
                                className="ml-auto text-[11px] font-semibold text-white/60 hover:text-white underline shrink-0"
                              >
                                Cambiar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {!childRegistrationMode && (
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
                              placeholder=""
                              value={senderName}
                              onChange={(e) => setSenderName(e.target.value)}
                              className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white"
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
                              placeholder=""
                              value={senderEmail}
                              onChange={(e) => setSenderEmail(e.target.value)}
                              className="w-full pl-10 pr-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white"
                            />
                          </div>
                        </div>
                      </div>
                      )}

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
                        <div className="flex items-center justify-end mb-1.5">
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
                            </div>
                            <Globe className="w-4 h-4 text-white/40" title="Enlace directo activo" />
                          </div>
                        ) : loadingProjects ? (
                          <div className="w-full py-2.5 px-3 border border-white/5 rounded-xl bg-[#0d0d0d] flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                            <span className="text-xs text-white/30">Sincronizando carpetas de Notion...</span>
                          </div>
                        ) : !config?.isConfigured ? (
                          <div className="p-3 border border-white/10 bg-white/5 rounded-xl text-xs text-white/60 flex items-start gap-2 leading-relaxed">
                            <AlertTriangle className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
                            <div>
                              <span>No se han configurado las credenciales de Notion.</span>
                              <button
                                type="button"
                                onClick={() => setActiveTab("admin")}
                                className="block font-semibold underline text-white hover:text-white/80 mt-1"
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
                          <>
                          {folderScopeId && (
                            <p className="text-[11px] text-white/50 mb-1.5">
                              Elige el proyecto dentro de <span className="text-white font-semibold">{folderScopeName}</span> al que quieres enviar:
                            </p>
                          )}
                          <select
                            id="select-project"
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            required
                            className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none text-white transition-all font-medium cursor-pointer animate-fade-in"
                          >
                            {(() => {
                              const available = projects
                                .filter((p) => p.isActive !== false && (!folderScopeId || p.parentId === folderScopeId))
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
                          </>
                        )}
                      </div>

                      {/* Dropzone visual module / Active / Inactive check or Expired state alert */}
                      {activeMeta?.isActive === false ? (
                        <div className="p-6 border border-white/10 bg-white/5 rounded-2xl text-center space-y-4">
                          <div className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center mx-auto border border-white/15 animate-pulse">
                            <EyeOff className="w-6 h-6" />
                          </div>
                          <div className="space-y-1 bg-white/5 p-4 rounded-xl border border-white/10">
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Proyecto Inactivo</h3>
                            <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto mt-2">
                              Este proyecto ha sido <strong className="text-white font-semibold">desactivado/inhabilitado temporalmente</strong> por el administrador de Notion y no recibe nuevas entregas.
                            </p>
                          </div>
                          <p className="text-[10px] text-white/30">
                            Por favor ponte en contacto con tu supervisor o administrador de Notion si necesitas prorrogar la entrega.
                          </p>
                        </div>
                      ) : isProjectExpired ? (
                        <div className="p-6 border border-white/10 bg-white/5 rounded-2xl text-center space-y-4">
                          <div className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center mx-auto border border-white/15 animate-pulse">
                            <Clock className="w-6 h-6" />
                          </div>
                          <div className="space-y-1 bg-white/5 p-4 rounded-xl border border-white/10">
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Plazo de entrega vencido</h3>
                            <p className="text-xs text-white/55 leading-relaxed max-w-sm mx-auto mt-2">
                              La fecha límite para cargar archivos en esta carpeta expiró el{" "}
                              <strong className="text-white font-semibold">
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
                          {/* Optional submitter message (always available). */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide">
                              Comentarios <span className="text-white/25 normal-case font-normal">(opcional)</span>
                            </label>
                            <textarea
                              rows={3}
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Deja un mensaje para el destinatario..."
                              className="w-full px-3.5 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-all resize-y"
                            />
                          </div>
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
                            disabled={isSubmitting || !selectedProjectId || (childRegistrationMode && !loadedPerson) || (selectedFiles.length === 0 && !comment.trim())}
                            className="w-full h-[56px] font-mono tracking-widest text-sm uppercase cursor-pointer select-none relative transition-all duration-300 btn-motion-retro group overflow-hidden"
                            style={{
                              '--btn-color': hasBgColor ? currentBgColor : "var(--accent, #f5f011)"
                            } as React.CSSProperties}
                          >
                            {/* Base black background filled container */}
                            <div className="absolute inset-0 bg-[#000000] border border-black group-hover:bg-transparent group-hover:border-transparent transition-all duration-300 rounded-[4px] pointer-events-none" />

                            {/* Diagonal stripes */}
                            <div
                              className={`absolute inset-[1px] bg-[#000000] opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none rounded-[3px] stripes-overlay ${isSubmitting ? 'stripes-animated' : ''}`}
                              style={{
                                backgroundImage: `repeating-linear-gradient(119deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 10px)`
                              }}
                            />

                            {/* Corner marks for hover focus */}
                            <span className="btn-motion-corner btn-motion-corner-tl" />
                            <span className="btn-motion-corner btn-motion-corner-tr" />
                            <span className="btn-motion-corner btn-motion-corner-bl" />
                            <span className="btn-motion-corner btn-motion-corner-br" />

                            <div className="relative z-10 flex items-center justify-center transition-colors duration-300">
                              {isSubmitting && uploadProgress ? (
                                <span className="text-white font-bold font-mono text-2xl tabular-nums">{uploadProgress.percent}%</span>
                              ) : isSubmitting ? (
                                <span className="text-white font-semibold font-sans normal-case text-base">{submitStep}</span>
                              ) : (
                                <div className="flex items-center justify-center gap-2.5 font-mono hover-text-adaptive">
                                  <Send className="w-4 h-4 btn-text-content" />
                                  <span className="btn-text-content text-sm">Transferir Archivos</span>
                                </div>
                              )}
                            </div>
                          </button>
                          <div className="text-right -mt-5.5">
                            <span className="text-[10px] text-white/30 font-mono tracking-wide">Dev by WilZamGuerrero</span>
                          </div>
                        </>
                      )}

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
                className={`relative z-[1] w-full mx-auto flex flex-col ${!isAdminAuthenticated ? "max-w-md min-h-[calc(100vh-5rem)] justify-center py-8" : "max-w-[1800px] px-4 lg:px-8 py-4"}`}
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
                    focusDelivery={focusDelivery}
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
