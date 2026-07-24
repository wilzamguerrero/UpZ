// Envío de correos usando la Gmail API por HTTP (OAuth2 refresh token).
// Funciona tanto en Cloudflare Workers/Pages Functions como en Node (usa fetch),
// porque NO usa SMTP (que Cloudflare no soporta).

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Correo Gmail remitente (debe ser la cuenta dueña del refresh token). */
  sender: string;
  /** Nombre visible del remitente (ej: "ENVI"). */
  senderName?: string;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  /** Raw file bytes. */
  content: Uint8Array;
  /** If set, the part is referenced from the HTML via `cid:<contentId>`. */
  contentId?: string;
  /** Render inline (e.g. an image in the header) instead of as a download. */
  inline?: boolean;
}

export interface MailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

/** ¿Están completas las credenciales de Gmail? */
export function hasGmailCredentials(creds: Partial<GmailCredentials> | null | undefined): boolean {
  return !!(creds && creds.clientId && creds.clientSecret && creds.refreshToken && creds.sender);
}

/** UTF-8 → base64 estándar (funciona en Workers y Node). */
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const g = globalThis as any;
  // En Node existe Buffer; en Cloudflare Workers existe btoa.
  if (typeof g.Buffer !== "undefined") {
    return g.Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return g.btoa(binary);
}

/** base64 → base64url (sin +, /, ni relleno =), requerido por la Gmail API. */
function toBase64Url(input: string): string {
  return toBase64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Bytes binarios → base64 estándar (para adjuntos). */
function bytesToBase64(bytes: Uint8Array): string {
  const g = globalThis as any;
  if (typeof g.Buffer !== "undefined") {
    return g.Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return g.btoa(binary);
}

/** Parte líneas base64 en tramos de 76 caracteres (recomendado por MIME). */
function wrap76(base64: string): string {
  return (base64.match(/.{1,76}/g) || []).join("\r\n");
}

/** Nombre de archivo seguro para cabeceras MIME (evita comillas/saltos). */
function sanitizeFilename(name: string): string {
  return (name || "archivo").replace(/["\r\n]/g, "_");
}

/** Codifica un asunto con acentos según RFC 2047. */
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject; // solo ASCII, sin codificar
  return `=?UTF-8?B?${toBase64(subject)}?=`;
}

/** Intercambia el refresh token por un access token de Google. */
async function getAccessToken(creds: GmailCredentials): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `No se pudo obtener el access token de Google (${res.status}): ${data.error_description || data.error || "desconocido"}`
    );
  }
  return data.access_token as string;
}

