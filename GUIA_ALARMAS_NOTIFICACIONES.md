# Guia para implementar alarmas y notificaciones programadas en una app web

Este documento sirve como instruccion para que otra IA implemente un sistema completo de alarmas con notificaciones dentro de cualquier proyecto web parecido a este. El sistema funciona tanto con la app abierta como cerrada.

## Que hace este sistema

- Programar alarmas con fecha y hora exactas
- Mostrar un toast animado dentro de la app cuando llega la hora
- Mostrar una notificacion nativa del sistema operativo (movil y escritorio) aunque la app este cerrada
- Reproducir un sonido de alarma configurable (repetible de 1 a 10 veces)
- Repetir la alarma en intervalos de minutos, diariamente o semanalmente
- Editar cualquier alarma (pendiente o del historial) desde el panel
- Reactivar alarmas pasadas con un click
- Persistir las alarmas en `localStorage` para que sobrevivan recargas
- Panel colapsable integrado en la barra lateral de la app

---

## Tecnologias necesarias

- React 18+ con TypeScript
- `motion/react` (Framer Motion) para animaciones del toast
- `lucide-react` para iconos
- Web Audio API (sin dependencias externas) para el sonido
- Notifications API del navegador para notificaciones nativas
- Service Worker para disparar notificaciones cuando la app esta cerrada
- CSS con variables para adaptar al tema de la app

---

## Archivos a crear o modificar

| Archivo | Tipo | Descripcion |
|---|---|---|
| `components/NotificationCenter.tsx` | Nuevo | Componente principal con todo el sistema |
| `public/notification-sw.js` | Nuevo | Service Worker de alarmas en background |
| `App.tsx` o layout principal | Modificar | Registrar SW, montar panel y overlay |

---

## Paso 1. Interface de datos

Definir la estructura de una notificacion programada:

```ts
export interface ScheduledNotification {
  id: string;
  title: string;
  message: string;
  scheduledAt: number;       // timestamp unix en milisegundos
  repeat: 'none' | 'daily' | 'weekly';
  repeatMinutes: number | null; // si es un numero, tiene prioridad sobre repeat
  sound: boolean;
  soundRepeat: number;       // 1 a 10, cuantas veces suena la alarma
  fired: boolean;
  createdAt: number;
}

export interface ActiveToast {
  id: string;
  title: string;
  message: string;
  sound: boolean;
  soundRepeat: number;
}
```

---

## Paso 2. Sonido de alarma con Web Audio API

Implementar sin dependencias externas. Acepta un parametro `times` para repetir el patron de pulsos:

```ts
function playAlarm(times = 3) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const ROUND = 1.1; // segundos por repeticion
    for (let r = 0; r < times; r++) {
      const base = r * ROUND;
      for (const t of [0, 0.32, 0.64]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime + base + t);
        osc.frequency.linearRampToValueAtTime(1100, ctx.currentTime + base + t + 0.12);
        gain.gain.setValueAtTime(0, ctx.currentTime + base + t);
        gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + base + t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + base + t + 0.28);
        osc.start(ctx.currentTime + base + t);
        osc.stop(ctx.currentTime + base + t + 0.3);
      }
    }
    setTimeout(() => ctx.close().catch(() => {}), (times * ROUND + 0.6) * 1000);
  } catch {}
}
```

---

## Paso 3. Persistencia en localStorage

```ts
const NOTIF_STORAGE_KEY = 'app-notifications'; // cambiar el prefijo segun la app

function loadNotifications(): ScheduledNotification[] {
  try {
    const v = localStorage.getItem(NOTIF_STORAGE_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

function saveNotifications(list: ScheduledNotification[]) {
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(list));
}
```

---

## Paso 4. Comunicacion con el Service Worker

```ts
async function getActiveSW(): Promise<ServiceWorker | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.active;
  } catch {
    return null;
  }
}

async function scheduleViaSW(notif: ScheduledNotification) {
  const sw = await getActiveSW();
  sw?.postMessage({ type: 'SCHEDULE_NOTIFICATION', notification: notif });
}

async function cancelViaSW(notifId: string) {
  const sw = await getActiveSW();
  sw?.postMessage({ type: 'CANCEL_NOTIFICATION', notifId });
}
```

---

## Paso 5. Toast overlay (componente de notificacion dentro de la app)

El toast es permanente — no desaparece solo, el usuario debe cerrarlo:

