import { kv } from "@vercel/kv";
import { parseAtomFeed, entryId } from "./_lib/feed-parser.js";
import { getVertexClient, classifyItem } from "./_lib/classifier.js";
import { sendEmail } from "./_lib/email.js";
import {
  saveOpportunity,
  saveExecutionLog,
  updateDailyStats,
  updateSummaryStats,
  cleanupOldIndexes,
  loadConfig,
} from "./_lib/persistence.js";
import {
  keys,
  TTL,
  MAX_NEW_PER_FEED,
  BATCH_SIZE,
  normalizeEncaje,
  todayStr,
  DEFAULT_FEEDS,
  DEFAULT_ALERTS,
  matchCpvToApps,
} from "./_lib/kv-schema.js";

export default async function handler(req, res) {
  const authHeader = req.headers["authorization"];
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const startTime = Date.now();
  const today = todayStr();
  const logEntry = {
    timestamp: startTime,
    date: today,
    feeds: [],
    totalProcessed: 0,
    totalNew: 0,
    totalRelevant: 0,
    totalDescartado: 0,
    totalFilteredByCpv: 0,
    emailSent: false,
    errors: [],
    durationMs: 0,
  };

  try {
    // Load config
    const feedsConfig = await loadConfig(keys.configFeeds(), DEFAULT_FEEDS);
    const alertsConfig = await loadConfig(keys.configAlerts(), DEFAULT_ALERTS);
    const enabledFeeds = feedsConfig.filter((f) => f.enabled);

    // Vertex AI model
    const vertexAI = getVertexClient();
    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const allClassified = [];

    // Process each enabled feed
    for (const feed of enabledFeeds) {
      const feedLog = {
        id: feed.id,
        name: feed.name,
        itemsFetched: 0,
        skipped: 0,
        filteredByCpv: 0,
        classified: 0,
        errors: 0,
      };

      try {
        const feedResponse = await fetch(feed.url, {
          headers: {
            Accept: "application/atom+xml",
            "User-Agent": "AgenteLicitaciones/2.0",
          },
        });

        if (!feedResponse.ok) {
          throw new Error(`Feed HTTP ${feedResponse.status}`);
        }

        const xml = await feedResponse.text();
        const items = parseAtomFeed(xml);
        feedLog.itemsFetched = items.length;

        // Filter unseen items
        const newItems = [];
        for (const item of items) {
          if (newItems.length >= MAX_NEW_PER_FEED) break;
          const id = entryId(item.link);
          const seen = await kv.get(keys.seen(id));
          if (seen) {
            feedLog.skipped++;
            continue;
          }
          newItems.push({ ...item, _id: id });
        }

        // ── CPV pre-filtering ──────────────────────────────────
        // Only classify items whose CPV matches our relevant codes.
        // Items without CPV codes still pass (let AI decide).
        const toClassify = [];
        for (const item of newItems) {
          if (item.cpvCodes && item.cpvCodes.length > 0) {
            const matchedApps = matchCpvToApps(item.cpvCodes);
            if (matchedApps) {
              // CPV matches → classify with hint
              item.cpvHint = matchedApps;
              toClassify.push(item);
            } else {
              // CPV present but doesn't match → skip (mark as seen to avoid re-processing)
              feedLog.filteredByCpv++;
              await kv.set(keys.seen(item._id), 1, { ex: TTL.SEEN });
            }
          } else {
            // No CPV codes in entry → let AI classify (some entries lack CPV data)
            toClassify.push(item);
          }
        }

        // Classify in parallel batches
        for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
          const batch = toClassify.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (item) => {
              const clasificacion = await classifyItem(item, model);
              const encaje = normalizeEncaje(clasificacion.Nivel_de_Encaje);
              const oppData = {
                id: item._id,
                titulo: item.title,
                link: item.link,
                feedId: feed.id,
                feedName: feed.name,
                cpvCodes: item.cpvCodes || [],
                cpvHint: item.cpvHint || null,
                organismo: item.organism || "",
                Aplicacion_Mediasolam: clasificacion.Aplicacion_Mediasolam || "DESCARTADO",
                Nivel_de_Encaje: encaje,
                Presupuesto_Estimado: clasificacion.Presupuesto_Estimado || item.budget || "No especificado",
                Resumen_Ejecutivo: clasificacion.Resumen_Ejecutivo || "",
                Angulo_de_Venta: clasificacion.Angulo_de_Venta || "",
                clasificadoEn: Date.now(),
                fechaStr: today,
              };

              // Mark as seen
              await kv.set(keys.seen(item._id), 1, { ex: TTL.SEEN });
              // Persist opportunity
              await saveOpportunity(oppData);

              return oppData;
            })
          );

          for (const r of results) {
            if (r.status === "fulfilled") {
              feedLog.classified++;
              allClassified.push(r.value);
            } else {
              feedLog.errors++;
              logEntry.errors.push(r.reason?.message || "Classification error");
            }
          }
        }
      } catch (feedErr) {
        feedLog.errors++;
        logEntry.errors.push(`Feed ${feed.id}: ${feedErr.message}`);
      }

      logEntry.feeds.push(feedLog);
      logEntry.totalProcessed += feedLog.itemsFetched;
      logEntry.totalNew += feedLog.classified;
      logEntry.totalFilteredByCpv += feedLog.filteredByCpv;
    }

    // Count relevant vs descartado
    const relevant = allClassified.filter(
      (o) => o.Aplicacion_Mediasolam !== "DESCARTADO"
    );
    const descartado = allClassified.filter(
      (o) => o.Aplicacion_Mediasolam === "DESCARTADO"
    );
    logEntry.totalRelevant = relevant.length;
    logEntry.totalDescartado = descartado.length;

    // Send email based on alert config and frequency
    const emailFreq = alertsConfig.emailFrequency || "cada_ejecucion";
    if (alertsConfig.enabled && emailFreq !== "nunca" && relevant.length > 0) {
      // Check frequency: if "max_diario", skip if already sent today
      let shouldSend = true;
      if (emailFreq === "max_diario") {
        const lastEmailKey = "email:last_sent_date";
        const lastDate = await kv.get(lastEmailKey);
        if (lastDate === today) {
          shouldSend = false;
        }
      }

      if (shouldSend) {
        const encajeOrder = { ALTO: 3, MEDIO: 2, BAJO: 1 };
        const minLevel = encajeOrder[alertsConfig.minEncaje] || 1;
        const allowedApps = new Set(alertsConfig.apps || []);

        const toEmail = relevant.filter((o) => {
          const level = encajeOrder[o.Nivel_de_Encaje] || 1;
          return level >= minLevel && allowedApps.has(o.Aplicacion_Mediasolam);
        });

        if (toEmail.length > 0) {
          try {
            const recipients =
              alertsConfig.emailTo && alertsConfig.emailTo.length > 0
                ? alertsConfig.emailTo
                : null;
            const sent = await sendEmail(toEmail, recipients);
            logEntry.emailSent = sent;
            // Record send date for frequency check
            if (sent) {
              await kv.set("email:last_sent_date", today, { ex: 86400 });
            }
          } catch (emailErr) {
            logEntry.errors.push(`Email: ${emailErr.message}`);
          }
        }
      }
    }

    // Update stats
    if (allClassified.length > 0) {
      await updateDailyStats(today, allClassified);
      const byApp = {};
      const byEncaje = {};
      for (const o of allClassified) {
        byApp[o.Aplicacion_Mediasolam] = (byApp[o.Aplicacion_Mediasolam] || 0) + 1;
        byEncaje[o.Nivel_de_Encaje] = (byEncaje[o.Nivel_de_Encaje] || 0) + 1;
      }
      await updateSummaryStats({
        totalOpps: allClassified.length,
        emailSent: logEntry.emailSent,
        byApp,
        byEncaje,
      });
    } else {
      await updateSummaryStats({ totalOpps: 0, emailSent: false, byApp: {}, byEncaje: {} });
    }

    // Save execution log
    logEntry.durationMs = Date.now() - startTime;
    await saveExecutionLog(logEntry);

    // Cleanup old indexes (non-blocking)
    cleanupOldIndexes().catch((e) =>
      console.error("Cleanup error:", e.message)
    );

    return res.status(200).json({
      success: true,
      processed: logEntry.totalProcessed,
      newClassified: logEntry.totalNew,
      filteredByCpv: logEntry.totalFilteredByCpv,
      relevant: logEntry.totalRelevant,
      descartado: logEntry.totalDescartado,
      emailSent: logEntry.emailSent,
      durationMs: logEntry.durationMs,
      errors: logEntry.errors,
    });
  } catch (err) {
    logEntry.durationMs = Date.now() - startTime;
    logEntry.errors.push(err.message);
    await saveExecutionLog(logEntry).catch(() => {});
    console.error("Error en /api/scout:", err);
    return res.status(500).json({ error: err.message });
  }
}
