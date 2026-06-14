import React, { useState, useEffect } from "react";
import { 
  FolderSync, ShieldCheck, Mail, User, ListFilter, Send, 
  CheckCircle2, Loader2, ArrowRight, Settings2, RefreshCcw, AlertTriangle, Clock, EyeOff, AlertCircle
} from "lucide-react";
import { Project, ProjectMeta } from "./types";
import Dropzone from "./components/Dropzone";
import AdminPanel from "./components/AdminPanel";
import { motion, AnimatePresence } from "motion/react";

const normalizeString = (s: string) => {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "-") // replace non-alphanumeric with dashes
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"upload" | "admin">("upload");
  const [projects, setProjects] = useState<Project[]>([]);
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
  const [projectMeta, setProjectMeta] = useState<Record<string, ProjectMeta>>({});

  // Admin dynamic authentication states
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Form states
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  
  // Submit engine states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<any | null>(null);

  // Load configuration, projects and copy text meta
  useEffect(() => {
    const cleanPath = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (cleanPath.toLowerCase() === "admin") {
      setActiveTab("admin");
    }
    fetchConfig();
    fetchProjectMeta();
  }, []);

  const fetchProjectMeta = async () => {
    try {
      const res = await fetch("/api/project-meta");
      const data = await res.json();
      if (data.success) {
        setProjectMeta(data.meta || {});
      }
    } catch (e) {
      console.error("Error setting up project meta details", e);
    }
  };

  // Fetch specific project metadata and expiration date on selection in real-time
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectMetaForProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  const fetchProjectMetaForProject = async (projId: string) => {
    try {
      const res = await fetch(`/api/project-meta?projectId=${projId}`);
      const data = await res.json();
      if (data.success && data.meta) {
        setProjectMeta((prev) => ({
          ...prev,
          [projId]: data.meta,
        }));
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
          fetchProjects();
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

        // Resolve path url matching
        const cleanPath = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
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
        }

        if (data.projects.length > 0) {
          const activeProjects = data.projects.filter((p: any) => p.isActive !== false);
          if (activeProjects.length > 0) {
            setSelectedProjectId(activeProjects[0].id);
          } else {
            setSelectedProjectId(data.projects[0].id);
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

  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MiB — matches server-side chunk size
  const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024; // 20 MiB
  const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (Notion limit)

  // Extensions accepted by Notion's File Upload API (mirrors server-side NOTION_MIME_TYPES)
  const NOTION_SUPPORTED_EXTENSIONS = new Set([
    // Archives
    "zip","gz","gzip","tar","7z","bz2","rar",
    // Images
    "png","jpg","jpeg","gif","webp","svg","bmp","tiff","tif","ico","heic","avif","apng",
    // Audio
    "aac","adts","mid","midi","mp3","mpga","m4a","m4b","oga","ogg","opus","wav","wma","weba","flac",
    // Video
    "amv","asf","wmv","avi","f4v","flv","gifv","m4v","mp4","mkv","webm","mov","qt","mpeg","ogv","3gp","3g2",
    // Documents
    "pdf","txt","csv","json","doc","dot","docx","dotx","xls","xlt","xla","xlsx","xltx",
    "ppt","pot","pps","ppa","pptx","potx","rtf","md","markdown","html","htm","epub","xml","css",
    "odt","ods","odp","ics","yaml","yml","tsv",
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

    const { id: uploadId, uploadName, contentType, mode } = initData;

    // Step 2: Send each chunk
    for (let partNumber = 1; partNumber <= numberOfParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, uploadFile.size);
      const chunk = uploadFile.slice(start, end);

      const pct = Math.round(((partNumber - 1) / numberOfParts) * 100);
      setSubmitStep(`Subiendo ${label} — parte ${partNumber}/${numberOfParts} (${pct}%)`);
      setUploadProgress({ fileName: originalName, percent: pct });

      const chunkFd = new FormData();
      chunkFd.append("file", chunk, uploadName);
      chunkFd.append("upload_id", uploadId);
      chunkFd.append("content_type", contentType);
      chunkFd.append("upload_name", uploadName);
      if (mode === "multi_part") {
        chunkFd.append("part_number", String(partNumber));
      }

      const partRes = await fetch("/api/upload-part", { method: "POST", body: chunkFd });
      const partText = await partRes.text();
      let partData: any;
      try { partData = JSON.parse(partText); } catch {
        throw new Error(`Respuesta inesperada al subir parte ${partNumber} de "${originalName}".`);
      }
      if (!partRes.ok || !partData.success) {
        throw new Error(partData.error || `Error en parte ${partNumber} de "${originalName}"`);
      }
    }

    // Step 3: Complete the multi-part upload
    if (mode === "multi_part") {
      setSubmitStep(`Finalizando ${label}...`);
      setUploadProgress({ fileName: originalName, percent: 99 });

      const completeRes = await fetch("/api/upload-complete", {
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

  const activeMeta = selectedProjectId ? projectMeta[selectedProjectId] : null;

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

  const displayTitle = activeMeta?.title || "Comparte tus archivos directo a Notion.";
  const displayDescription = activeMeta?.description || "Nuestra plataforma te permite arrastrar y soltar cualquier documento de manera instantánea. Tus archivos se organizan de forma automática bajo un indicador desplegable (Toggle List) personalizado con tus datos, directamente en la página del proyecto que elijas.";
  const displayCustomFields = activeMeta?.customFields || [];
  const infoFields = displayCustomFields.filter((f) => !f.askSubmitter);
  const askFields = displayCustomFields.filter((f) => f.askSubmitter);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col antialiased text-[#e0e0e0] relative">
      
      {/* Dynamic Background Tile / Mosaic layer */}
      {activeTab === "upload" && activeMeta?.backgroundImage && (
        <div 
          className="fixed inset-0 -z-50 pointer-events-none" 
          style={{
            backgroundImage: `url(${activeMeta.backgroundImage})`,
            backgroundRepeat: "repeat",
            backgroundSize: "auto",
          }}
        />
      )}
      {/* Accessibility Contrast Dark Overlay layer */}
      {activeTab === "upload" && activeMeta?.backgroundImage && (
        <div className="fixed inset-0 bg-[#050505]/85 -z-40 pointer-events-none" />
      )}
      
      {/* Dynamic Header Nav Bar */}
      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white text-black rounded-xl shadow-sm">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight text-base block">Notion Drop</span>
              <span className="text-[10px] text-white/40 font-mono block">WeTransfer Mode for Notion</span>
            </div>
          </div>

          {/* Navigation toggles with framer motion pill */}
          <div className="bg-white/5 p-1 rounded-full flex gap-1 relative select-none border border-white/10">
            <button
              id="tab-btn-upload"
              onClick={() => { setActiveTab("upload"); handleFilesAdded([]); }}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                activeTab === "upload" 
                  ? "bg-white text-black shadow-2xs" 
                  : "text-white/50 hover:text-white"
              }`}
            >
              Entregar Archivos
            </button>
            <button
              id="tab-btn-admin"
              onClick={() => setActiveTab("admin")}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
                activeTab === "admin" 
                  ? "bg-white text-black shadow-2xs" 
                  : "text-white/50 hover:text-white"
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Administración
            </button>
          </div>
        </div>
      </header>

      {/* Primary Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <AnimatePresence mode="wait">
          {activeTab === "upload" ? (
            <motion.div
              key="upload-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center py-4"
            >
              
              {/* Left Column (Desktop Hero Explanation) */}
              <div className="lg:col-span-5 space-y-6">
                <div className="inline-flex items-center gap-2 bg-white/5 text-white/90 text-[11px] font-semibold px-3 py-1 rounded-full border border-white/10">
                  <ShieldCheck className="w-4 h-4" /> Almacenado Seguro en Notion
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
                  {displayTitle.includes("Notion") ? (
                    <>
                      {displayTitle.split("Notion")[0]}
                      <span className="text-white/60">Notion</span>
                      {displayTitle.split("Notion")[1] || "."}
                    </>
                  ) : (
                    displayTitle
                  )}
                </h1>

                <p className="text-sm text-white/40 leading-relaxed">
                  {displayDescription}
                </p>

                {infoFields.length > 0 && (
                  <div className="border-t border-white/5 pt-6 space-y-4">
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

              {/* Right Column (The interactive Form Card) */}
              <div className="lg:col-span-7">
                <div className="bg-[#111111] rounded-3xl p-6 sm:p-8 border border-white/10 shadow-sm">
                  
                  {submitSuccess ? (
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
                        className="py-2.5 px-6 rounded-xl bg-white hover:bg-white/95 text-black font-semibold text-xs tracking-wide transition-all pointer-events-auto"
                      >
                        Enviar más archivos
                      </button>
                    </motion.div>
                  ) : (
                    // Regular Transfer Form
                    <form onSubmit={handleSubmit} className="space-y-6">
                      
                      <div className="space-y-4">
                        <h2 className="text-lg font-bold text-white">Haz un Envío</h2>
                        <hr className="border-white/5" />
                        
                        {hasValidExpiration && !isProjectExpired && activeMeta?.isActive !== false && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#fbbf24] font-medium bg-[#1c120c]/60 border border-amber-900/30 px-3 py-2 rounded-xl">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Entrega disponible hasta el:{" "}
                              <span className="font-bold">
                                {new Date(activeMeta.expirationDate).toLocaleDateString("es-ES", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                  hour: activeMeta.expirationDate.includes("T") ? "2-digit" : undefined,
                                  minute: activeMeta.expirationDate.includes("T") ? "2-digit" : undefined,
                                })}
                              </span>
                            </span>
                          </div>
                        )}
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
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
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
                            className="w-full py-3.5 rounded-2xl bg-white hover:bg-white/95 disabled:bg-white/5 disabled:text-white/20 text-black font-extrabold text-xs tracking-wider uppercase transition-all select-none shadow-xs hover:shadow-sm cursor-pointer relative overflow-hidden"
                          >
                            {isSubmitting && uploadProgress ? (
                              <>
                                {/* Progress bar background */}
                                <div
                                  className="absolute inset-0 bg-gradient-to-r from-emerald-400/30 to-emerald-500/20 transition-all duration-300 ease-out"
                                  style={{ width: `${uploadProgress.percent}%` }}
                                />
                                <div className="relative flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="truncate max-w-[70%]">{submitStep}</span>
                                  <span className="font-mono text-[11px] bg-black/10 px-1.5 py-0.5 rounded">{uploadProgress.percent}%</span>
                                </div>
                              </>
                            ) : isSubmitting ? (
                              <div className="flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{submitStep}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <Send className="w-4 h-4" />
                                <span>Transferir Archivos</span>
                              </div>
                            )}
                          </button>
                        </>
                      )}

                    </form>
                  )}

                </div>
              </div>

            </motion.div>
          ) : (
            <motion.div
              key="admin-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="py-4"
            >
              {!isAdminAuthenticated ? (
                <div className="max-w-md mx-auto my-12 bg-[#111111] rounded-3xl p-8 border border-white/10 shadow-lg space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 bg-white/5 text-white rounded-full flex items-center justify-center mx-auto border border-white/10">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Acceso a Administración</h2>
                    <p className="text-xs text-white/40 leading-relaxed">
                      Por seguridad, introduce la contraseña configurada en tu Notion (dentro de un bloque de Cita / Quote).
                    </p>
                  </div>

                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                        Contraseña
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={adminPasswordInput}
                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0d0d0d] border border-white/10 rounded-xl text-sm focus:border-white/30 focus:outline-none placeholder-white/20 transition-all text-white font-mono text-center"
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
                      className="w-full py-3 rounded-xl bg-white hover:bg-white/90 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer animate-fade-in"
                    >
                      {isLoggingIn ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Validando...</span>
                        </>
                      ) : (
                        <>
                          <span>Ingresar</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
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
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Footer information */}
      <footer className="bg-[#050505] border-t border-white/5 py-6 select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:justify-between sm:items-center text-white/30 text-[11px] font-medium tracking-wide">
          <p>© 2026 Notion Drop. Todos los derechos reservados.</p>
          <p className="mt-2 sm:mt-0">Sincronización en la nube con API Oficial Notion Workspace</p>
        </div>
      </footer>

    </div>
  );
}
