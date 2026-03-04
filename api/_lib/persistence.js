import { kv } from "@vercel/kv";
import {
  keys,
  TTL,
  MAX_EXEC_LOG,
  normalizeEncaje,
  todayStr,
  APPS,
  ENCAJE_LEVELS,
} from "./kv-schema.js";

export async function saveOpportunity(oppData) {
  const { id } = oppData;
  const now = Date.now();
  const today = oppData.fechaStr || todayStr();
  const encaje = normalizeEncaje(oppData.Nivel_de_Encaje);
  const app = oppData.Aplicacion_Mediasolam;

  const pipe = kv.pipeline();
  pipe.set(keys.opp(id), JSON.stringify(oppData), { ex: TTL.OPPORTUNITY });
  pipe.zadd(keys.idxAll(), { score: now, member: id });
  pipe.zadd(keys.idxApp(app), { score: now, member: id });
  pipe.zadd(keys.idxEncaje(encaje), { score: now, member: id });
  pipe.zadd(keys.idxDay(today), { score: now, member: id });
  await pipe.exec();
}

export async function saveExecutionLog(logEntry) {
  const json = JSON.stringify(logEntry);
  const pipe = kv.pipeline();
  pipe.lpush(keys.execLog(), json);
  pipe.ltrim(keys.execLog(), 0, MAX_EXEC_LOG - 1);
  pipe.set(keys.execLatest(), json);
  await pipe.exec();
}

export async function updateDailyStats(date, opportunities) {
  const key = keys.statsDaily(date);
  const existing = await kv.get(key);
  const stats = existing
    ? typeof existing === "string"
      ? JSON.parse(existing)
      : existing
    : { total: 0, relevant: 0, byApp: {}, byEncaje: {} };

  for (const opp of opportunities) {
    stats.total++;
    if (opp.Aplicacion_Mediasolam !== "DESCARTADO") stats.relevant = (stats.relevant || 0) + 1;
    const app = opp.Aplicacion_Mediasolam;
    stats.byApp[app] = (stats.byApp[app] || 0) + 1;
    const encaje = normalizeEncaje(opp.Nivel_de_Encaje);
    stats.byEncaje[encaje] = (stats.byEncaje[encaje] || 0) + 1;
  }

  await kv.set(key, JSON.stringify(stats), { ex: TTL.DAILY_STATS });
}

export async function updateSummaryStats(newCounts) {
  const key = keys.statsSummary();
  const existing = await kv.get(key);
  const summary = existing
    ? typeof existing === "string"
      ? JSON.parse(existing)
      : existing
    : { totalOpps: 0, totalRuns: 0, totalEmails: 0, opsByApp: {}, opsByEncaje: {} };

  summary.totalOpps += newCounts.totalOpps || 0;
  summary.totalRuns += 1;
  if (newCounts.emailSent) summary.totalEmails += 1;

  for (const [app, count] of Object.entries(newCounts.byApp || {})) {
    summary.opsByApp[app] = (summary.opsByApp[app] || 0) + count;
  }
  for (const [encaje, count] of Object.entries(newCounts.byEncaje || {})) {
    summary.opsByEncaje[encaje] = (summary.opsByEncaje[encaje] || 0) + count;
  }

  await kv.set(key, JSON.stringify(summary));
}

export async function cleanupOldIndexes() {
  const ninetyDaysAgo = Date.now() - 90 * 24 * 3600 * 1000;
  const indexKeys = [
    keys.idxAll(),
    ...APPS.map((a) => keys.idxApp(a)),
    ...ENCAJE_LEVELS.map((e) => keys.idxEncaje(e)),
  ];
  const pipe = kv.pipeline();
  for (const key of indexKeys) {
    pipe.zremrangebyscore(key, 0, ninetyDaysAgo);
  }
  await pipe.exec();
}

export async function deleteOpportunity(id, oppData) {
  const pipe = kv.pipeline();
  // Remove main data
  pipe.del(keys.opp(id));
  // Remove from all indexes
  pipe.zrem(keys.idxAll(), id);
  if (oppData) {
    if (oppData.Aplicacion_Mediasolam) pipe.zrem(keys.idxApp(oppData.Aplicacion_Mediasolam), id);
    if (oppData.Nivel_de_Encaje) pipe.zrem(keys.idxEncaje(normalizeEncaje(oppData.Nivel_de_Encaje)), id);
    if (oppData.fechaStr) pipe.zrem(keys.idxDay(oppData.fechaStr), id);
  } else {
    // Remove from all possible app/encaje indexes
    for (const app of APPS) pipe.zrem(keys.idxApp(app), id);
    for (const enc of ENCAJE_LEVELS) pipe.zrem(keys.idxEncaje(enc), id);
  }
  await pipe.exec();
}

export async function purgeAllOpportunities() {
  // Get all opportunity IDs from the main index
  const allIds = await kv.zrange(keys.idxAll(), 0, -1);
  if (!allIds || allIds.length === 0) return 0;

  // Delete all opp data keys + all indexes
  const pipe = kv.pipeline();
  for (const id of allIds) {
    pipe.del(keys.opp(id));
  }
  // Clear all indexes
  pipe.del(keys.idxAll());
  for (const app of APPS) pipe.del(keys.idxApp(app));
  for (const enc of ENCAJE_LEVELS) pipe.del(keys.idxEncaje(enc));
  await pipe.exec();

  return allIds.length;
}

export async function deleteExecutionByIndex(index) {
  // Get the entry at this index
  const entries = await kv.lrange(keys.execLog(), index, index);
  if (entries && entries.length > 0) {
    const entry = entries[0];
    // LREM removes by value (count=1 = first occurrence)
    await kv.lrem(keys.execLog(), 1, entry);
    return true;
  }
  return false;
}

export async function purgeAllExecutions() {
  const pipe = kv.pipeline();
  pipe.del(keys.execLog());
  pipe.del(keys.execLatest());
  await pipe.exec();
}

export async function loadConfig(configKey, defaults) {
  const val = await kv.get(configKey);
  if (val) return typeof val === "string" ? JSON.parse(val) : val;
  await kv.set(configKey, JSON.stringify(defaults));
  return defaults;
}
