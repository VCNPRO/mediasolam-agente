// ── State ──
let currentTab = "overview";
let oppsPage = 1;
let execPage = 1;
let charts = {};

// ── Router ──
function navigate(tab) {
  currentTab = tab;
  location.hash = tab;
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.classList.toggle("tab-active", btn.dataset.tab === tab);
  });
  document.querySelectorAll("main > section").forEach((sec) => {
    sec.classList.toggle("hidden", sec.id !== `tab-${tab}`);
  });
  loadTab(tab);
}

function loadTab(tab) {
  switch (tab) {
    case "overview": loadOverview(); break;
    case "opportunities": loadOpportunities(1); break;
    case "executions": loadExecHistory(1); break;
    case "stats": loadStats("7d"); break;
    case "config": loadConfigData(); break;
    case "manual": break; // Static content, no API call needed
  }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  const hash = location.hash.replace("#", "") || "overview";
  navigate(hash);
});

// ── API helper ──
async function api(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  return resp.json();
}

// ── Badges ──
function encajeBadge(level) {
  const l = (level || "BAJO").toUpperCase();
  return `<span class="badge badge-${l.toLowerCase()}">${l}</span>`;
}

function appBadge(app) {
  if (app === "DESCARTADO") return `<span class="badge badge-descartado">${app}</span>`;
  return `<span class="badge badge-app">${app}</span>`;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function shortDate(dateStr) {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  return `${parts[2]}/${parts[1]}`;
}

// ── TAB: Overview ──
async function loadOverview() {
  try {
    const data = await api("/api/dashboard-data");

    document.getElementById("header-status").textContent = data.status;
    document.getElementById("kpi-total").textContent = data.totalOpportunities || 0;
    document.getElementById("kpi-today").textContent = data.todayOpportunities || 0;
    document.getElementById("kpi-ratio").textContent = (data.ratioRelevant || 0) + "%";
    document.getElementById("kpi-emails").textContent = data.totalEmails || 0;

    // Last execution
    const exec = data.latestExecution;
    const el = document.getElementById("last-exec-info");
    if (exec) {
      el.innerHTML = `
        <div class="flex flex-wrap gap-x-6 gap-y-1">
          <span><strong>Fecha:</strong> ${formatDate(exec.timestamp)}</span>
          <span><strong>Procesados:</strong> ${exec.totalProcessed || 0}</span>
          <span><strong>Nuevos:</strong> ${exec.totalNew || 0}</span>
          <span><strong>Relevantes:</strong> ${exec.totalRelevant || 0}</span>
          ${exec.totalFilteredByCpv ? `<span class="text-orange-600"><strong>Filtrados CPV:</strong> ${exec.totalFilteredByCpv}</span>` : ""}
          <span><strong>Email:</strong> ${exec.emailSent ? "Si" : "No"}</span>
          <span><strong>Duración:</strong> ${exec.durationMs ? (exec.durationMs / 1000).toFixed(1) + "s" : "—"}</span>
          ${exec.errors && exec.errors.length > 0 ? `<span class="text-red-600"><strong>Errores:</strong> ${exec.errors.length}</span>` : ""}
        </div>`;
    } else {
      el.textContent = "Sin ejecuciones registradas";
    }

    // Trend chart
    if (data.trend && data.trend.length > 0) {
      renderTrendChart(data.trend);
    }

    // Recent opportunities
    const tbody = document.getElementById("recent-tbody");
    if (data.recientes && data.recientes.length > 0) {
      tbody.innerHTML = data.recientes.map((o) => `
        <tr class="border-b hover:bg-gray-50">
          <td class="py-2"><a href="${escHtml(o.link)}" target="_blank" class="text-blue-600 hover:underline">${escHtml(o.titulo)}</a></td>
          <td class="py-2">${appBadge(o.Aplicacion_Mediasolam)}</td>
          <td class="py-2 text-center">${encajeBadge(o.Nivel_de_Encaje)}</td>
          <td class="py-2 text-right font-medium">${escHtml(o.Presupuesto_Estimado || "—")}</td>
        </tr>`).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-gray-400">Sin oportunidades recientes</td></tr>`;
    }
  } catch (e) {
    document.getElementById("header-status").textContent = "Error";
    console.error("Overview error:", e);
  }
}

function renderTrendChart(trend) {
  const ctx = document.getElementById("chart-trend");
  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: "bar",
    data: {
      labels: trend.map((t) => shortDate(t.date)),
      datasets: [{
        label: "Oportunidades",
        data: trend.map((t) => t.count),
        backgroundColor: "#3b82f6",
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

// ── TAB: Opportunities ──
async function loadOpportunities(page) {
  oppsPage = page || 1;
  const app = document.getElementById("filter-app").value;
  const encaje = document.getElementById("filter-encaje").value;
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;
  const search = document.getElementById("filter-search").value;

  const params = new URLSearchParams({ page: oppsPage, limit: 20 });
  if (app) params.set("app", app);
  if (encaje) params.set("encaje", encaje);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search) params.set("search", search);

  try {
    const data = await api(`/api/opportunities?${params}`);
    const tbody = document.getElementById("opps-tbody");

    if (data.items && data.items.length > 0) {
      tbody.innerHTML = data.items.map((o, i) => `
        <tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="toggleExpand(this)">
          <td class="px-4 py-3"><a href="${escHtml(o.link)}" target="_blank" class="text-blue-600 hover:underline" onclick="event.stopPropagation()">${escHtml(o.titulo)}</a></td>
          <td class="px-4 py-3">${appBadge(o.Aplicacion_Mediasolam)}</td>
          <td class="px-4 py-3 text-center">${encajeBadge(o.Nivel_de_Encaje)}</td>
          <td class="px-4 py-3 text-right font-medium">${escHtml(o.Presupuesto_Estimado || "—")}</td>
          <td class="px-4 py-3 text-center text-gray-500">${escHtml(o.fechaStr || "—")}</td>
          <td class="px-4 py-3 text-center"><button onclick="event.stopPropagation(); deleteOpp('${escAttr(o.id)}')" class="text-red-400 hover:text-red-600 transition" title="Eliminar"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></td>
        </tr>
        <tr class="expand-row bg-gray-50">
          <td colspan="6" class="px-4 py-3">
            ${o.organismo ? `<p class="text-xs text-gray-500 font-semibold mb-1">Organismo</p><p class="text-sm text-gray-700 mb-2">${escHtml(o.organismo)}</p>` : ""}
            ${o.cpvCodes && o.cpvCodes.length > 0 ? `<p class="text-xs text-gray-500 font-semibold mb-1">CPV</p><p class="text-sm text-gray-700 mb-2">${o.cpvCodes.map(c => `<span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded mr-1 mb-1">${escHtml(c)}</span>`).join("")}</p>` : ""}
            <p class="text-xs text-gray-500 font-semibold mb-1">Resumen Ejecutivo</p>
            <p class="text-sm text-gray-700 mb-2">${escHtml(o.Resumen_Ejecutivo || "—")}</p>
            <p class="text-xs text-gray-500 font-semibold mb-1">Ángulo de Venta</p>
            <p class="text-sm text-gray-700">${escHtml(o.Angulo_de_Venta || "—")}</p>
          </td>
        </tr>`).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">Sin resultados</td></tr>`;
    }

    renderPagination("opps-pagination", data.page, data.pages, data.total, "loadOpportunities");
  } catch (e) {
    console.error("Opportunities error:", e);
  }
}

function toggleExpand(row) {
  const expandRow = row.nextElementSibling;
  if (expandRow && expandRow.classList.contains("expand-row")) {
    expandRow.classList.toggle("open");
  }
}

// ── TAB: Executions ──
async function loadExecHistory(page) {
  execPage = page || 1;
  try {
    const data = await api(`/api/executions?page=${execPage}&limit=20`);
    const tbody = document.getElementById("exec-tbody");

    if (data.items && data.items.length > 0) {
      const startIdx = (data.page - 1) * 20;
      tbody.innerHTML = data.items.map((e, i) => {
        const hasErrors = e.errors && e.errors.length > 0;
        const feedNames = (e.feeds || []).map((f) => f.name || f.id).join(", ") || "—";
        const globalIdx = startIdx + i;
        return `
        <tr class="border-b ${hasErrors ? "bg-red-50" : "hover:bg-gray-50"}">
          <td class="px-4 py-3">${formatDate(e.timestamp)}</td>
          <td class="px-4 py-3 text-gray-600">${escHtml(feedNames)}</td>
          <td class="px-4 py-3 text-center">${e.totalProcessed || 0}</td>
          <td class="px-4 py-3 text-center font-medium">${e.totalNew || 0}</td>
          <td class="px-4 py-3 text-center text-green-600 font-medium">${e.totalRelevant || 0}</td>
          <td class="px-4 py-3 text-center">${e.emailSent ? '<span class="text-green-600">Si</span>' : '<span class="text-gray-400">No</span>'}</td>
          <td class="px-4 py-3 text-right">${e.durationMs ? (e.durationMs / 1000).toFixed(1) + "s" : "—"}</td>
          <td class="px-4 py-3 text-center">${hasErrors ? `<span class="text-red-600 font-medium">${e.errors.length}</span>` : '<span class="text-gray-400">0</span>'}</td>
          <td class="px-4 py-3 text-center"><button onclick="deleteExec(${globalIdx})" class="text-red-400 hover:text-red-600 transition" title="Eliminar"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></td>
        </tr>`;
      }).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-6 text-center text-gray-400">Sin ejecuciones registradas</td></tr>`;
    }

    renderPagination("exec-pagination", data.page, data.pages, data.total, "loadExecHistory");
  } catch (e) {
    console.error("Executions error:", e);
  }
}

// ── TAB: Stats ──
async function loadStats(period) {
  // Update period buttons
  document.querySelectorAll(".stat-period").forEach((btn) => {
    const active = btn.dataset.period === period;
    btn.className = `stat-period px-3 py-1.5 rounded text-sm ${active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`;
  });

  try {
    const data = await api(`/api/stats?period=${period}`);

    // Daily line chart
    if (data.timeseries && data.timeseries.length > 0) {
      const ctx = document.getElementById("chart-daily");
      if (charts.daily) charts.daily.destroy();
      charts.daily = new Chart(ctx, {
        type: "line",
        data: {
          labels: data.timeseries.map((t) => shortDate(t.date)),
          datasets: [{
            label: "Total",
            data: data.timeseries.map((t) => t.total || 0),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.1)",
            fill: true,
            tension: 0.3,
          }, {
            label: "Relevantes",
            data: data.timeseries.map((t) => t.relevant || 0),
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.1)",
            fill: true,
            tension: 0.3,
          }],
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
      });
    }

    // Apps doughnut
    const agg = data.aggregated || {};
    if (agg.byApp && Object.keys(agg.byApp).length > 0) {
      const ctx = document.getElementById("chart-apps");
      if (charts.apps) charts.apps.destroy();
      const labels = Object.keys(agg.byApp);
      const values = Object.values(agg.byApp);
      const colors = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#6b7280"];
      charts.apps = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length) }],
        },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } },
      });
    }

    // Encaje bar chart
    if (agg.byEncaje && Object.keys(agg.byEncaje).length > 0) {
      const ctx = document.getElementById("chart-encaje");
      if (charts.encaje) charts.encaje.destroy();
      charts.encaje = new Chart(ctx, {
        type: "bar",
        data: {
          labels: Object.keys(agg.byEncaje),
          datasets: [{
            label: "Oportunidades",
            data: Object.values(agg.byEncaje),
            backgroundColor: ["#22c55e", "#eab308", "#ef4444"],
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
      });
    }

    // Summary text
    const sumEl = document.getElementById("stats-summary");
    sumEl.innerHTML = `
      <p><strong>Total oportunidades:</strong> ${agg.total || 0}</p>
      <p><strong>Relevantes:</strong> ${agg.relevant || 0}</p>
      <p><strong>Ejecuciones totales:</strong> ${data.summary?.totalRuns || 0}</p>
      <p><strong>Emails enviados:</strong> ${data.summary?.totalEmails || 0}</p>
    `;
  } catch (e) {
    console.error("Stats error:", e);
  }
}

// ── TAB: Config ──
const APP_LIST = ["SCRIPTORIUMIA", "VERBADOCSALUD", "ANNALYSISMEDIA", "VERBADOCPRO", "VIDEOCONVERSION"];

async function loadConfigData() {
  try {
    const data = await api("/api/config");

    // Feeds
    const feedsEl = document.getElementById("feeds-list");
    const feeds = data.feeds || [];
    feedsEl.innerHTML = feeds.map((f, i) => `
      <div class="border rounded p-3" data-feed-idx="${i}">
        <div class="flex items-center gap-2 mb-2">
          <input type="checkbox" class="feed-enabled rounded" ${f.enabled ? "checked" : ""}>
          <input type="text" class="feed-name border rounded px-2 py-1 text-sm flex-1" value="${escAttr(f.name)}">
          <button onclick="removeFeed(${i})" class="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
        </div>
        <input type="text" class="feed-url border rounded px-2 py-1 text-sm w-full" value="${escAttr(f.url)}" placeholder="URL del feed">
        <input type="hidden" class="feed-id" value="${escAttr(f.id)}">
      </div>`).join("");

    // Alerts
    const alerts = data.alerts || {};
    document.getElementById("cfg-alerts-enabled").checked = alerts.enabled !== false;
    document.getElementById("cfg-email-frequency").value = alerts.emailFrequency || "cada_ejecucion";
    document.getElementById("cfg-min-encaje").value = alerts.minEncaje || "BAJO";
    document.getElementById("cfg-email-to").value = (alerts.emailTo || []).join("\n");

    const appsEl = document.getElementById("cfg-apps");
    const activeApps = new Set(alerts.apps || []);
    appsEl.innerHTML = APP_LIST.map((app) => `
      <label class="flex items-center gap-2">
        <input type="checkbox" class="cfg-app rounded" value="${app}" ${activeApps.has(app) ? "checked" : ""}>
        <span class="text-sm">${app}</span>
      </label>`).join("");
  } catch (e) {
    console.error("Config load error:", e);
  }

  // Load CPV codes
  loadCpvCodes();
}

// CPV descriptions for display
const CPV_DESCRIPTIONS = {
  "79560000": "Servicios de archivo",
  "92500000": "Bibliotecas, archivos, museos y culturales",
  "92510000": "Servicios de bibliotecas y archivos",
  "92512000": "Servicios de archivos",
  "92512100": "Destrucción de archivos",
  "72252000": "Archivo informático",
  "72512000": "Gestión de documentos",
  "72300000": "Servicios relacionados con datos",
  "72310000": "Tratamiento de datos",
  "72320000": "Servicios de bases de datos",
  "72330000": "Normalización y clasificación de contenidos",
  "72920000": "Conversión informática de catálogos",
  "79999100": "Servicios de escaneado",
  "79811000": "Impresión digital",
  "79824000": "Impresión y distribución",
  "79963000": "Restauración y retocado de fotografías",
  "72000000": "Servicios TI: consultoría, desarrollo, Internet",
  "72260000": "Servicios de software",
  "48000000": "Paquetes de software y sistemas de información",
  "48422000": "Software gestión de documentos",
  "48490000": "Software para adquisiciones y gestión",
  "48810000": "Sistemas de información",
  "48814000": "Sistemas de información de gestión",
  "72200000": "Programación y consultoría",
  "72212000": "Programación de software de aplicación",
  "73000000": "Servicios de I+D y consultoría",
  "73120000": "I+D experimental",
  "72400000": "Servicios de Internet",
  "72415000": "Alojamiento web",
  "72250000": "Mantenimiento y apoyo de sistemas",
  "72221000": "Análisis de sistemas empresariales",
  "79530000": "Servicios de traducción",
  "79131000": "Servicios de archivística",
  "72312000": "Entrada de datos",
  "72312100": "Preparación de datos",
};

async function loadCpvCodes() {
  try {
    const data = await api("/api/cpv");
    const cpvList = data.cpv || [];
    document.getElementById("cpv-count").textContent = `${cpvList.length} códigos`;

    // Group by apps
    const byApp = {};
    for (const { code, apps } of cpvList) {
      for (const app of apps) {
        if (!byApp[app]) byApp[app] = [];
        byApp[app].push(code);
      }
    }

    const el = document.getElementById("cpv-list");
    el.innerHTML = Object.entries(byApp).sort(([a], [b]) => a.localeCompare(b)).map(([app, codes]) => `
      <div class="mb-3">
        <div class="flex items-center gap-2 mb-1.5">${appBadge(app)} <span class="text-xs text-gray-400">(${codes.length} códigos)</span></div>
        <div class="flex flex-wrap gap-1">
          ${codes.map(c => `<span class="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded cursor-default" title="${escAttr(CPV_DESCRIPTIONS[c] || c)}">${c} <span class="text-gray-400">— ${escHtml((CPV_DESCRIPTIONS[c] || "").substring(0, 40))}</span></span>`).join("")}
        </div>
      </div>
    `).join("");
  } catch (e) {
    document.getElementById("cpv-list").textContent = "Error al cargar CPVs";
    console.error("CPV load error:", e);
  }
}

function addFeed() {
  const feedsEl = document.getElementById("feeds-list");
  const idx = feedsEl.children.length;
  const div = document.createElement("div");
  div.className = "border rounded p-3";
  div.dataset.feedIdx = idx;
  div.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <input type="checkbox" class="feed-enabled rounded" checked>
      <input type="text" class="feed-name border rounded px-2 py-1 text-sm flex-1" value="" placeholder="Nombre del feed">
      <button onclick="this.closest('[data-feed-idx]').remove()" class="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
    </div>
    <input type="text" class="feed-url border rounded px-2 py-1 text-sm w-full" value="" placeholder="URL del feed">
    <input type="hidden" class="feed-id" value="feed-${Date.now()}">`;
  feedsEl.appendChild(div);
}

function removeFeed(idx) {
  const el = document.querySelector(`[data-feed-idx="${idx}"]`);
  if (el) el.remove();
}

async function saveConfig() {
  const statusEl = document.getElementById("config-status");
  statusEl.textContent = "Guardando...";

  // Collect feeds
  const feedEls = document.querySelectorAll("[data-feed-idx]");
  const feeds = Array.from(feedEls).map((el) => ({
    id: el.querySelector(".feed-id").value,
    name: el.querySelector(".feed-name").value,
    url: el.querySelector(".feed-url").value,
    enabled: el.querySelector(".feed-enabled").checked,
    category: "general",
  }));

  // Collect alerts
  const apps = Array.from(document.querySelectorAll(".cfg-app:checked")).map((el) => el.value);
  const emailTo = document.getElementById("cfg-email-to").value
    .split("\n")
    .map((e) => e.trim())
    .filter(Boolean);

  const alerts = {
    enabled: document.getElementById("cfg-alerts-enabled").checked,
    emailFrequency: document.getElementById("cfg-email-frequency").value,
    minEncaje: document.getElementById("cfg-min-encaje").value,
    apps,
    emailTo,
  };

  try {
    const resp = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeds, alerts }),
    });

    const data = await resp.json();
    statusEl.textContent = data.saved ? "Guardado correctamente" : "Error al guardar";
    setTimeout(() => (statusEl.textContent = ""), 3000);
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
    console.error("Config save error:", e);
  }
}

// ── Pagination helper ──
function renderPagination(containerId, page, pages, total, fnName) {
  const el = document.getElementById(containerId);
  if (pages <= 1) {
    el.innerHTML = `<span>${total} resultado${total !== 1 ? "s" : ""}</span><span></span>`;
    return;
  }

  let buttons = "";
  if (page > 1) buttons += `<button onclick="${fnName}(${page - 1})" class="px-3 py-1 rounded border hover:bg-gray-100">Anterior</button>`;
  buttons += `<span class="px-2">Página ${page} de ${pages}</span>`;
  if (page < pages) buttons += `<button onclick="${fnName}(${page + 1})" class="px-3 py-1 rounded border hover:bg-gray-100">Siguiente</button>`;

  el.innerHTML = `<span>${total} resultado${total !== 1 ? "s" : ""}</span><div class="flex items-center gap-2">${buttons}</div>`;
}

// ── Escaping ──
function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Delete functions ──
async function deleteOpp(id) {
  if (!confirm("¿Eliminar esta oportunidad?")) return;
  try {
    const resp = await fetch(`/api/opportunities?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    loadOpportunities(oppsPage);
  } catch (e) {
    alert("Error al eliminar: " + e.message);
  }
}