```tsx
function NotifToast({ toast, onDismiss }: { toast: ActiveToast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.sound) playAlarm(toast.soundRepeat ?? 3);
  }, [toast.id, toast.sound]);

  return (
    <motion.div
      className="notif-toast"
      initial={{ opacity: 0, y: -72, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -48, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      {/* Anillo de pulso animado */}
      <div className="notif-toast-pulse" />
      <div className="notif-toast-icon">
        <AlarmClock size={18} />
      </div>
      <div className="notif-toast-body">
        <div className="notif-toast-title">{toast.title}</div>
        {toast.message && <div className="notif-toast-message">{toast.message}</div>}
      </div>
      <button className="notif-toast-close" onClick={() => onDismiss(toast.id)}>
        <X size={14} />
      </button>
    </motion.div>
  );
}

// Montar via createPortal en document.body para que aparezca encima de todo
export function NotifOverlay({ toasts, onDismiss }: { toasts: ActiveToast[]; onDismiss: (id: string) => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="notif-overlay-container" aria-live="polite">
      <AnimatePresence mode="sync">
        {toasts.map(t => (
          <NotifToast key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
```

CSS del overlay (posicionado en la parte superior centrado, z-index maximo):

```css
.notif-overlay-container {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
  width: min(420px, 90vw);
}

.notif-toast {
  pointer-events: all;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px 14px 16px;
  width: 100%;
  background: var(--popup-bg, #2a2a2a);
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(20px);
}

.notif-toast-pulse {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  animation: notif-pulse-ring 1.8s ease-out 2;
  border: 2px solid rgba(var(--accent-rgb), 0.35);
  pointer-events: none;
}
@keyframes notif-pulse-ring {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.04); }
}

.notif-toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
  animation: notif-bell-shake 0.5s ease 0.1s;
}
@keyframes notif-bell-shake {
  0%, 100% { transform: rotate(0deg); }
  20%       { transform: rotate(-14deg); }
  40%       { transform: rotate(14deg); }
  60%       { transform: rotate(-8deg); }
  80%       { transform: rotate(8deg); }
}
```

---

## Paso 6. Formulario para crear/editar alarmas

El formulario recibe una prop `prefill` opcional. Si se edita una alarma pendiente, se carga su fecha original; si es del historial (ya disparada), se defecto a +5 min desde ahora.

Campos:
- `title` — texto corto
- `message` — descripcion opcional
- `datetime-local` — fecha y hora
- `repeat` — select con opciones: `Sin repeticion`, `Cada X minutos`, `Cada dia`, `Cada semana`
- Pills de minutos — visibles solo cuando se elige "Cada X minutos": `[1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60]`
- Boton de sonido — toggle activo/inactivo
- Slider de repeticion — slider `range` de 1 a 10, visible solo cuando el sonido esta activo

```tsx
const [dateStr, setDateStr] = useState(() => {
  // Si es edicion de alarma futura, usar su hora; si no, +5 min desde ahora
  const d = (prefill?.scheduledAt && prefill.scheduledAt > Date.now())
    ? new Date(prefill.scheduledAt)
    : new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
});
```

Validacion antes de enviar:
- titulo no vacio
- fecha en el futuro (mayor a `Date.now()`)

---

## Paso 7. Logica de polling (disparar alarmas con la app abierta)

Un `setInterval` de 10 segundos revisa si algun timestamp ya paso. Cuando lo encuentra:

1. Dispara el toast en la UI (llama a `onFireToast`)
2. Muestra una notificacion nativa del sistema via Service Worker (`showNotification`) — esto funciona aunque la pestaña este en segundo plano
3. Actualiza el estado segun el tipo de repeticion

```ts
const fireNative = (notif: ScheduledNotification) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  navigator.serviceWorker?.ready.then(reg => {
    reg.showNotification(notif.title, {
      body: notif.message || undefined,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: notif.id,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { notifId: notif.id },
    } as NotificationOptions).catch(() => {
      // fallback si el SW no puede mostrarla
      new Notification(notif.title, { body: notif.message || undefined, icon: '/icon-192.png' });
    });
  }).catch(() => {
    new Notification(notif.title, { body: notif.message || undefined });
  });
};

// Dentro del polling check:
if (!n.fired && n.scheduledAt <= now) {
  onFireToast({ id: n.id, title: n.title, message: n.message, sound: n.sound, soundRepeat: n.soundRepeat ?? 3 });
  fireNative(n);

  if (n.repeatMinutes != null) {
    return { ...n, scheduledAt: n.scheduledAt + n.repeatMinutes * 60_000 };
  }
  if (n.repeat === 'none') return { ...n, fired: true };
  const delta = n.repeat === 'daily' ? 86_400_000 : 604_800_000;
  return { ...n, scheduledAt: n.scheduledAt + delta };
}
```

---

## Paso 8. Service Worker de notificaciones en background

Crear `public/notification-sw.js`. Este archivo es independiente del service worker PWA (si existe uno). Puede convivir sin problema.

El SW persiste las alarmas en la Cache API (no en localStorage, que no esta disponible en SW):

