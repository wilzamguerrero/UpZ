type IconNode = Array<[string, Record<string, string>]>;

export const APP_NAME = "ENVI";
export const DEFAULT_ACCENT_COLOR = "#f5f011";
export const DEFAULT_BG_COLOR = "#050505";
export const DEFAULT_HOME_TITLE = "ENVI";
export const DEFAULT_HOME_MESSAGE = "ENVI agiliza la entrega de archivos por proyecto. Desarrollado por wilzamguerrero.";
export const DEFAULT_HOME_ICON = "Sparkles";
export const DEFAULT_PROJECT_ICON = "UploadCloud";
export const DEFAULT_PROJECT_DESCRIPTION = "ENVI agiliza la entrega de archivos por proyecto. Comparte este enlace para recibir archivos de forma rapida y ordenada.";
export const LEGACY_HOME_TITLE = "Comparte tus archivos directo a Notion.";
export const LEGACY_HOME_MESSAGE = "Accede al enlace directo de tu proyecto para cargar archivos. Desde esta portada solo se muestra el acceso de administracion.";
export const LEGACY_PROJECT_DESCRIPTION = "Nuestra plataforma te permite arrastrar y soltar cualquier documento de manera instantanea. Tus archivos se organizan de forma automatica bajo un indicador desplegable (Toggle List) personalizado con tus datos, directamente en la pagina del proyecto que elijas.";

export interface PreviewAppearance {
  themeId?: string;
  accentColor?: string;
  homeTitle?: string;
  homeMessage?: string;
  homeIcon?: string;
  homeBgColor?: string;
}

export interface PreviewProject {
  id: string;
  name: string;
}

export interface PreviewProjectMeta {
  title?: string;
  description?: string;
  bgColor?: string;
  icon?: string;
}

export interface ResolvedPreview {
  kind: "home" | "project";
  title: string;
  description: string;
  bgColor: string;
  icon: string;
  canonicalPath: string;
  projectName?: string;
}

type DynamicIconModule = { __iconNode?: IconNode };
type DynamicIconImports = Record<string, () => Promise<DynamicIconModule>>;

let dynamicIconImportsPromise: Promise<DynamicIconImports> | null = null;

function normalizeColor(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : fallback;
}