/** Construye el mensaje MIME (raw) listo para la Gmail API. */
function buildRawMessage(creds: GmailCredentials, mail: MailInput): string {
  const fromName = creds.senderName || "ENVI";
  const toHeader = mail.toName ? `${mail.toName} <${mail.to}>` : mail.to;
  const htmlB64 = wrap76(toBase64(mail.html));
  const attachments = mail.attachments || [];

  // Sin adjuntos: mensaje simple text/html en base64.
  if (attachments.length === 0) {
    const headers = [
      `From: ${fromName} <${creds.sender}>`,
      `To: ${toHeader}`,
      `Subject: ${encodeSubject(mail.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ];
    return `${headers.join("\r\n")}\r\n\r\n${htmlB64}`;
  }

  // Con adjuntos: multipart/mixed (cuerpo HTML + cada archivo como adjunto).
  const boundary = `envi_boundary_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const headers = [
    `From: ${fromName} <${creds.sender}>`,
    `To: ${toHeader}`,
    `Subject: ${encodeSubject(mail.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push("Content-Type: text/html; charset=UTF-8");
  parts.push("Content-Transfer-Encoding: base64");
  parts.push("");
  parts.push(htmlB64);

  for (const att of attachments) {
    const filename = sanitizeFilename(att.filename);
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.contentType || "application/octet-stream"}; name="${filename}"`);
    if (att.inline || att.contentId) {
      // Inline part referenced from the HTML via cid: (e.g. the header icon).
      parts.push(`Content-Disposition: inline; filename="${filename}"`);
      if (att.contentId) parts.push(`Content-ID: <${att.contentId}>`);
    } else {
      parts.push(`Content-Disposition: attachment; filename="${filename}"`);
    }
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("");
    parts.push(wrap76(bytesToBase64(att.content)));
  }
  parts.push(`--${boundary}--`);

  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

/** Envía un correo con la Gmail API. Lanza error si falla. */
export async function sendGmailMessage(creds: GmailCredentials, mail: MailInput): Promise<void> {
  if (!hasGmailCredentials(creds)) {
    throw new Error("Faltan credenciales de Gmail API (client id, secret, refresh token o sender).");
  }
  const accessToken = await getAccessToken(creds);
  const raw = toBase64Url(buildRawMessage(creds, mail));

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail API error (${res.status}): ${errText}`);
  }
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Escapes HTML and turns http(s) URLs into clickable links (good email formatting). */
const linkifyHtml = (text: string, linkColor = "#7fb2ff"): string => {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    // Move trailing punctuation out of the link.
    const trailingMatch = url.match(/[.,;:!?)]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const clean = trailing ? url.slice(0, -trailing.length) : url;
    return `<a href="${clean}" target="_blank" style="color:${linkColor};text-decoration:underline;word-break:break-all;">${clean}</a>${trailing}`;
  });
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/** Normaliza un color hex (#rgb o #rrggbb). Devuelve "" si no es válido. */
const normalizeHex = (raw?: string): string => {
  if (!raw) return "";
  const h = raw.replace("#", "").trim();
  if (h.length === 3 && /^[0-9a-fA-F]{3}$/.test(h)) {
    return "#" + h.split("").map((c) => c + c).join("");
  }
  if (h.length === 6 && /^[0-9a-fA-F]{6}$/.test(h)) return "#" + h;
  return "";
};

/** ¿El color es claro? (para decidir texto oscuro/claro encima). */
const isLightColor = (hex: string): boolean => {
  const h = normalizeHex(hex).replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
};

/** Genera el recibo (asunto + HTML + texto plano) para un envío. */
export function buildReceiptEmail(data: {
  senderName: string;
  senderEmail: string;
  projectName: string;
  timestamp: string;
  files: { name: string; size: number }[];
  /** Color de fondo del proyecto (hex). Se usa en la cabecera. */
  accentColor?: string;
  /** Content-ID of an inline PNG icon to show next to "ENVI" in the header. */
  iconCid?: string;
}): { subject: string; html: string; text: string } {
  const dateObj = data.timestamp ? new Date(data.timestamp) : new Date();
  const dateLabel = isNaN(dateObj.getTime())
    ? "—"
    : dateObj.toLocaleString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const subject = `Comprobante de envío · ${data.projectName}`;

  // Icono del proyecto embebido (CID) al lado de "ENVI", igual que en el correo de
  // retroalimentación, para que ambos correos muestren el icono de la actividad.
  const iconImg = data.iconCid
    ? `<img src="cid:${data.iconCid}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;margin-right:12px;border:0;outline:none;" />`
    : "";

  // Color de la cabecera = color del proyecto (o un rojo ENVI por defecto).
  const headerBg = normalizeHex(data.accentColor) || "#d21f28";
  const headerLight = isLightColor(headerBg);
  const headerText = headerLight ? "#111111" : "#ffffff";
  const headerSub = headerLight ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.80)";

  const fontStack = "'Segoe UI', Helvetica, Arial, sans-serif";
  const monoStack = "'Courier New', Consolas, monospace";

  const rows = data.files
    .map(
      (f) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e1e1e;color:#e5e5e5;font-size:13px;word-break:break-all;font-family:${fontStack};">${escapeHtml(f.name)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e1e1e;color:#8a8a8a;font-size:12px;font-family:${monoStack};text-align:right;white-space:nowrap;">${formatBytes(f.size)}</td>
        </tr>`
    )
    .join("");

  const labelStyle = `padding:7px 0;color:#7a7a7a;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-family:${monoStack};`;
  const valueStyle = `padding:7px 0;color:#ffffff;font-size:13px;font-weight:600;text-align:right;font-family:${fontStack};`;

  // Solo líneas diagonales del color del proyecto (sin relleno negro), igual que
  // los botones "retro" del entorno. El fondo queda transparente para que se vea
  // el fondo del cliente de correo por detrás.
  const stripes = `repeating-linear-gradient(119deg, ${headerBg} 0px, ${headerBg} 1px, transparent 1px, transparent 10px)`;
  const bgOuter = `background-color:transparent;background-image:${stripes};`;

  // Evita que Gmail convierta el correo en un enlace azul: separando "@" y "."
  // en <span> distintos, el detector de enlaces ya no reconoce el patrón,
  // pero el texto se sigue leyendo y copiando igual.
  const emailSafe = escapeHtml(data.senderEmail)
    .replace(/@/g, "<span>@</span>")
    .replace(/\./g, "<span>.</span>");

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;${bgOuter}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${bgOuter}">
    <tr><td align="center" style="padding:32px 24px;${bgOuter}">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0d0d0d;border:1px solid rgba(255,255,255,0.10);border-radius:0;">
        <!-- Cabecera con el color del proyecto -->
        <tr>
          <td style="background-color:${headerBg};padding:30px 24px;text-align:center;border-radius:0;">
            <div style="font-size:30px;font-weight:800;color:${headerText};letter-spacing:3px;font-family:${fontStack};white-space:nowrap;">${iconImg}<span style="vertical-align:middle;">ENVI</span></div>
            <div style="font-size:11px;color:${headerSub};margin-top:8px;letter-spacing:2px;text-transform:uppercase;font-family:${monoStack};">Comprobante de envío</div>
            <div style="font-size:10px;color:${headerSub};margin-top:6px;letter-spacing:1px;font-family:${monoStack};">Dev by WilZamGuerrero</div>
          </td>
        </tr>
        <!-- Cuerpo -->
        <tr>
          <td style="padding:28px 24px;">
            <p style="color:#e5e5e5;font-size:15px;line-height:1.6;margin:0 0 22px;font-family:${fontStack};">Hola <strong style="color:#ffffff;">${escapeHtml(data.senderName)}</strong>, tu envío se registró correctamente. Conserva este correo como respaldo.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:22px;">
              <tr>
                <td style="${labelStyle}">Proyecto</td>
                <td style="${valueStyle}">${escapeHtml(data.projectName)}</td>
              </tr>
              <tr>
                <td style="${labelStyle}">Remitente</td>
                <td style="${valueStyle}">${escapeHtml(data.senderName)}</td>
              </tr>
              <tr>
                <td style="${labelStyle}">Correo</td>
                <td style="${valueStyle}"><span style="color:#ffffff;text-decoration:none;">${emailSafe}</span></td>
              </tr>
              <tr>
                <td style="${labelStyle}">Fecha y hora</td>
                <td style="${valueStyle}">${escapeHtml(dateLabel)}</td>
              </tr>
              <tr>
                <td style="${labelStyle}">Archivos totales</td>
                <td style="padding:7px 0;color:${headerBg};font-size:15px;font-weight:800;text-align:right;font-family:${monoStack};">${data.files.length}</td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#080808;border:1px solid rgba(255,255,255,0.10);border-radius:0;border-collapse:separate;">
              <tr>
                <td colspan="2" style="padding:10px 14px;color:#7a7a7a;font-size:10px;text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid #1e1e1e;font-family:${monoStack};">Archivos enviados</td>
              </tr>
              ${rows}
            </table>

            <p style="color:#5a5a5a;font-size:11px;margin:24px 0 0;text-align:center;font-family:${fontStack};">Este es un correo automático, por favor no respondas a este mensaje.</p>
          </td>
        </tr>
        <!-- Línea inferior con el color del proyecto -->
        <tr><td style="height:4px;background-color:${headerBg};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Comprobante de envío - ${data.projectName}`,
    ``,
    `Hola ${data.senderName}, tu envío se registró correctamente.`,
    ``,
    `Proyecto: ${data.projectName}`,
    `Remitente: ${data.senderName} (${data.senderEmail})`,
    `Fecha y hora: ${dateLabel}`,
    `Archivos totales: ${data.files.length}`,
    ``,
    `Archivos:`,
    ...data.files.map((f) => `- ${f.name} (${formatBytes(f.size)})`),
    ``,
    `Este es un correo automático, por favor no respondas.`,
  ].join("\n");

  return { subject, html, text };
}

