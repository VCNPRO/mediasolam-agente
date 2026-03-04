// KV key patterns and constants

export const TTL = {
  SEEN: 30 * 24 * 3600,        // 30 days
  OPPORTUNITY: 90 * 24 * 3600, // 90 days
  DAILY_INDEX: 90 * 24 * 3600, // 90 days
  DAILY_STATS: 365 * 24 * 3600 // 1 year
};

export const MAX_EXEC_LOG = 200;
export const MAX_NEW_PER_FEED = 30;
export const BATCH_SIZE = 5;

export const APPS = [
  "SCRIPTORIUMIA",
  "VERBADOCSALUD",
  "ANNALYSISMEDIA",
  "VERBADOCPRO",
  "VIDEOCONVERSION",
  "DESCARTADO"
];

export const ENCAJE_LEVELS = ["ALTO", "MEDIO", "BAJO"];

// Key builders
export const keys = {
  seen: (id) => `seen:${id}`,
  opp: (id) => `opp:${id}`,
  idxAll: () => "idx:opps:all",
  idxApp: (app) => `idx:opps:app:${app}`,
  idxEncaje: (level) => `idx:opps:encaje:${level}`,
  idxDay: (date) => `idx:opps:day:${date}`,
  execLog: () => "exec:log",
  execLatest: () => "exec:latest",
  statsDaily: (date) => `stats:daily:${date}`,
  statsSummary: () => "stats:summary",
  configAlerts: () => "config:alerts",
  configFeeds: () => "config:feeds"
};

export function normalizeEncaje(raw) {
  const upper = String(raw).toUpperCase();
  if (upper.includes("ALTO") || upper.includes("HIGH")) return "ALTO";
  if (upper.includes("MEDIO") || upper.includes("MEDIUM") || upper.includes("MODERADO")) return "MEDIO";
  if (upper.includes("BAJO") || upper.includes("LOW")) return "BAJO";
  return "BAJO";
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export const DEFAULT_FEED_URL =
  "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom";

export const DEFAULT_FEEDS = [
  {
    id: "main",
    name: "Perfil Contratante Completo",
    url: DEFAULT_FEED_URL,
    enabled: true,
    category: "general"
  }
];

export const DEFAULT_ALERTS = {
  enabled: true,
  minEncaje: "BAJO",
  emailFrequency: "cada_ejecucion", // "cada_ejecucion" | "max_diario" | "nunca"
  apps: APPS.filter((a) => a !== "DESCARTADO"),
  emailTo: []
};

// ── CPV codes relevant to VCNpro AI solutions ──────────────────────
// Each CPV code maps to an array of potentially matching apps.
// Items whose CPV matches at least one code here pass pre-filtering;
// the rest are discarded before AI classification (saves tokens & noise).
export const CPV_MAP = {
  // ── Archivos, bibliotecas, documentación ──
  "79560000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de archivo
  "92500000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de bibliotecas, archivos, museos y culturales
  "92510000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de bibliotecas y archivos
  "92512000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de archivos
  "92512100": ["VIDEOCONVERSION"],                                // Servicios de destrucción de archivos
  "72252000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de archivo informático
  "72512000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de gestión de documentos

  // ── Tratamiento de datos, digitalización, escaneado ──
  "72300000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios relacionados con datos
  "72310000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de tratamiento de datos
  "72320000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios relacionados con bases de datos
  "72330000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de normalización y clasificación de contenidos
  "72920000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de conversión informática de catálogos
  "79999100": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de escaneado

  // ── Impresión, fotografía, restauración ──
  "79811000": ["VIDEOCONVERSION"],                                // Servicios de impresión digital
  "79824000": ["VIDEOCONVERSION"],                                // Servicios de impresión y distribución
  "79963000": ["VIDEOCONVERSION"],                                // Servicios de restauración, copia y retocado de fotografías

  // ── TI, software, consultoría ──
  "72000000": ["VERBADOCPRO", "SCRIPTORIUMIA", "ANNALYSISMEDIA"], // Servicios TI: consultoría, desarrollo, Internet
  "72260000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios relacionados con el software
  "48000000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Paquetes de software y sistemas de información
  "48422000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Paquetes de software para gestión de documentos
  "48490000": ["VERBADOCPRO"],                                    // Software para adquisiciones y gestión
  "48810000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Sistemas de información
  "48814000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Sistemas de información de gestión

  // ── IA, I+D, análisis ──
  "72200000": ["VERBADOCPRO", "SCRIPTORIUMIA", "ANNALYSISMEDIA"], // Servicios de programación y consultoría
  "72212000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de programación de software de aplicación
  "73000000": ["SCRIPTORIUMIA", "ANNALYSISMEDIA"],               // Servicios de I+D y consultoría
  "73120000": ["SCRIPTORIUMIA", "ANNALYSISMEDIA"],               // Servicios de I+D experimental

  // ── Cloud / SaaS ──
  "72400000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de Internet
  "72415000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de alojamiento web
  "72250000": ["VERBADOCPRO", "SCRIPTORIUMIA"],                  // Servicios de mantenimiento y apoyo de sistemas
  "72221000": ["VERBADOCPRO", "ANNALYSISMEDIA"],                 // Servicios de análisis de sistemas empresariales

  // ── Traducción ──
  "79530000": ["SCRIPTORIUMIA"],                                  // Servicios de traducción

  // ── Digitalización / archivística ──
  "79131000": ["VIDEOCONVERSION", "SCRIPTORIUMIA"],              // Servicios de archivística

  // ── Salud (específico VerbaDocSalud) ──
  "72312000": ["VERBADOCSALUD", "VERBADOCPRO"],                  // Servicios de entrada de datos
  "72312100": ["VERBADOCSALUD", "VERBADOCPRO"],                  // Servicios de preparación de datos
};

// Extract just the code prefixes (first 2 digits) for quick broad matching
export const CPV_CODES = Object.keys(CPV_MAP);

// Returns matching apps for a set of CPV codes, or null if no match
export function matchCpvToApps(cpvCodes) {
  const apps = new Set();
  for (const code of cpvCodes) {
    // Try exact match first
    if (CPV_MAP[code]) {
      CPV_MAP[code].forEach((a) => apps.add(a));
      continue;
    }
    // Try matching without check digit (last digit after dash)
    const base = code.replace(/-.*$/, "").replace(/\d$/, "0");
    if (CPV_MAP[base]) {
      CPV_MAP[base].forEach((a) => apps.add(a));
    }
  }
  return apps.size > 0 ? [...apps] : null;
}