function cleanText(value: unknown, fallback: string, legacyValues: string[] = []) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw && !legacyValues.includes(raw) ? raw : fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value: string) {
  return escapeHtml(value);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function getLuminance(hexColor: string) {
  const hex = hexColor.replace("#", "").trim();
  if (hex.length !== 3 && hex.length !== 6) return 0;

  const [red, green, blue] = hex.length === 3
    ? hex.split("").map((part) => parseInt(part + part, 16) / 255)
    : [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ];

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function splitLines(text: string, maxChars: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  const remainingWords = words.slice(lines.join(" ").split(/\s+/).filter(Boolean).length);
  const lastLine = current || remainingWords.shift() || "";
  const tail = remainingWords.length > 0 ? `${lastLine} ${remainingWords.join(" ")}` : lastLine;
  lines.push(truncate(tail.trim(), maxChars));

  return lines.slice(0, maxLines);
}

function toDynamicIconName(iconName: string) {
  const raw = iconName.trim();
  if (!raw) return "";
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d)/g, "$1-$2")
    .replace(/(\d)([A-Za-z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

async function getDynamicIconImports() {
  if (!dynamicIconImportsPromise) {
    dynamicIconImportsPromise = import("lucide-react/dynamicIconImports.mjs").then(
      (mod) => (mod.default || mod) as DynamicIconImports,
    );
  }

  return dynamicIconImportsPromise;
}

async function loadIconNode(iconName: string) {
  const imports = await getDynamicIconImports();
  const candidates = [
    toDynamicIconName(iconName),
    toDynamicIconName(DEFAULT_PROJECT_ICON),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const loader = imports[candidate];
    if (!loader) continue;

    try {
      const mod = await loader();
      if (Array.isArray(mod.__iconNode) && mod.__iconNode.length > 0) {
        return mod.__iconNode;
      }
    } catch {
      // Keep trying fallbacks.
    }
  }

  return null;
}

export function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizePathSlug(pathname: string) {
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function isRootLikePath(pathname: string) {
  const cleanPath = normalizePathSlug(pathname);
  return !cleanPath || cleanPath.toLowerCase() === "admin";
}

export function normalizeAppearance(appearance?: PreviewAppearance | null) {
  return {
    themeId: appearance?.themeId === "brutal" ? appearance.themeId : "brutal",
    accentColor: normalizeColor(appearance?.accentColor, DEFAULT_ACCENT_COLOR),
    homeTitle: cleanText(appearance?.homeTitle, DEFAULT_HOME_TITLE, [LEGACY_HOME_TITLE]),
    homeMessage: cleanText(appearance?.homeMessage, DEFAULT_HOME_MESSAGE, [LEGACY_HOME_MESSAGE]),
    homeIcon: cleanText(appearance?.homeIcon, DEFAULT_HOME_ICON),
    homeBgColor: normalizeColor(appearance?.homeBgColor, DEFAULT_BG_COLOR),
  };
}

export function matchProjectForPath(pathname: string, projects: PreviewProject[]) {
  const cleanPath = normalizePathSlug(pathname);
  if (!cleanPath || cleanPath.toLowerCase() === "admin") return null;

  const decodedPath = decodeURIComponent(cleanPath);

  return (
    projects.find((project) => {
      const matchesId = project.id.toLowerCase() === cleanPath.toLowerCase()
        || project.id.replace(/-/g, "").toLowerCase() === cleanPath.toLowerCase();
      const matchesSlug = normalizeString(project.name) === normalizeString(decodedPath);
      return matchesId || matchesSlug;
    }) || null
  );
}

export function resolvePreview(
  pathname: string,
  appearanceInput?: PreviewAppearance | null,
  projects: PreviewProject[] = [],
  metaMap: Record<string, PreviewProjectMeta> = {},
): ResolvedPreview {
  const appearance = normalizeAppearance(appearanceInput);

  if (isRootLikePath(pathname)) {
    return {
      kind: "home",
      title: appearance.homeTitle,
      description: appearance.homeMessage,
      bgColor: appearance.homeBgColor,
      icon: appearance.homeIcon || DEFAULT_HOME_ICON,
      canonicalPath: "/",
    };
  }

  const project = matchProjectForPath(pathname, projects);
  if (!project) {
    return {
      kind: "home",
      title: DEFAULT_HOME_TITLE,
      description: DEFAULT_HOME_MESSAGE,
      bgColor: appearance.homeBgColor,
      icon: appearance.homeIcon || DEFAULT_HOME_ICON,
      canonicalPath: pathname.startsWith("/") ? pathname : `/${pathname}`,
    };
  }

  const meta = metaMap[project.id] || {};
  const fallbackDescription = `ENVI agiliza la entrega de archivos para ${project.name}. Comparte este enlace para recibir archivos de forma rapida y ordenada.`;

  return {
    kind: "project",
    title: cleanText(meta.title, project.name || APP_NAME, [LEGACY_HOME_TITLE]),
    description: cleanText(meta.description, fallbackDescription, [LEGACY_PROJECT_DESCRIPTION, LEGACY_HOME_MESSAGE]),
    bgColor: normalizeColor(meta.bgColor, appearance.homeBgColor),
    icon: cleanText(meta.icon, DEFAULT_PROJECT_ICON),
    canonicalPath: `/${normalizeString(project.name)}`,
    projectName: project.name,
  };
}

export function buildDocumentTitle(preview: ResolvedPreview) {
  if (!preview.title || preview.title === APP_NAME) {
    return APP_NAME;
  }
  return `${preview.title} | ${APP_NAME}`;
}

function replaceOrInsert(html: string, matcher: RegExp, replacement: string) {
  if (matcher.test(html)) {
    return html.replace(matcher, replacement);
  }
  return html.replace("</head>", `  ${replacement}\n  </head>`);
}

export function injectPreviewIntoHtml(
  html: string,
  preview: ResolvedPreview,
  pageUrl: string,
  imageUrl: string,
) {
  const documentTitle = buildDocumentTitle(preview);
  const safeTitle = escapeHtml(documentTitle);
  const safeDescription = escapeHtml(preview.description);
  const safeImageAlt = escapeHtml(
    preview.kind === "project"
      ? `${preview.projectName || preview.title} en ${APP_NAME}`
      : `${APP_NAME} portada principal`,
  );

  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);

  next = replaceOrInsert(
    next,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${safeDescription}" />`,
  );

  next = replaceOrInsert(
    next,
    /<meta\s+name=["']theme-color["'][^>]*>/i,
    `<meta name="theme-color" content="${escapeHtml(preview.bgColor)}" />`,
  );

  const socialMeta = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${APP_NAME}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDescription}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta property="og:image:type" content="image/svg+xml" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${safeImageAlt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDescription}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta name="twitter:image:alt" content="${safeImageAlt}" />`,
  ].join("\n    ");

  if (next.includes("<!-- ENVI_DYNAMIC_SOCIAL_META -->")) {
    next = next.replace("<!-- ENVI_DYNAMIC_SOCIAL_META -->", socialMeta);
  } else {
    next = next.replace("</head>", `    ${socialMeta}\n  </head>`);
  }

  return next;
}

function renderIconNode(iconNode: IconNode, strokeColor: string) {
  return iconNode
    .map(([tag, attrs]) => {
      const serializedAttrs = Object.entries(attrs)
        .filter(([key]) => key !== "key")
        .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
        .join(" ");
      return `<${tag} ${serializedAttrs}></${tag}>`;
    })
    .join("");
}

export async function buildPreviewSvg(preview: ResolvedPreview) {
  const bgColor = normalizeColor(preview.bgColor, DEFAULT_BG_COLOR);
  const isLight = getLuminance(bgColor) > 0.55;
  const textColor = isLight ? "#111111" : "#f7f7f2";
  const mutedColor = isLight ? "rgba(17,17,17,0.66)" : "rgba(247,247,242,0.72)";
  const lineColor = isLight ? "rgba(17,17,17,0.09)" : "rgba(255,255,255,0.08)";
  const pillBg = isLight ? "rgba(17,17,17,0.08)" : "rgba(255,255,255,0.09)";
  const iconStroke = textColor;
  const titleLines = splitLines(preview.title, 24, 2);
  const descriptionLines = splitLines(preview.description, 56, 3);
  const eyebrow = preview.kind === "project" ? (preview.projectName || "Proyecto") : "Portada principal";
  const iconNode = await loadIconNode(preview.icon);
  const iconMarkup = iconNode
    ? `<svg x="900" y="110" width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="${iconStroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${renderIconNode(iconNode, iconStroke)}</svg>`
    : `<text x="990" y="225" text-anchor="middle" font-size="80" font-family="Arial, Helvetica, sans-serif" fill="${iconStroke}">${escapeXml((preview.title || APP_NAME).slice(0, 1).toUpperCase())}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="enviGlow" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="rgba(255,255,255,0.10)" />
      <stop offset="1" stop-color="rgba(255,255,255,0.00)" />
    </linearGradient>
    <radialGradient id="enviSpot" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1040 80) rotate(124) scale(510 820)">
      <stop stop-color="rgba(255,255,255,0.17)" />
      <stop offset="1" stop-color="rgba(255,255,255,0.00)" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" rx="0" fill="${bgColor}" />
  <rect width="1200" height="630" rx="0" fill="url(#enviGlow)" />
  <rect width="1200" height="630" rx="0" fill="url(#enviSpot)" />
  <g opacity="0.95">
    <path d="M0 88H1200" stroke="${lineColor}" />
    <path d="M0 542H1200" stroke="${lineColor}" />
    <path d="M88 0V630" stroke="${lineColor}" />
    <path d="M1112 0V630" stroke="${lineColor}" />
  </g>
  <rect x="88" y="78" width="132" height="38" rx="19" fill="${pillBg}" />
  <text x="154" y="102" text-anchor="middle" font-size="16" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${textColor}">${APP_NAME}</text>
  <text x="88" y="152" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${mutedColor}">${escapeXml(truncate(eyebrow, 40).toUpperCase())}</text>
  ${titleLines.map((line, index) => `<text x="88" y="${250 + (index * 88)}" font-size="72" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="${textColor}">${escapeXml(line)}</text>`).join("\n  ")}
  ${descriptionLines.map((line, index) => `<text x="88" y="${430 + (index * 34)}" font-size="26" font-weight="500" font-family="Arial, Helvetica, sans-serif" fill="${mutedColor}">${escapeXml(line)}</text>`).join("\n  ")}
  <rect x="858" y="84" width="254" height="254" rx="28" fill="${pillBg}" />
  ${iconMarkup}
  <text x="88" y="580" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${mutedColor}">Desarrollado por wilzamguerrero</text>
</svg>`;
}