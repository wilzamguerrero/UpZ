import React, { useEffect, useState } from "react";
import { Loader2, Save, RefreshCcw, Table as TableIcon, Check } from "lucide-react";
import { Project, ProjectMeta, Submission, DbColumn } from "../types";

interface GradingTableProps {
  project: Project;
  meta?: ProjectMeta;
  submissions: Submission[];
  refreshSubmissions: () => Promise<void>;
}

interface DbRow {
  pageId: string;
  values: Record<string, any>;
}

/**
 * Per-project grading table (point 9).
 * - Database mode: reads rows from the project's Notion database and edits control columns.
 * - No-database mode: reads submissions (KV) and edits controlValues, persisted via /api/submission-grade.
 */
export default function GradingTable({ project, meta, submissions, refreshSubmissions }: GradingTableProps) {
  const useDb = !!meta?.useDatabase && !!meta?.databaseId;
  const controlColumns: DbColumn[] = meta?.dbColumns || [];

  const [dbRows, setDbRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Local edits for no-db mode: submissionId -> { colId: value }
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  const projectSubs = submissions.filter((s) => s.projectId === project.id);

  const loadDbRows = async () => {
    if (!useDb) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/db-rows?databaseId=${meta!.databaseId}`);
      const data = await res.json();
      if (data.success) setDbRows(data.rows || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (useDb) loadDbRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, meta?.databaseId]);

  /** Save one control column for a Notion database row. */
  const saveDbCell = async (pageId: string, col: DbColumn, value: any) => {
    setSavingKey(`${pageId}:${col.id}`);
    try {
      await fetch("/api/projects/db-rows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          updates: { [col.name]: { type: col.type, value } },
        }),
      });
      await loadDbRows();
    } finally {
      setSavingKey(null);
    }
  };

  /** Save control values for a no-db submission. */
  const saveSubmissionGrade = async (submissionId: string) => {
    setSavingKey(submissionId);
    try {
      await fetch("/api/submission-grade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          controlValues: edits[submissionId] || {},
        }),
      });
      await refreshSubmissions();
    } finally {
      setSavingKey(null);
    }
  };

  // ---- Database mode rendering ----
  if (useDb) {
    const baseCols = ["Nombre", "Correo", "Fecha de envío", "Archivos"];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
            <TableIcon className="w-3 h-3" /> Tabla (base de datos Notion)
          </span>
          <button
            type="button"
            onClick={loadDbRows}
            className="text-[10px] text-white/50 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCcw className="w-3 h-3" /> Actualizar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-white/40 text-xs py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando filas...
          </div>
        ) : dbRows.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-4">Sin filas todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  {baseCols.map((c) => (
                    <th key={c} className="py-2 px-2 font-semibold whitespace-nowrap">{c}</th>
                  ))}
                  {controlColumns.map((c) => (
                    <th key={c.id} className="py-2 px-2 font-semibold whitespace-nowrap text-emerald-400">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbRows.map((row) => (
                  <tr key={row.pageId} className="border-b border-white/5 hover:bg-white/5">
                    {baseCols.map((c) => (
                      <td key={c} className="py-1.5 px-2 text-white/70 max-w-[160px] truncate">
                        {String(row.values[c] ?? "")}
                      </td>
                    ))}
                    {controlColumns.map((col) => (
                      <td key={col.id} className="py-1.5 px-2">
                        <ControlInput
                          col={col}
                          value={row.values[col.name]}
                          saving={savingKey === `${row.pageId}:${col.id}`}
                          onCommit={(v) => saveDbCell(row.pageId, col, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---- No-database mode rendering (KV submissions) ----
  return (
    <div className="space-y-3">
      <span className="text-[10px] text-white/50 font-semibold flex items-center gap-1">
        <TableIcon className="w-3 h-3" /> Tabla (modo sin base de datos)
      </span>
      {projectSubs.length === 0 ? (
        <p className="text-xs text-white/40 text-center py-4">Sin entregas todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/10">
                <th className="py-2 px-2 font-semibold">Nombre</th>
                <th className="py-2 px-2 font-semibold">Correo</th>
                <th className="py-2 px-2 font-semibold">Fecha</th>
                {controlColumns.map((c) => (
                  <th key={c.id} className="py-2 px-2 font-semibold text-emerald-400 whitespace-nowrap">{c.name}</th>
                ))}
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {projectSubs.map((sub) => {
                const current = edits[sub.id] || sub.controlValues || {};
                return (
                  <tr key={sub.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 px-2 text-white/80">{sub.senderName}</td>
                    <td className="py-1.5 px-2 text-white/60">{sub.senderEmail}</td>
                    <td className="py-1.5 px-2 text-white/50 whitespace-nowrap">{new Date(sub.timestamp).toLocaleDateString()}</td>
                    {controlColumns.map((col) => (
                      <td key={col.id} className="py-1.5 px-2">
                        <ControlInput
                          col={col}
                          value={current[col.id]}
                          saving={false}
                          onCommit={(v) =>
                            setEdits((prev) => ({
                              ...prev,
                              [sub.id]: { ...(prev[sub.id] || sub.controlValues || {}), [col.id]: String(v) },
                            }))
                          }
                        />
                      </td>
                    ))}
                    <td className="py-1.5 px-2">
                      <button
                        type="button"
                        onClick={() => saveSubmissionGrade(sub.id)}
                        disabled={savingKey === sub.id}
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                        title="Guardar"
                      >
                        {savingKey === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {controlColumns.length === 0 && (
        <p className="text-[10px] text-amber-400/70 text-center">
          Define columnas de control (Nota, Estado...) en “Personalizar Textos” para poder calificar.
        </p>
      )}
    </div>
  );
}

/** Editable cell input adapting to the column type. */
function ControlInput({
  col,
  value,
  saving,
  onCommit,
}: {
  col: DbColumn;
  value: any;
  saving: boolean;
  onCommit: (value: any) => void;
}) {
  const [local, setLocal] = useState<any>(value ?? "");
  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  const base =
    "w-full min-w-[80px] px-2 py-1 bg-[#0d0d0d] border border-white/10 rounded-lg text-xs text-white focus:border-white/30 focus:outline-none";

  if (col.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => {
          setLocal(e.target.checked);
          onCommit(e.target.checked);
        }}
        className="w-4 h-4 rounded cursor-pointer"
      />
    );
  }

  if (col.type === "select") {
    return (
      <select
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          onCommit(e.target.value);
        }}
        className={`${base} cursor-pointer`}
      >
        <option value=""></option>
        {(col.options || []).map((o) => (
          <option key={o} value={o} className="bg-[#111]">{o}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        className={base}
      />
      {saving && <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" />}
    </div>
  );
}