/** Genera el correo de retroalimentación (comentarios + nota + adjuntos). */
export function buildFeedbackEmail(data: {
  recipientName: string;
  projectName: string;
  comment: string;
  note?: string;
  files: { name: string }[];
  accentColor?: string;
  /** Content-ID of an inline PNG icon to show next to "ENVI" in the header. */
  iconCid?: string;
}): { subject: string; html: string; text: string } {
  const headerBg = normalizeHex(data.accentColor) || "#d21f28";
  const headerLight = isLightColor(headerBg);
  const headerText = headerLight ? "#111111" : "#ffffff";
  const headerSub = headerLight ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.80)";

  const fontStack = "'Segoe UI', Helvetica, Arial, sans-serif";
  const monoStack = "'Courier New', Consolas, monospace";

  const subject = `Retroalimentación · ${data.projectName}`;

  // Mismo fondo que el recibo: solo líneas diagonales del color del proyecto
  // sobre un fondo transparente (deja ver el fondo del cliente de correo).
  const stripes = `repeating-linear-gradient(119deg, ${headerBg} 0px, ${headerBg} 1px, transparent 1px, transparent 10px)`;
  const bgOuter = `background-color:transparent;background-image:${stripes};`;

  // Icono del proyecto embebido (CID) al lado de "ENVI", un poco más grande que
  // el texto para diferenciar visualmente este correo del comprobante de envío.
  const iconImg = data.iconCid
    ? `<img src="cid:${data.iconCid}" width="46" height="46" alt="" style="display:inline-block;vertical-align:middle;margin-right:12px;border:0;outline:none;" />`
    : "";

  // La nota (calificación) se muestra centrada y en grande para que el estudiante
  // la vea claramente, en vez de repartida de extremo a extremo.
  const noteBlock = data.note && data.note.trim()
    ? `<tr>
         <td style="padding:6px 0 18px;text-align:center;">
           <div style="color:#7a7a7a;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-family:${monoStack};margin-bottom:10px;">Nota</div>
           <div style="color:${headerBg};font-size:72px;font-weight:800;line-height:1;text-align:center;font-family:${monoStack};">${escapeHtml(data.note.trim())}</div>
         </td>
       </tr>`
    : "";

  const commentBlock = data.comment && data.comment.trim()
    ? `<div style="background-color:#080808;border:1px solid rgba(255,255,255,0.10);border-radius:0;padding:14px;margin-bottom:20px;">
         <div style="color:#7a7a7a;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-family:${monoStack};margin-bottom:8px;">Comentarios</div>
         <div style="color:#e5e5e5;font-size:14px;line-height:1.6;font-family:${fontStack};white-space:pre-wrap;">${linkifyHtml(data.comment.trim())}</div>
       </div>`
    : "";

  const filesBlock = data.files.length > 0
    ? `<div style="background-color:#080808;border:1px solid rgba(255,255,255,0.10);border-radius:0;padding:12px 14px;">
         <div style="color:#7a7a7a;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-family:${monoStack};margin-bottom:8px;">Archivos adjuntos (${data.files.length})</div>
         ${data.files.map((f) => `<div style="color:#e5e5e5;font-size:13px;font-family:${fontStack};padding:3px 0;word-break:break-all;">📎 ${escapeHtml(f.name)}</div>`).join("")}
       </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;${bgOuter}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${bgOuter}">
    <tr><td align="center" style="padding:32px 24px;${bgOuter}">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0d0d0d;border:1px solid rgba(255,255,255,0.10);border-radius:0;">
        <tr>
          <td style="background-color:${headerBg};padding:30px 24px;text-align:center;">
            <div style="font-size:30px;font-weight:800;color:${headerText};letter-spacing:3px;font-family:${fontStack};white-space:nowrap;">${iconImg}<span style="vertical-align:middle;">ENVI</span></div>
            <div style="font-size:11px;color:${headerSub};margin-top:8px;letter-spacing:2px;text-transform:uppercase;font-family:${monoStack};">Retroalimentación</div>
            <div style="font-size:10px;color:${headerSub};margin-top:6px;letter-spacing:1px;font-family:${monoStack};">Dev by WilZamGuerrero</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px;">
            <p style="color:#e5e5e5;font-size:15px;line-height:1.6;margin:0 0 22px;font-family:${fontStack};">Hola <strong style="color:#ffffff;">${escapeHtml(data.recipientName)}</strong>, tienes una nueva retroalimentación para el proyecto <strong style="color:#ffffff;">${escapeHtml(data.projectName)}</strong>.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:${noteBlock ? "20px" : "0"};">
              ${noteBlock}
            </table>

            ${commentBlock}
            ${filesBlock}

            <p style="color:#5a5a5a;font-size:11px;margin:24px 0 0;text-align:center;font-family:${fontStack};">Este es un correo automático, por favor no respondas a este mensaje.</p>
          </td>
        </tr>
        <tr><td style="height:4px;background-color:${headerBg};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Retroalimentación - ${data.projectName}`,
    ``,
    `Hola ${data.recipientName}, tienes una nueva retroalimentación.`,
    ...(data.note && data.note.trim() ? [``, `Nota: ${data.note.trim()}`] : []),
    ...(data.comment && data.comment.trim() ? [``, `Comentarios:`, data.comment.trim()] : []),
    ...(data.files.length > 0 ? [``, `Archivos adjuntos:`, ...data.files.map((f) => `- ${f.name}`)] : []),
    ``,
    `Este es un correo automático, por favor no respondas.`,
  ].join("\n");

  return { subject, html, text };
}
