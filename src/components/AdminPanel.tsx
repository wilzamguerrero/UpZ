import React, { useState, useEffect } from "react";
import { 
  Settings, Key, FolderPlus, FileSpreadsheet, Eye, EyeOff, Check, 
  AlertCircle, Plus, Search, Mail, Calendar, ExternalLink, Download, ArrowRight, Trash2 
} from "lucide-react";
import { Project, Submission, NotionConfig, ProjectMeta } from "../types";

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
  const [copyStep1, setCopyStep1] = useState("");
  const [copyStep2, setCopyStep2] = useState("");
  const [copyStep3, setCopyStep3] = useState("");
  const [copyExpiration, setCopyExpiration] = useState("");
  const [copyBackground, setCopyBackground] = useState("");
  const [copyIsActive, setCopyIsActive] = useState(true);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
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
        step1: "Identifícate: Escribe tu nombre, correo y selecciona la carpeta de destino.",
        step2: "Sube Archivos: Arrastra y suelta tus fotos, PDFs o renders en el dropzone.",
        step3: "Organización Instantánea: Todo se agrupa automáticamente en Notion listo para tu supervisor.",
        expirationDate: "",
        backgroundImage: "",
        isActive: true
      };
      setCopyTitle(active.title);
      setCopyDesc(active.description);
      setCopyStep1(active.step1);
      setCopyStep2(active.step2);
      setCopyStep3(active.step3);
      setCopyExpiration(active.expirationDate || "");
      setCopyBackground(active.backgroundImage || "");
      setCopyIsActive(active.isActive !== false);
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
          step1: copyStep1,
          step2: copyStep2,
          step3: copyStep3,
          expirationDate: copyExpiration,
          backgroundImage: copyBackground,
          isActive: copyIsActive,
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

  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBg(true);
    const formData = new FormData();
    formData.append("bgImage", file);

    try {
      const res = await fetch("/api/projects/upload-bg", {
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
      step1: "Identifícate: Escribe tu nombre, correo y selecciona la carpeta de destino.",
      step2: "Sube Archivos: Arrastra y suelta tus fotos, PDFs o renders en el dropzone.",
      step3: "Organización Instantánea: Todo se agrupa automáticamente en Notion listo para tu supervisor.",
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

              <div className="flex items-center gap-2 p-1.5 bg-[#0d0d0d] border border-white/5 rounded-xl">
                <input
                  type="checkbox"
                  id="project-active-checkbox"
                  checked={copyIsActive}
                  onChange={(e) => setCopyIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-black border-white/10 bg-[#0d0d0d] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="project-active-checkbox" className="text-[11px] font-bold text-white/80 cursor-pointer select-none">
                  Proyecto Activo (Permitir entregas)
                </label>
              </div>

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

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Paso 1 (Identificación)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Escribe el paso"
                  value={copyStep1}
                  onChange={(e) => setCopyStep1(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Paso 2 (Subida de Archivos)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Escribe el paso"
                  value={copyStep2}
                  onChange={(e) => setCopyStep2(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Paso 3 (Resultado)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Escribe el paso"
                  value={copyStep3}
                  onChange={(e) => setCopyStep3(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/40 mb-1.5 uppercase tracking-wide">
                  Fecha y Hora de Vencimiento (Límite)
                </label>
                <input
                  type="datetime-local"
                  placeholder="Sin fecha límite"
                  value={copyExpiration}
                  onChange={(e) => setCopyExpiration(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-white/10 rounded-xl text-xs focus:border-white/30 focus:outline-none text-white transition-all cursor-pointer pointer-events-auto"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
              {projects.map((proj) => (
                <div 
                  key={proj.id} 
                  onClick={() => setSelectedMetaProjectId(proj.id)}
                  className={`p-3 border rounded-xl flex items-center justify-between transition-all cursor-pointer group animate-fade-in ${
                    proj.id === selectedMetaProjectId 
                      ? "border-white/30 bg-white/5" 
                      : proj.isActive !== false
                        ? "border-white/5 bg-[#0d0d0d] hover:border-white/12"
                        : "border-dashed border-red-900/40 bg-red-950/5 hover:border-red-900/60"
                  }`}
                  title="Haz clic para personalizar los textos de este proyecto"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-semibold text-white/95 truncate">{proj.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/40 font-mono">
                        {getSubmissionsCountForProject(proj.id)} entregas
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
