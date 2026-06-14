import React, { useState, useEffect } from "react";
import { 
  Settings, Key, FolderPlus, FileSpreadsheet, Eye, EyeOff, Check, 
  AlertCircle, Plus, Search, Mail, Calendar, ExternalLink, Download, ArrowRight, Trash2,
  Link, QrCode, Copy, GripVertical, Database, Table
} from "lucide-react";
import { Project, Submission, NotionConfig, ProjectMeta, CustomField, DbColumn } from "../types";
import DateTimePicker from "./DateTimePicker";
import GradingTable from "./GradingTable";

const genId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const genColId = () => `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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
  refreshProjectMeta: () => Promise<void>;
}

export default function AdminPanel({ 
  projects, 
  refreshProjects, 
  config, 
  refreshConfig,
  projectMeta,
  refreshProjectMeta
}: AdminPanelProps) {
  // Config state
  const [notionSecret, setNotionSecret] = useState("");
  const [parentPageId, setParentPageId] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Copywriting editor states
  const [selectedMetaProjectId, setSelectedMetaProjectId] = useState("");
  const [copyTitle, setCopyTitle] = useState("");
  const [copyDesc, setCopyDesc] = useState("");
  const [copyCustomFields, setCopyCustomFields] = useState<CustomField[]>([]);
  const [copyExpiration, setCopyExpiration] = useState("");
  const [copyBackground, setCopyBackground] = useState("");
  const [copyBgBlur, setCopyBgBlur] = useState(0);
  const [copyIsActive, setCopyIsActive] = useState(true);
  const [copyUseDatabase, setCopyUseDatabase] = useState(false);
  const [copyDatabaseId, setCopyDatabaseId] = useState("");
  const [copyDbColumns, setCopyDbColumns] = useState<DbColumn[]>([]);
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

  // Handle copywriting selection initialization
  useEffect(() => {
    if (projects.length > 0 && !selectedMetaProjectId) {
      setSelectedMetaProjectId(projects[0].id);
    }
  }, [projects, selectedMetaProjectId]);

  // Sync copywriting form fields when project or metadata changes
  useEffect(() => {
    if (selectedMetaProjectId) {
      const active = projectMeta[selectedMetaProjectId] || {
        title: "Comparte tus archivos directo a Notion.",
        description: "Nuestra plataforma te permite arrastrar y soltar cualquier documento de manera instantánea. Tus archivos se organizan de forma automática bajo un indicador desplegable (Toggle List) personalizado con tus datos, directamente en la página del proyecto que elijas.",
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
      setCopyIsActive(active.isActive !== false);
      setCopyUseDatabase(!!active.useDatabase);
      setCopyDatabaseId(active.databaseId || "");
      setCopyDbColumns(Array.isArray(active.dbColumns) ? active.dbColumns : []);
      setCopyGroupId(active.groupId || "");
      setMetaMessage(null);
    }
  }, [selectedMetaProjectId, projectMeta]);

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMetaProjectId) return;
    setIsSavingMeta(true);
    setMetaMessage(null);
    try {
      const res = await fetch("/api/project-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedMetaProjectId,
          title: copyTitle,
          description: copyDesc,
          customFields: copyCustomFields,
          expirationDate: copyExpiration,
          backgroundImage: copyBackground,
          bgBlur: copyBgBlur,
          isActive: copyIsActive,
          useDatabase: copyUseDatabase,
          databaseId: copyDatabaseId,
          dbColumns: copyDbColumns,
          groupId: copyGroupId,
          order: projectMeta[selectedMetaProjectId]?.order ?? 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMetaMessage({ type: "success", text: "¡Textos guardados correctamente!" });
        await refreshProjectMeta();
        await refreshProjects();
      } else {
        setMetaMessage({ type: "error", text: data.error || "No se pudieron guardar los textos." });
      }
    } catch (err) {
      setMetaMessage({ type: "error", text: "Error de red al intentar guardar los textos." });
    } finally {
      setIsSavingMeta(false);
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
      title: "Comparte tus archivos directo a Notion.",
      description: "Nuestra plataforma te permite arrastrar y soltar cualquier documento de manera instantánea. Tus archivos se organizan de forma automática bajo un indicador desplegable (Toggle List) personalizado con tus datos, directamente en la página del proyecto que elijas.",
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
        alert(data.error || "No se pudo cambiar el estado de activación.");
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
      setSaveMessage({ type: "error", text: "Proporciona un nuevo Secreto de Notion o mantén el anterior." });
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
        setSaveMessage({ type: "success", text: "¡Configuración de Notion actualizada con éxito!" });
        setNotionSecret(""); // clear field since it's saved server-side
        await refreshConfig();
        await refreshProjects();
      } else {
        setSaveMessage({ type: "error", text: data.error || "No se pudo guardar la configuración." });
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
    if (!window.confirm(`¿Estás seguro de que quieres eliminar la carpeta del proyecto "${projName}"? Se borrará tanto de Notion como localmente.`)) return;

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
    if (!window.confirm("¿Estás seguro de que quieres eliminar las credenciales de Notion actuales?")) return;
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Settings column */}
      <div className="col-span-1 space-y-8">
        
        {/* Connection status card */}
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-white/5 text-white rounded-xl">
              <Settings className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Estado de la Conexión</h2>
              <p className="text-xs text-white/40">Sincronización en tiempo real</p>
            </div>
          </div>

          {config?.isConfigured ? (
            <div className="bg-emerald-950/30 text-emerald-300 border border-emerald-900/50 p-4 rounded-xl flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Listo para usar</p>
                <p className="text-xs text-emerald-400/80 mt-1">
                  Tu aplicación está correctamente vinculada con la página {config.parentPageId.slice(0, 8)}... de Notion.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-950/30 text-amber-300 border border-amber-900/50 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Faltan credenciales</p>
                <p className="text-xs text-amber-400/80 mt-1">
                  Por favor introduce el Secreto de la integración y el ID de tu página matriz de Notion.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Project Custom Copywriting */}
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-xs">
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
                          ¡Copiado!
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
                        title="Abrir en nueva pestaña"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="flex items-start gap-3 bg-white/5 p-2.5 rounded-lg border border-white/5">
                      <div className="bg-white p-1 rounded shrink-0 self-center">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(directUrl)}`}
                          alt="Código QR"
                          className="w-[72px] h-[72px]"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white flex items-center gap-1">
                          <QrCode className="w-3 h-3 text-emerald-400" /> QR del Proyecto
                        </p>
                        <p className="text-[9px] text-white/40 mt-0.5 leading-relaxed">
                          Escanea o haz clic abajo para descargar una versión imprimible del QR.
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
                  Título de Bienvenida
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Comparte tus archivos directo a Notion."
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

              {/* Dynamic custom fields editor (point 5) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide">
                    Campos personalizados
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCopyCustomFields((prev) => [...prev, { id: genId(), label: "", value: "" }])
                    }
                    className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Agregar campo
                  </button>
                </div>

                {copyCustomFields.length === 0 ? (
                  <p className="text-[10px] text-white/30 bg-[#0d0d0d] border border-dashed border-white/10 rounded-xl px-3 py-3 text-center">
                    No hay campos. Pulsa “Agregar campo” para crear los tuyos (opcional).
                  </p>
                ) : (
                  copyCustomFields.map((field, idx) => (
                    <div key={field.id} className="bg-[#0d0d0d] border border-white/10 rounded-xl p-2 space-y-1.5">
                      <div className="flex gap-1.5 items-start">
                        <input
                          type="text"
                          placeholder="Etiqueta (ej: Curso)"
                          value={field.label}
                          onChange={(e) =>
                            setCopyCustomFields((prev) =>
                              prev.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f))
                            )
                          }
                          className="w-1/3 px-2.5 py-2 bg-[#111] border border-white/10 rounded-lg text-xs focus:border-white/30 focus:outline-none text-white transition-all"
                        />
                        <input
                          type="text"
                          placeholder={field.askSubmitter ? "Texto de ayuda (opcional)" : "Valor / descripción"}
                          value={field.value}
                          onChange={(e) =>
                            setCopyCustomFields((prev) =>
                              prev.map((f, i) => (i === idx ? { ...f, value: e.target.value } : f))
                            )
                          }
                          className="flex-1 px-2.5 py-2 bg-[#111] border border-white/10 rounded-lg text-xs focus:border-white/30 focus:outline-none text-white transition-all"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCopyCustomFields((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 hover:border-red-900/20 rounded-lg transition-all cursor-pointer shrink-0"
                          title="Eliminar campo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 px-1">
                        <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!field.askSubmitter}
                            onChange={(e) =>
                              setCopyCustomFields((prev) =>
                                prev.map((f, i) => (i === idx ? { ...f, askSubmitter: e.target.checked } : f))
                              )
                            }
                            className="w-3 h-3 rounded cursor-pointer"
                          />
                          Lo rellena la persona
                        </label>
                        {field.askSubmitter && (
                          <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!field.required}
                              onChange={(e) =>
                                setCopyCustomFields((prev) =>
                                  prev.map((f, i) => (i === idx ? { ...f, required: e.target.checked } : f))
                                )
                              }
                              className="w-3 h-3 rounded cursor-pointer"
                            />
                            Obligatorio
                          </label>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Database mode (point 8) */}
              <div className="space-y-2 border-t border-white/5 pt-4">
                <div className="flex items-center gap-2 p-1.5 bg-[#0d0d0d] border border-white/5 rounded-xl">
                  <input
                    type="checkbox"
                    id="use-database-checkbox"
                    checked={copyUseDatabase}
                    onChange={(e) => setCopyUseDatabase(e.target.checked)}
                    className="w-4 h-4 rounded text-black border-white/10 bg-[#0d0d0d] focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="use-database-checkbox" className="text-[11px] font-bold text-white/80 cursor-pointer select-none">
                    Usar base de datos (tabla en Notion)
                  </label>
                </div>
                <p className="text-[10px] text-white/30">
                  Sin base de datos: cada envío crea un toggle por persona (modo actual). Con base de datos: cada envío se guarda como fila en una tabla de Notion y puedes calificar.
                </p>

                {copyUseDatabase && (
                  <div className="space-y-2 bg-[#0a0a0a] border border-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        Columnas de control
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCopyDbColumns((prev) => [...prev, { id: genColId(), name: "", type: "text" }])
                        }
                        className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Agregar columna
                      </button>
                    </div>

                    {copyDbColumns.length === 0 ? (
                      <p className="text-[10px] text-white/30 text-center py-1">
                        Ej: Nota, Estado, Comentarios. Nombre, Correo, Fecha y Archivos se añaden automáticamente.
                      </p>
                    ) : (
                      copyDbColumns.map((col, idx) => (
                        <div key={col.id} className="flex gap-1.5 items-center">
                          <input
                            type="text"
                            placeholder="Nombre (ej: Nota)"
                            value={col.name}
                            onChange={(e) =>
                              setCopyDbColumns((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                              )
                            }
                            className="flex-1 px-2.5 py-2 bg-[#111] border border-white/10 rounded-lg text-xs focus:border-white/30 focus:outline-none text-white"
                          />
                          <select
                            value={col.type}
                            onChange={(e) =>
                              setCopyDbColumns((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, type: e.target.value as DbColumn["type"] } : c))
                              )
                            }
                            className="px-2 py-2 bg-[#111] border border-white/10 rounded-lg text-xs text-white cursor-pointer"
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
                            className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-950/20 border border-white/5 rounded-lg transition-all cursor-pointer shrink-0"
                            title="Eliminar columna"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {copyDatabaseId ? (
                        <span className="text-[10px] text-emerald-400 font-mono truncate flex items-center gap-1">
                          <Check className="w-3 h-3 shrink-0" /> BD: {copyDatabaseId.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400/80">Aún no se ha creado la base de datos.</span>
                      )}
                      <button
                        type="button"
                        onClick={handleCreateDatabase}
                        disabled={isCreatingDb}
                        className="text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white px-2.5 py-1.5 rounded-lg border border-white/10 transition-all disabled:opacity-50 cursor-pointer"
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
                />
                <p className="text-[10px] text-white/30 mt-1">
                  Establece el día y la hora límite. Pasado este momento, se inhabilitará la zona de carga para este proyecto.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Imagen de Fondo (Diseño Mosaico/Tile)
                </label>
                
                <div className="grid grid-cols-1 gap-2 mb-2">
                  <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-white/20 bg-[#0d0d0d] rounded-xl py-3 px-4 cursor-pointer text-center group transition-all">
                    <span className="text-xs font-semibold text-white/70 group-hover:text-white">
                      {isUploadingBg ? "Subiendo archivo..." : "📁 Seleccionar o Arrastrar Imagen"}
                    </span>
                    <span className="text-[9px] text-white/30 mt-0.5">JPG, PNG o GIF (guardada en /uploads)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadBgImage}
                      disabled={isUploadingBg}
                      className="hidden"
                    />
                  </label>

                  <div>
                    <input
                      type="text"
                      placeholder="O pega una URL externa de imagen..."
                      value={copyBackground}
                      onChange={(e) => setCopyBackground(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all pointer-events-auto"
                    />
                  </div>
                </div>

                {copyBackground && (
                  <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-cover bg-center shrink-0 border border-white/10" style={{ backgroundImage: `url(${copyBackground})` }} referrerPolicy="no-referrer" />
                    <span className="text-[10px] text-white/50 truncate flex-1 font-mono">{copyBackground}</span>
                    <button
                      type="button"
                      onClick={() => setCopyBackground("")}
                      className="text-[10px] text-red-400 hover:underline px-1.5 py-0.5 whitespace-nowrap cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                )}

                {/* Blur intensity slider */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-wide">
                      Desenfoque de Fondo
                    </label>
                    <span className="text-xs font-mono text-white/50">{copyBgBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={copyBgBlur}
                    onChange={(e) => setCopyBgBlur(Number(e.target.value))}
                    className="w-full cursor-pointer accent-white"
                    style={{ height: "3px" }}
                  />
                  <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
                    <span>Sin desenfoque</span>
                    <span>Máximo</span>
                  </div>
                </div>
              </div>

              {metaMessage && (
                <div className={`p-3 rounded-xl text-xs flex gap-2 items-center ${
                  metaMessage.type === "success" 
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
                className="w-full py-2.5 rounded-xl bg-white hover:bg-white/90 text-black font-semibold text-xs tracking-wide transition-all disabled:opacity-50 cursor-pointer text-center"
              >
                {isSavingMeta ? "Guardando..." : "Guardar Textos"}
              </button>
            </form>
          )}
        </div>

      </div>

      {/* Projects and creations column */}
      <div className="col-span-1 lg:col-span-2 space-y-8">
        
        {/* Project creator Section */}
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-xs">
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
              className="px-5 rounded-xl bg-white hover:bg-[#f0f0f0] disabled:bg-white/10 disabled:text-white/30 text-black font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
            >
              {isCreatingProject ? (
                "Creando..."
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Crear Carpeta
                </>
              )}
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
            <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
              {orderedProjects.map((proj, position) => (
                <div 
                  key={proj.id} 
                  draggable
                  onDragStart={() => setDragId(proj.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropReorder(proj.id)}
                  onClick={() => setSelectedMetaProjectId(proj.id)}
                  className={`p-3 border rounded-xl flex items-center justify-between transition-all cursor-pointer group animate-fade-in ${
                    dragId === proj.id ? "opacity-40 border-dashed" : ""
                  } ${
                    proj.id === selectedMetaProjectId 
                      ? "border-white/30 bg-white/5" 
                      : proj.isActive !== false
                        ? "border-white/5 bg-[#0d0d0d] hover:border-white/12"
                        : "border-dashed border-red-900/40 bg-red-950/5 hover:border-red-900/60"
                  }`}
                  title="Arrastra para reordenar • Clic para personalizar"
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
                      
                      <span className="text-[10px] text-purple-400 hover:text-purple-300 font-mono truncate select-all flex items-center gap-0.5" title="Enlace directo público para entregas">
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
                      className={`p-1.5 border rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                        proj.isActive !== false 
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
          <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-xs">
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
        <div className="bg-[#111111] rounded-2xl p-6 border border-white/10 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/5 text-white rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Historial de Entregas</h2>
                <p className="text-xs text-white/40">Histórico de transferencias registradas</p>
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
                  className="p-4 border border-white/5 hover:border-white/10 bg-[#0d0d0d] rounded-xl hover:shadow-xs transition-all space-y-3"
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
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
