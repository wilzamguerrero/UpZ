import {
  // Archivos
  UploadCloud, Upload, Download, File, FileText, FileCode, FileImage, FileArchive, FileCheck,
  Files, Folder, FolderOpen, FolderPlus, Archive, Paperclip, Save, Clipboard, ClipboardList, Copy, Inbox,
  // Tecnología
  Code2, Terminal, Cpu, Server, Database, HardDrive, Wifi, Bluetooth, Monitor, Laptop, Smartphone,
  Tablet, Keyboard, Mouse, Cloud, Bug, GitBranch, Github, Command, Puzzle, MemoryStick, Router,
  // Educación
  GraduationCap, BookOpen, Book, BookMarked, Library, Microscope, FlaskConical, Atom, Calculator,
  Ruler, Pencil, PencilLine, PencilRuler, Brain, Sigma, FunctionSquare, School, NotebookPen, Highlighter, Languages,
  // Arte y diseño
  Palette, Brush, PaintBucket, Layers, Wand2, Sparkles, Lightbulb, PenTool, Frame, Image, Shapes, Crop, Droplet, Eraser, Scissors,
  // Medios
  Camera, Film, Video, Music, Headphones, Mic, Radio, Tv, Speaker, Play, Podcast, Clapperboard, Newspaper, Rss, Volume2,
  // Naturaleza
  Sun, Moon, CloudRain, CloudSnow, Snowflake, Flame, Leaf, Trees, TreePine, Mountain, Flower, Flower2,
  Globe, Waves, Wind, Sprout, Bird, Fish, Cat, Dog,
  // Logros
  Award, Trophy, Medal, Star, Crown, Zap, Rocket, Target, Flag, Gem, ThumbsUp, PartyPopper,
  // Negocios
  Briefcase, Building, Building2, Package, ShoppingCart, ShoppingBag, Store, Truck, Wallet, CreditCard,
  DollarSign, Euro, Coins, Banknote, TrendingUp, BarChart3, PieChart, LineChart, Receipt, Handshake, Calendar, Clock,
  // Comunicación
  Mail, Send, Phone, PhoneCall, MessageCircle, MessageSquare, Bell, BellRing, Share2, Users, User, UserPlus, Heart, AtSign, Megaphone,
  // Herramientas
  Settings, Wrench, Hammer, Compass, Map, MapPin, Shield, ShieldCheck, Lock, Key, Fingerprint, Search,
  Filter, Sliders, Magnet, Gauge, Timer, Bookmark, Tag, Link, Anchor,
  // Símbolos
  Circle, Square, Triangle, Hexagon, Diamond, Hash, Percent, Infinity, Asterisk,
  type LucideIcon,
} from "lucide-react";
import * as LucideAll from "lucide-react";

export interface IconOption {
  key: string;
  Icon: LucideIcon;
  label: string;
  cat: string;
}

/** Category display order for the picker. */
export const ICON_CATEGORIES: string[] = [
  "Archivos",
  "Tecnología",
  "Educación",
  "Arte",
  "Medios",
  "Naturaleza",
  "Logros",
  "Negocios",
  "Comunicación",
  "Herramientas",
  "Símbolos",
  "Más iconos",
];

