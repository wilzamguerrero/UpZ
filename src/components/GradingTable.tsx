import React, { useEffect, useState } from "react";
import { Loader2, Save, RefreshCcw, Table as TableIcon, Check, Calculator } from "lucide-react";
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
  // Whether the computed grades (latest feedback note per sender) are shown.
  const [calculated, setCalculated] = useState(false);

  const projectSubs = submissions.filter((s) => s.projectId === project.id);

  // Group submissions by sender (one row per person, so the count matches the
  // Remitentes panel). The most recent submission represents the person for
  // grading; the entry-order number (#) uses their earliest submission.
  const groupedSubs = (() => {
    const map = new Map<string, Submission[]>();
    for (const s of projectSubs) {
      const em = s.senderEmail.toLowerCase();
      if (!map.has(em)) map.set(em, []);
      (map.get(em) as Submission[]).push(s);
    }
    const rows = [...map.values()].map((subs) => {
      const sorted = [...subs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const earliest = sorted[0];
      const latest = sorted[sorted.length - 1];
      return {
        rep: latest,
        anchor: earliest, // feedback (history + draft) is stored on the earliest submission
        name: earliest.senderName,
        email: earliest.senderEmail,
        earliestTs: new Date(earliest.timestamp).getTime(),
        count: subs.length,
      };
    });
    rows.sort((a, b) => a.earliestTs - b.earliestTs);
    return rows.map((r, i) => ({ ...r, order: i + 1 }));
  })();

  /** Resolve the latest feedback note for a sender and whether it was sent or
   *  is still only saved as a draft. Prefers the most recent note available. */
  const computeLatestNote = (anchor?: Submission): { note: string; status: "enviado" | "guardado" | null } => {
    if (!anchor) return { note: "", status: null };
    const draft = anchor.feedbackDraft;
    const history = anchor.feedbackHistory || [];
    const lastSent = history.length ? history[history.length - 1] : null;
    // A draft is work-in-progress after the last send, so it's the latest note.
    if (draft && (draft.note || "").trim()) return { note: (draft.note || "").trim(), status: "guardado" };
    if (lastSent && (lastSent.note || "").trim()) return { note: (lastSent.note || "").trim(), status: "enviado" };
    if (draft) return { note: "", status: "guardado" };
    if (lastSent) return { note: "", status: "enviado" };
    return { note: "", status: null };
  };

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
          (() => {
            // Entry-order number (#1 = earliest) for database rows, by send date.
            const dbEntryOrder = new Map<string, number>();
            [...dbRows]
              .sort((a, b) => new Date(a.values["Fecha de envío"] || 0).getTime() - new Date(b.values["Fecha de envío"] || 0).getTime())
              .forEach((r, i) => dbEntryOrder.set(r.pageId, i + 1));
            return (
          <div className="w-full">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 px-2 font-semibold whitespace-nowrap">#</th>
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
                    <td className="py-1.5 px-2 text-white/40 font-mono">{dbEntryOrder.get(row.pageId)}</td>
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
            );
          })()
        )}
      </div>
    );
  }

  // ---- Grading table: computes the latest feedback note per sender on demand ----
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/50 font-semibold flex items-center gap-1">
          <TableIcon className="w-3 h-3" /> {groupedSubs.length} remitente{groupedSubs.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => setCalculated((v) => !v)}
          className="text-[10px] font-semibold flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
          title="Calcular las notas a partir de la última retroalimentación (enviada o guardada)"
        >
          <Calculator className="w-3 h-3" /> {calculated ? "Ocultar notas" : "Calcular notas"}
        </button>
      </div>
      {projectSubs.length === 0 ? (
        <p className="text-xs text-white/40 text-center py-4">Sin entregas todavía.</p>
      ) : (
        <div className="w-full">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/10">
                <th className="py-2 px-2 font-semibold">#</th>
                <th className="py-2 px-2 font-semibold">Nombre</th>
                <th className="py-2 px-2 font-semibold">Correo</th>
                <th className="py-2 px-2 font-semibold">Fecha</th>
                {calculated && <th className="py-2 px-2 font-semibold whitespace-nowrap">Nota</th>}
                {calculated && <th className="py-2 px-2 font-semibold whitespace-nowrap">Estado</th>}
              </tr>
            </thead>
            <tbody>
              {groupedSubs.map((row) => {
                const sub = row.rep;
                const { note, status } = computeLatestNote(row.anchor);
                return (
                  <tr key={sub.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 px-2 text-white/40 font-mono">{row.order}</td>
                    <td className="py-1.5 px-2 text-white/80">
                      {row.name}{row.count > 1 ? <span className="text-white/40 font-mono"> ({row.count})</span> : ""}
                    </td>
                    <td className="py-1.5 px-2 text-white/60">{row.email}</td>
                    <td className="py-1.5 px-2 text-white/50 whitespace-nowrap">{new Date(sub.timestamp).toLocaleDateString()}</td>
                    {calculated && (
                      <td className="py-1.5 px-2 font-mono font-bold text-white whitespace-nowrap">
                        {note || <span className="text-white/30 font-normal">—</span>}
                      </td>
                    )}
                    {calculated && (
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {status === "enviado" ? (
                          <span className="text-[10px] font-mono inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/15 text-white border border-white/25">
                            <Check className="w-3 h-3" /> Enviado
                          </span>
                        ) : status === "guardado" ? (
                          <span className="text-[10px] font-mono inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 text-white/60 border border-white/10">
                            <Save className="w-3 h-3" /> Guardado
                          </span>
                        ) : (
                          <span className="text-[10px] text-white/30 font-mono">Sin retro</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
