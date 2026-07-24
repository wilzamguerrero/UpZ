import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, X, ArrowRight, UploadCloud, CheckCheck, Trash2 } from "lucide-react";

/** One stored delivery notification (kept as a history in localStorage). */
interface DeliveryNotif {
  id: string;
  projectId: string;
  projectName: string;
  senderName: string;
  senderEmail: string;
  document: string;
  timestamp: string;
  read: boolean;
}

const HISTORY_KEY = "envi_delivery_history";
const MAX_HISTORY = 100;
const POLL_MS = 45000;

interface Props {
  /** True when the page background is light, so the bell matches the other nav icons. */
  light: boolean;
  /** Navigate the admin to a delivery (switch to admin tab + open activity + focus person). */
  onOpenDelivery: (projectId: string, email: string, document: string) => void;
}

const loadHistory = (): DeliveryNotif[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const saveHistory = (list: DeliveryNotif[]) => {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch { /* ignore */ }
};

// Ids ever seen (only grows). Kept separate from the visible history so that
// clearing the history never causes old deliveries to notify again.
const SEEN_KEY = "envi_notif_seen";
const loadSeen = (): Set<string> => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set<string>();
  }
};
const saveSeen = (s: Set<string>) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-3000))); } catch { /* ignore */ }
};

const timeAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString();
};

/**
 * Self-contained delivery notification center. Polls the light submissions list,
 * keeps a persistent history, shows a bell with an unread badge, a reopenable
 * panel, and (with permission) native OS notifications for new deliveries.
 */
const NotificationCenter: React.FC<Props> = ({ light, onOpenDelivery }) => {
  const [items, setItems] = useState<DeliveryNotif[]>(() => loadHistory());
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const seenRef = useRef<Set<string>>(loadSeen());
  const firstPollRef = useRef(true);

  const unread = items.reduce((n, i) => n + (i.read ? 0 : 1), 0);

  useEffect(() => { saveHistory(items); }, [items]);

  /** Show a native OS notification for freshly-arrived deliveries. Uses the page
   *  Notification API directly when there is no active service worker (e.g. local
   *  dev), and the SW's showNotification when one is registered (production). */
  const fireNative = useCallback((fresh: DeliveryNotif[]) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || fresh.length === 0) return;
    const title = fresh.length === 1 ? "Nueva entrega en ENVI" : "Nuevas entregas en ENVI";
    const n0 = fresh[0];
    const body = fresh.length === 1
      ? `${n0.senderName || n0.senderEmail || "Remitente"} · ${n0.projectName}`
      : `${fresh.length} entregas nuevas`;
    const data = fresh.length === 1
      ? { projectId: n0.projectId, email: n0.senderEmail, document: n0.document }
      : {};
    const opts: NotificationOptions = { body, icon: "/icon.svg", badge: "/icon.svg", tag: fresh.length === 1 ? n0.id : "envi-multi", data } as NotificationOptions;
    const viaPage = () => { try { new Notification(title, opts); } catch { /* ignore */ } };
    // getRegistration() resolves immediately (undefined when none) — unlike .ready
    // which hangs forever if no SW is registered (as in local dev).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration()
        .then((reg) => { if (reg && reg.active) reg.showNotification(title, opts).catch(viaPage); else viaPage(); })
        .catch(viaPage);
    } else {
      viaPage();
    }
  }, []);

  // Poll the light submissions list and merge new ones into the history.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/submissions");
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.submissions)) return;
        const incoming = data.submissions as any[];

        const seen = seenRef.current;
        const seenEmpty = seen.size === 0;                 // very first use ever
        const isFirstPoll = firstPollRef.current;          // first poll this session
        firstPollRef.current = false;

        const fresh = incoming.filter((s) => s && s.id && !seen.has(String(s.id)));
        if (fresh.length === 0) return;
        fresh.forEach((s) => seen.add(String(s.id)));
        saveSeen(seen);

        const mapped: DeliveryNotif[] = fresh.map((s) => ({
          id: String(s.id),
          projectId: String(s.projectId || ""),
          projectName: String(s.projectName || "Proyecto"),
          senderName: String(s.senderName || ""),
          senderEmail: String(s.senderEmail || ""),
          document: String(s.document || ""),
          timestamp: String(s.timestamp || new Date().toISOString()),
          read: seenEmpty, // first ever run → baseline (already read, no badge/native)
        }));

        setItems((prev) =>
          [...mapped, ...prev]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, MAX_HISTORY)
        );

        // Fire the OS notification only for deliveries detected AFTER the initial
        // load (real-time), never the baseline nor a burst on first page load.
        if (!seenEmpty && !isFirstPoll) fireNative(mapped);
      } catch { /* ignore network errors */ }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [fireNative]);

  const markAllRead = () => setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  const clearAll = () => setItems([]);
  const openItem = (n: DeliveryNotif) => {
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
    setOpen(false);
    onOpenDelivery(n.projectId, n.senderEmail, n.document);
  };
  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") {
        // Immediate confirmation so the user sees the native notification works.
        try { new Notification("Avisos activados", { body: "Te avisaremos aquí cuando llegue una entrega nueva.", icon: "/icon.svg" }); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  };

  const iconColor = light ? "#111111" : "rgba(255,255,255,0.6)";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notificaciones de entregas"
        className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:bg-black/10 relative"
        style={{ color: iconColor }}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Backdrop to close on outside click */}
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div className="fixed top-16 right-4 z-[71] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#0d0d0d] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-white/5 border-b border-white/10">
              <div className="flex items-center gap-2 text-white">
                <Bell className="w-4 h-4" />
                <span className="text-sm font-semibold">Notificaciones</span>
                {unread > 0 && (
                  <span className="text-[10px] font-mono font-bold bg-white/15 rounded-full px-2 py-0.5">{unread}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={markAllRead} title="Marcar todas como leídas" className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10">
                  <CheckCheck className="w-4 h-4" />
                </button>
                <button type="button" onClick={clearAll} title="Limpiar historial" className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setOpen(false)} title="Cerrar" className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {permission !== "granted" && (
              <button
                type="button"
                onClick={requestPermission}
                className="w-full text-left px-3 py-2 bg-white/[0.03] border-b border-white/10 text-[11px] text-white/70 hover:bg-white/[0.06] transition-colors flex items-center gap-2"
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                Activar avisos del sistema para ver las entregas nuevas en tu escritorio.
              </button>
            )}

            <div className="max-h-[380px] overflow-y-auto divide-y divide-white/5">
              {items.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-white/40">Sin notificaciones por ahora.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-start gap-2.5 ${n.read ? "" : "bg-white/[0.04]"}`}
                  >
                    <div className="relative w-7 h-7 rounded-md bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <UploadCloud className="w-3.5 h-3.5 text-white/70" />
                      {!n.read && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs truncate ${n.read ? "font-medium text-white/80" : "font-semibold text-white"}`}>
                        {n.senderName || n.senderEmail || "Remitente"}
                      </div>
                      <div className="text-[11px] text-white/50 truncate">{n.projectName}</div>
                      <div className="text-[10px] text-white/30 font-mono mt-0.5">{timeAgo(n.timestamp)}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-white/30 shrink-0 mt-1" />
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};

export default NotificationCenter;