/** Hand-picked, well-labeled icons grouped by theme (shown first). */
const CURATED_ICONS: IconOption[] = [
  // Archivos
  { key: "UploadCloud", Icon: UploadCloud, label: "Subida", cat: "Archivos" },
  { key: "Upload", Icon: Upload, label: "Subir", cat: "Archivos" },
  { key: "Download", Icon: Download, label: "Descargar", cat: "Archivos" },
  { key: "File", Icon: File, label: "Archivo", cat: "Archivos" },
  { key: "FileText", Icon: FileText, label: "Documento", cat: "Archivos" },
  { key: "FileCode", Icon: FileCode, label: "Archivo código", cat: "Archivos" },
  { key: "FileImage", Icon: FileImage, label: "Archivo imagen", cat: "Archivos" },
  { key: "FileArchive", Icon: FileArchive, label: "Archivo ZIP", cat: "Archivos" },
  { key: "FileCheck", Icon: FileCheck, label: "Archivo ok", cat: "Archivos" },
  { key: "Files", Icon: Files, label: "Archivos", cat: "Archivos" },
  { key: "Folder", Icon: Folder, label: "Carpeta", cat: "Archivos" },
  { key: "FolderOpen", Icon: FolderOpen, label: "Carpeta abierta", cat: "Archivos" },
  { key: "FolderPlus", Icon: FolderPlus, label: "Nueva carpeta", cat: "Archivos" },
  { key: "Archive", Icon: Archive, label: "Comprimido", cat: "Archivos" },
  { key: "Paperclip", Icon: Paperclip, label: "Adjunto", cat: "Archivos" },
  { key: "Save", Icon: Save, label: "Guardar", cat: "Archivos" },
  { key: "Clipboard", Icon: Clipboard, label: "Portapapeles", cat: "Archivos" },
  { key: "ClipboardList", Icon: ClipboardList, label: "Lista", cat: "Archivos" },
  { key: "Copy", Icon: Copy, label: "Copiar", cat: "Archivos" },
  { key: "Inbox", Icon: Inbox, label: "Bandeja", cat: "Archivos" },
  // Tecnología
  { key: "Code2", Icon: Code2, label: "Código", cat: "Tecnología" },
  { key: "Terminal", Icon: Terminal, label: "Terminal", cat: "Tecnología" },
  { key: "Cpu", Icon: Cpu, label: "CPU", cat: "Tecnología" },
  { key: "Server", Icon: Server, label: "Servidor", cat: "Tecnología" },
  { key: "Database", Icon: Database, label: "Base de datos", cat: "Tecnología" },
  { key: "HardDrive", Icon: HardDrive, label: "Disco", cat: "Tecnología" },
  { key: "Wifi", Icon: Wifi, label: "WiFi", cat: "Tecnología" },
  { key: "Bluetooth", Icon: Bluetooth, label: "Bluetooth", cat: "Tecnología" },
  { key: "Monitor", Icon: Monitor, label: "Monitor", cat: "Tecnología" },
  { key: "Laptop", Icon: Laptop, label: "Laptop", cat: "Tecnología" },
  { key: "Smartphone", Icon: Smartphone, label: "Móvil", cat: "Tecnología" },
  { key: "Tablet", Icon: Tablet, label: "Tablet", cat: "Tecnología" },
  { key: "Keyboard", Icon: Keyboard, label: "Teclado", cat: "Tecnología" },
  { key: "Mouse", Icon: Mouse, label: "Mouse", cat: "Tecnología" },
  { key: "Cloud", Icon: Cloud, label: "Nube", cat: "Tecnología" },
  { key: "Bug", Icon: Bug, label: "Bug", cat: "Tecnología" },
  { key: "GitBranch", Icon: GitBranch, label: "Git", cat: "Tecnología" },
  { key: "Github", Icon: Github, label: "GitHub", cat: "Tecnología" },
  { key: "Command", Icon: Command, label: "Comando", cat: "Tecnología" },
  { key: "Puzzle", Icon: Puzzle, label: "Extensión", cat: "Tecnología" },
  { key: "MemoryStick", Icon: MemoryStick, label: "Memoria", cat: "Tecnología" },
  { key: "Router", Icon: Router, label: "Router", cat: "Tecnología" },
  // Educación
  { key: "GraduationCap", Icon: GraduationCap, label: "Graduación", cat: "Educación" },
  { key: "BookOpen", Icon: BookOpen, label: "Libro", cat: "Educación" },
  { key: "Book", Icon: Book, label: "Libro cerrado", cat: "Educación" },
  { key: "BookMarked", Icon: BookMarked, label: "Marcado", cat: "Educación" },
  { key: "Library", Icon: Library, label: "Biblioteca", cat: "Educación" },
  { key: "Microscope", Icon: Microscope, label: "Microscopio", cat: "Educación" },
  { key: "FlaskConical", Icon: FlaskConical, label: "Química", cat: "Educación" },
  { key: "Atom", Icon: Atom, label: "Física", cat: "Educación" },
  { key: "Calculator", Icon: Calculator, label: "Calculadora", cat: "Educación" },
  { key: "Ruler", Icon: Ruler, label: "Regla", cat: "Educación" },
  { key: "Pencil", Icon: Pencil, label: "Lápiz", cat: "Educación" },
  { key: "PencilLine", Icon: PencilLine, label: "Escribir", cat: "Educación" },
  { key: "PencilRuler", Icon: PencilRuler, label: "Diseño", cat: "Educación" },
  { key: "Brain", Icon: Brain, label: "Mente", cat: "Educación" },
  { key: "Sigma", Icon: Sigma, label: "Sigma", cat: "Educación" },
  { key: "FunctionSquare", Icon: FunctionSquare, label: "Función", cat: "Educación" },
  { key: "School", Icon: School, label: "Escuela", cat: "Educación" },
  { key: "NotebookPen", Icon: NotebookPen, label: "Cuaderno", cat: "Educación" },
  { key: "Highlighter", Icon: Highlighter, label: "Resaltador", cat: "Educación" },
  { key: "Languages", Icon: Languages, label: "Idiomas", cat: "Educación" },
  // Arte
  { key: "Palette", Icon: Palette, label: "Paleta", cat: "Arte" },
  { key: "Brush", Icon: Brush, label: "Pincel", cat: "Arte" },
  { key: "PaintBucket", Icon: PaintBucket, label: "Relleno", cat: "Arte" },
  { key: "Layers", Icon: Layers, label: "Capas", cat: "Arte" },
  { key: "Wand2", Icon: Wand2, label: "Varita", cat: "Arte" },
  { key: "Sparkles", Icon: Sparkles, label: "Brillos", cat: "Arte" },
  { key: "Lightbulb", Icon: Lightbulb, label: "Idea", cat: "Arte" },
  { key: "PenTool", Icon: PenTool, label: "Pluma", cat: "Arte" },
  { key: "Frame", Icon: Frame, label: "Marco", cat: "Arte" },
  { key: "Image", Icon: Image, label: "Imagen", cat: "Arte" },
  { key: "Shapes", Icon: Shapes, label: "Formas", cat: "Arte" },
  { key: "Crop", Icon: Crop, label: "Recortar", cat: "Arte" },
  { key: "Droplet", Icon: Droplet, label: "Color", cat: "Arte" },
  { key: "Eraser", Icon: Eraser, label: "Borrador", cat: "Arte" },
  { key: "Scissors", Icon: Scissors, label: "Tijeras", cat: "Arte" },
  // Medios
  { key: "Camera", Icon: Camera, label: "Cámara", cat: "Medios" },
  { key: "Film", Icon: Film, label: "Película", cat: "Medios" },
  { key: "Video", Icon: Video, label: "Video", cat: "Medios" },
  { key: "Music", Icon: Music, label: "Música", cat: "Medios" },
  { key: "Headphones", Icon: Headphones, label: "Audífonos", cat: "Medios" },
  { key: "Mic", Icon: Mic, label: "Micrófono", cat: "Medios" },
  { key: "Radio", Icon: Radio, label: "Radio", cat: "Medios" },
  { key: "Tv", Icon: Tv, label: "TV", cat: "Medios" },
  { key: "Speaker", Icon: Speaker, label: "Altavoz", cat: "Medios" },
  { key: "Play", Icon: Play, label: "Reproducir", cat: "Medios" },
  { key: "Podcast", Icon: Podcast, label: "Podcast", cat: "Medios" },
  { key: "Clapperboard", Icon: Clapperboard, label: "Claqueta", cat: "Medios" },
  { key: "Newspaper", Icon: Newspaper, label: "Prensa", cat: "Medios" },
  { key: "Rss", Icon: Rss, label: "RSS", cat: "Medios" },
  { key: "Volume2", Icon: Volume2, label: "Volumen", cat: "Medios" },
  // Naturaleza
  { key: "Sun", Icon: Sun, label: "Sol", cat: "Naturaleza" },
  { key: "Moon", Icon: Moon, label: "Luna", cat: "Naturaleza" },
  { key: "CloudRain", Icon: CloudRain, label: "Lluvia", cat: "Naturaleza" },
  { key: "CloudSnow", Icon: CloudSnow, label: "Nevada", cat: "Naturaleza" },
  { key: "Snowflake", Icon: Snowflake, label: "Nieve", cat: "Naturaleza" },
  { key: "Flame", Icon: Flame, label: "Fuego", cat: "Naturaleza" },
  { key: "Leaf", Icon: Leaf, label: "Hoja", cat: "Naturaleza" },
  { key: "Trees", Icon: Trees, label: "Árboles", cat: "Naturaleza" },
  { key: "TreePine", Icon: TreePine, label: "Pino", cat: "Naturaleza" },
  { key: "Mountain", Icon: Mountain, label: "Montaña", cat: "Naturaleza" },
  { key: "Flower", Icon: Flower, label: "Flor", cat: "Naturaleza" },
  { key: "Flower2", Icon: Flower2, label: "Flor 2", cat: "Naturaleza" },
  { key: "Globe", Icon: Globe, label: "Mundo", cat: "Naturaleza" },
  { key: "Waves", Icon: Waves, label: "Olas", cat: "Naturaleza" },
  { key: "Wind", Icon: Wind, label: "Viento", cat: "Naturaleza" },
  { key: "Sprout", Icon: Sprout, label: "Brote", cat: "Naturaleza" },
  { key: "Bird", Icon: Bird, label: "Ave", cat: "Naturaleza" },
  { key: "Fish", Icon: Fish, label: "Pez", cat: "Naturaleza" },
  { key: "Cat", Icon: Cat, label: "Gato", cat: "Naturaleza" },
  { key: "Dog", Icon: Dog, label: "Perro", cat: "Naturaleza" },
  // Logros
  { key: "Award", Icon: Award, label: "Premio", cat: "Logros" },
  { key: "Trophy", Icon: Trophy, label: "Trofeo", cat: "Logros" },
  { key: "Medal", Icon: Medal, label: "Medalla", cat: "Logros" },
  { key: "Star", Icon: Star, label: "Estrella", cat: "Logros" },
  { key: "Crown", Icon: Crown, label: "Corona", cat: "Logros" },
  { key: "Zap", Icon: Zap, label: "Rayo", cat: "Logros" },
  { key: "Rocket", Icon: Rocket, label: "Cohete", cat: "Logros" },
  { key: "Target", Icon: Target, label: "Meta", cat: "Logros" },
  { key: "Flag", Icon: Flag, label: "Bandera", cat: "Logros" },
  { key: "Gem", Icon: Gem, label: "Gema", cat: "Logros" },
  { key: "ThumbsUp", Icon: ThumbsUp, label: "Like", cat: "Logros" },
  { key: "PartyPopper", Icon: PartyPopper, label: "Fiesta", cat: "Logros" },
  // Negocios
  { key: "Briefcase", Icon: Briefcase, label: "Trabajo", cat: "Negocios" },
  { key: "Building", Icon: Building, label: "Edificio", cat: "Negocios" },
  { key: "Building2", Icon: Building2, label: "Empresa", cat: "Negocios" },
  { key: "Package", Icon: Package, label: "Paquete", cat: "Negocios" },
  { key: "ShoppingCart", Icon: ShoppingCart, label: "Carrito", cat: "Negocios" },
  { key: "ShoppingBag", Icon: ShoppingBag, label: "Compra", cat: "Negocios" },
  { key: "Store", Icon: Store, label: "Tienda", cat: "Negocios" },
  { key: "Truck", Icon: Truck, label: "Envío", cat: "Negocios" },
  { key: "Wallet", Icon: Wallet, label: "Cartera", cat: "Negocios" },
  { key: "CreditCard", Icon: CreditCard, label: "Tarjeta", cat: "Negocios" },
  { key: "DollarSign", Icon: DollarSign, label: "Dólar", cat: "Negocios" },
  { key: "Euro", Icon: Euro, label: "Euro", cat: "Negocios" },
  { key: "Coins", Icon: Coins, label: "Monedas", cat: "Negocios" },
  { key: "Banknote", Icon: Banknote, label: "Billete", cat: "Negocios" },
  { key: "TrendingUp", Icon: TrendingUp, label: "Tendencia", cat: "Negocios" },
  { key: "BarChart3", Icon: BarChart3, label: "Barras", cat: "Negocios" },
  { key: "PieChart", Icon: PieChart, label: "Pastel", cat: "Negocios" },
  { key: "LineChart", Icon: LineChart, label: "Líneas", cat: "Negocios" },
  { key: "Receipt", Icon: Receipt, label: "Recibo", cat: "Negocios" },
  { key: "Handshake", Icon: Handshake, label: "Acuerdo", cat: "Negocios" },
  { key: "Calendar", Icon: Calendar, label: "Calendario", cat: "Negocios" },
  { key: "Clock", Icon: Clock, label: "Reloj", cat: "Negocios" },
  // Comunicación
  { key: "Mail", Icon: Mail, label: "Correo", cat: "Comunicación" },
  { key: "Send", Icon: Send, label: "Enviar", cat: "Comunicación" },
  { key: "Phone", Icon: Phone, label: "Teléfono", cat: "Comunicación" },
  { key: "PhoneCall", Icon: PhoneCall, label: "Llamada", cat: "Comunicación" },
  { key: "MessageCircle", Icon: MessageCircle, label: "Chat", cat: "Comunicación" },
  { key: "MessageSquare", Icon: MessageSquare, label: "Mensaje", cat: "Comunicación" },
  { key: "Bell", Icon: Bell, label: "Campana", cat: "Comunicación" },
  { key: "BellRing", Icon: BellRing, label: "Alerta", cat: "Comunicación" },
  { key: "Share2", Icon: Share2, label: "Compartir", cat: "Comunicación" },
  { key: "Users", Icon: Users, label: "Equipo", cat: "Comunicación" },
  { key: "User", Icon: User, label: "Usuario", cat: "Comunicación" },
  { key: "UserPlus", Icon: UserPlus, label: "Agregar", cat: "Comunicación" },
  { key: "Heart", Icon: Heart, label: "Me gusta", cat: "Comunicación" },
  { key: "AtSign", Icon: AtSign, label: "Arroba", cat: "Comunicación" },
  { key: "Megaphone", Icon: Megaphone, label: "Anuncio", cat: "Comunicación" },
  // Herramientas
  { key: "Settings", Icon: Settings, label: "Ajustes", cat: "Herramientas" },
  { key: "Wrench", Icon: Wrench, label: "Llave", cat: "Herramientas" },
  { key: "Hammer", Icon: Hammer, label: "Martillo", cat: "Herramientas" },
  { key: "Compass", Icon: Compass, label: "Brújula", cat: "Herramientas" },
  { key: "Map", Icon: Map, label: "Mapa", cat: "Herramientas" },
  { key: "MapPin", Icon: MapPin, label: "Ubicación", cat: "Herramientas" },
  { key: "Shield", Icon: Shield, label: "Escudo", cat: "Herramientas" },
  { key: "ShieldCheck", Icon: ShieldCheck, label: "Protegido", cat: "Herramientas" },
  { key: "Lock", Icon: Lock, label: "Candado", cat: "Herramientas" },
  { key: "Key", Icon: Key, label: "Llave", cat: "Herramientas" },
  { key: "Fingerprint", Icon: Fingerprint, label: "Huella", cat: "Herramientas" },
  { key: "Search", Icon: Search, label: "Buscar", cat: "Herramientas" },
  { key: "Filter", Icon: Filter, label: "Filtro", cat: "Herramientas" },
  { key: "Sliders", Icon: Sliders, label: "Controles", cat: "Herramientas" },
  { key: "Magnet", Icon: Magnet, label: "Imán", cat: "Herramientas" },
  { key: "Gauge", Icon: Gauge, label: "Medidor", cat: "Herramientas" },
  { key: "Timer", Icon: Timer, label: "Temporizador", cat: "Herramientas" },
  { key: "Bookmark", Icon: Bookmark, label: "Marcador", cat: "Herramientas" },
  { key: "Tag", Icon: Tag, label: "Etiqueta", cat: "Herramientas" },
  { key: "Link", Icon: Link, label: "Enlace", cat: "Herramientas" },
  { key: "Anchor", Icon: Anchor, label: "Ancla", cat: "Herramientas" },
  // Símbolos
  { key: "Circle", Icon: Circle, label: "Círculo", cat: "Símbolos" },
  { key: "Square", Icon: Square, label: "Cuadrado", cat: "Símbolos" },
  { key: "Triangle", Icon: Triangle, label: "Triángulo", cat: "Símbolos" },
  { key: "Hexagon", Icon: Hexagon, label: "Hexágono", cat: "Símbolos" },
  { key: "Diamond", Icon: Diamond, label: "Diamante", cat: "Símbolos" },
  { key: "Hash", Icon: Hash, label: "Numeral", cat: "Símbolos" },
  { key: "Percent", Icon: Percent, label: "Porcentaje", cat: "Símbolos" },
  { key: "Infinity", Icon: Infinity, label: "Infinito", cat: "Símbolos" },
  { key: "Asterisk", Icon: Asterisk, label: "Asterisco", cat: "Símbolos" },
];