async function deleteExec(index) {
  if (!confirm("¿Eliminar este registro de ejecución?")) return;
  try {
    const resp = await fetch(`/api/executions?index=${index}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    loadExecHistory(execPage);
  } catch (e) {
    alert("Error al eliminar: " + e.message);
  }
}

async function purgeAllOpps() {
  // Build filter params matching the current view
  const app = document.getElementById("filter-app").value;
  const encaje = document.getElementById("filter-encaje").value;
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;
  const search = document.getElementById("filter-search").value;

  const hasFilters = app || encaje || from || to || search;
  const parts = [];
  if (app) parts.push(`App: ${app}`);
  if (encaje) parts.push(`Encaje: ${encaje}`);
  if (from) parts.push(`Desde: ${from}`);
  if (to) parts.push(`Hasta: ${to}`);
  if (search) parts.push(`Búsqueda: "${search}"`);
  const filterDesc = hasFilters ? `con filtros (${parts.join(", ")})` : "TODAS sin excepción";

  if (!confirm(`¿Eliminar las oportunidades ${filterDesc}?\nEsta acción no se puede deshacer.`)) return;

  const params = new URLSearchParams({ purge: hasFilters ? "filtered" : "all" });
  if (app) params.set("app", app);
  if (encaje) params.set("encaje", encaje);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search) params.set("search", search);

  try {
    const resp = await fetch(`/api/opportunities?${params}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    alert(`Eliminadas ${data.count} oportunidades.`);
    loadOpportunities(1);
  } catch (e) {
    alert("Error al purgar: " + e.message);
  }
}

async function purgeAllExecs() {
  if (!confirm("¿Eliminar TODO el historial de ejecuciones? Esta acción no se puede deshacer.")) return;
  try {
    const resp = await fetch("/api/executions?purge=all", { method: "DELETE" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    loadExecHistory(1);
  } catch (e) {
    alert("Error al purgar: " + e.message);
  }
}

// Expose functions to global scope for onclick handlers
window.navigate = navigate;
window.loadOpportunities = loadOpportunities;
window.loadExecHistory = loadExecHistory;
window.loadStats = loadStats;
window.toggleExpand = toggleExpand;
window.addFeed = addFeed;
window.removeFeed = removeFeed;
window.saveConfig = saveConfig;
window.deleteOpp = deleteOpp;
window.deleteExec = deleteExec;
window.purgeAllOpps = purgeAllOpps;
window.purgeAllExecs = purgeAllExecs;