```js
const CACHE_NAME = 'app-notif-v1';
const STORE_URL = '/app-notif-data';

async function loadNotifications() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match(STORE_URL);
    if (resp) return await resp.json();
  } catch {}
  return [];
}

async function saveNotifications(list) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(STORE_URL, new Response(JSON.stringify(list), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch {}
}
```

Funcion principal que programa un `setTimeout` por cada alarma:

```js
const pendingTimers = new Map();

function scheduleNotif(notif) {
  const delay = notif.scheduledAt - Date.now();
  if (delay <= 0 || delay > 2_147_483_647) return; // limite de setTimeout

  if (pendingTimers.has(notif.id)) clearTimeout(pendingTimers.get(notif.id));

  const timer = setTimeout(async () => {
    pendingTimers.delete(notif.id);

    try {
      await self.registration.showNotification(notif.title, {
        body: notif.message || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: notif.id,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { notifId: notif.id },
      });
    } catch {}

    // Actualizar cache segun tipo de repeticion
    const all = await loadNotifications();
    let updated;
    if (notif.repeatMinutes != null) {
      updated = all.map(n => n.id === notif.id ? { ...n, scheduledAt: n.scheduledAt + notif.repeatMinutes * 60_000 } : n);
      const refreshed = updated.find(n => n.id === notif.id);
      if (refreshed) scheduleNotif(refreshed);
    } else if (notif.repeat === 'none') {
      updated = all.map(n => n.id === notif.id ? { ...n, fired: true } : n);
    } else {
      const delta = notif.repeat === 'daily' ? 86_400_000 : 604_800_000;
      updated = all.map(n => n.id === notif.id ? { ...n, scheduledAt: n.scheduledAt + delta } : n);
      const refreshed = updated.find(n => n.id === notif.id);
      if (refreshed) scheduleNotif(refreshed);
    }
    await saveNotifications(updated);

    // Avisar a las pestanas abiertas
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'NOTIFICATION_FIRED', notifId: notif.id });
    }
  }, delay);

  pendingTimers.set(notif.id, timer);
}
```

Eventos del SW:

```js
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // Re-programar alarmas pendientes al activarse (ej. despues de reiniciar el navegador)
    const notifications = await loadNotifications();
    const now = Date.now();
    for (const n of notifications) {
      if (!n.fired && n.scheduledAt > now) scheduleNotif(n);
    }
  })());
});

self.addEventListener('message', event => {
  const { type, notification, notifId } = event.data || {};

  if (type === 'SCHEDULE_NOTIFICATION') {
    (async () => {
      const all = await loadNotifications();
      const updated = all.filter(n => n.id !== notification.id);
      updated.push(notification);
      await saveNotifications(updated);
      scheduleNotif(notification);
    })();
  }

  if (type === 'CANCEL_NOTIFICATION') {
    if (pendingTimers.has(notifId)) {
      clearTimeout(pendingTimers.get(notifId));
      pendingTimers.delete(notifId);
    }
    (async () => {
      const all = await loadNotifications();
      await saveNotifications(all.filter(n => n.id !== notifId));
    })();
  }

  if (type === 'CLEAR_ALL') {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    saveNotifications([]);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
```

---

## Paso 9. Registrar el Service Worker en el frontend

Hacerlo siempre al cargar la app, sin esperar a que el usuario acepte permisos:

```ts
// En el componente raiz o en un useEffect de App
useEffect(() => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/notification-sw.js').catch(() => {});
}, []);
```

---

## Paso 10. Pedir permiso de notificaciones al usuario

Solo se puede pedir con un gesto del usuario (click). Mostrar un boton visible en el panel si el permiso no esta concedido:

```ts
const requestPermission = async () => {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  setPermissionState(perm);
  if (perm === 'granted' && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/notification-sw.js');
      // Re-enviar alarmas pendientes al SW ahora que tenemos permiso
      const pending = loadNotifications().filter(n => !n.fired && n.scheduledAt > Date.now());
      for (const n of pending) await scheduleViaSW(n);
    } catch {}
  }
};
```

Si `Notification.permission === 'granted'` ya desde el inicio, no hace falta volver a pedirlo.

---

## Paso 11. Escuchar eventos del SW (sincronizar estado cuando la app vuelve al foco)

```ts
useEffect(() => {
  if (!('serviceWorker' in navigator)) return;
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'NOTIFICATION_FIRED') {
      const { notifId } = event.data;
      setNotifications(prev =>
        prev.map(n => n.id === notifId && !n.fired ? { ...n, fired: true } : n)
      );
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}, []);
```

---

## Paso 12. Montar el panel y el overlay en el layout principal