/** Total icons offered by the picker (curated + auto-filled from lucide-react). */
const TARGET_TOTAL = 500;

/** True if a lucide-react export is a real, renderable icon component (not an alias/type). */
function isIconComponent(name: string, value: unknown): boolean {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return false;
  // lucide exports each icon under 3 names (Foo, FooIcon, LucideFoo). Keep only the plain one.
  if (name.startsWith("Lucide") || name.endsWith("Icon")) return false;
  if (name === "Icon") return false;
  return typeof value === "function" || (typeof value === "object" && value !== null);
}

/** Turn a PascalCase icon name into a readable label ("ArrowRight" -> "Arrow Right"). */
function humanizeIconName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

const curatedKeys = new Set(CURATED_ICONS.map((o) => o.key));

const EXTRA_ICONS: IconOption[] = Object.keys(LucideAll)
  .filter((name) => !curatedKeys.has(name) && isIconComponent(name, (LucideAll as any)[name]))
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({
    key: name,
    Icon: (LucideAll as any)[name] as LucideIcon,
    label: humanizeIconName(name),
    cat: "Más iconos",
  }));

/** Extensive, categorized icon collection shared by the admin picker and the landing. */
export const ICON_OPTIONS: IconOption[] = [...CURATED_ICONS, ...EXTRA_ICONS].slice(0, TARGET_TOTAL);

/** Lookup: icon key (stored in project meta) -> Lucide icon component. */
export const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((option) => [option.key, option.Icon])
);