```tsx
// En el componente App o layout raiz:

const [activeToasts, setActiveToasts] = useState<ActiveToast[]>([]);

const handleFireToast = useCallback((toast: ActiveToast) => {
  setActiveToasts(prev => prev.some(t => t.id === toast.id) ? prev : [...prev, toast]);
}, []);

const handleDismissToast = useCallback((id: string) => {
  setActiveToasts(prev => prev.filter(t => t.id !== id));
}, []);

// En la barra lateral (el panel se queda fijo al fondo):
<div className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
    {/* contenido normal del sidebar: arbol de archivos, etc. */}
  </div>
  <NotificationCenter onFireToast={handleFireToast} />
</div>

// Fuera del sidebar, cerca del final del JSX raiz:
<NotifOverlay toasts={activeToasts} onDismiss={handleDismissToast} />
```

La estructura `flex + flex-1 + min-h-0` es importante: permite que el contenido del sidebar sea scrollable mientras el panel de notificaciones queda pegado abajo.

---

## Variables CSS necesarias

El componente usa estas variables CSS. Si la app no las tiene, definirlas en el `<style>` global o en `:root`:

```css
:root {
  --bg: #111;
  --surface: #1a1a1a;
  --surface2: #222;
  --border: rgba(255,255,255,0.07);
  --border-strong: rgba(255,255,255,0.13);
  --accent: #00ffcb;           /* color principal de la app */
  --accent-rgb: 0, 255, 203;   /* mismo color en formato R,G,B sin #, para rgba() */
  --text: #e8e8e8;
  --text-muted: #999;
  --text-faint: #555;
  --btn-hover: rgba(255,255,255,0.05);
  --popup-bg: #2a2a2a;
  --popup-border: rgba(255,255,255,0.12);
}
```

La variable `--accent-rgb` es obligatoria para los fondos con opacidad (`rgba(var(--accent-rgb), 0.15)`).

---

## Limitaciones conocidas

| Situacion | Comportamiento |
|---|---|
| App cerrada mas de 1-2 dias | El navegador puede terminar el SW; las alarmas se re-programan la proxima vez que se abre la app |
| iOS Safari | `showNotification()` desde SW no esta soportado (restriccion de Apple). Solo funciona la notificacion interna del toast |
| Navegador sin permiso | Solo suena la alarma y aparece el toast dentro de la app; no sale notificacion del sistema |
| `setTimeout` en SW | Tiene un limite de ~24.8 dias (`2_147_483_647 ms`). Alarmas a mas de ese plazo no se programan en el SW (si funcionan via polling cuando la app esta abierta) |
| Pagina en segundo plano (no cerrada) | El polling sigue corriendo cada 10s; la notificacion nativa se muestra correctamente via SW |

---

## Checklist de implementacion

- `ScheduledNotification` interface con todos los campos incluyendo `repeatMinutes` y `soundRepeat`
- `playAlarm(times)` con Web Audio API
- `localStorage` helpers para cargar y guardar
- `scheduleViaSW` y `cancelViaSW` para comunicarse con el SW
- `NotifToast` — permanente, solo se cierra con click
- `NotifOverlay` — montado en `document.body` via `createPortal`
- Formulario con: titulo, mensaje, datetime-local, select de repeticion, pills de minutos, toggle sonido, slider repeticion sonido
- Formulario carga fecha original al editar alarma futura
- Polling `setInterval` de 10s con `fireNative` para notificacion del sistema
- Filas con boton editar (lapiz) para pendientes y reactivar (flecha) para historial
- SW `notification-sw.js` en carpeta publica con: `install`, `activate`, `message`, `notificationclick`
- SW re-programa alarmas al activarse (sobrevive reinicio del navegador)
- SW registrado en frontend siempre al cargar (no condicionado al permiso)
- Permiso pedido con boton visible cuando aun no esta concedido
- Listener de mensaje SW en el componente para sincronizar estado
- `NotificationCenter` montado al fondo del sidebar
- `NotifOverlay` montado fuera del sidebar en el layout raiz
- Variables CSS `--accent` y `--accent-rgb` definidas

---

## Instruccion breve para pasar a otra IA

Implementa un sistema completo de alarmas programadas en este proyecto siguiendo esta guia. Necesito que:

1. Crees el componente `NotificationCenter` con formulario, panel colapsable y toast overlay
2. Crees el archivo `public/notification-sw.js` para disparar notificaciones cuando la app este cerrada
3. Registres el SW y montes el panel en el layout principal
4. El toast dentro de la app no desaparezca solo, solo se cierre con click del usuario
5. Se muestre notificacion nativa del sistema tanto con la app abierta como cerrada
6. El sonido sea configurable con un slider de 1 a 10 repeticiones
7. Se puedan editar alarmas pendientes y reactivar alarmas del historial
8. Las alarmas soporten repeticion por minutos, diaria y semanal
9. Todo el CSS use variables del tema de la app para integrarse visualmente
