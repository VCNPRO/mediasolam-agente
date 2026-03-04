import { kv } from "@vercel/kv";
import { keys } from "./_lib/kv-schema.js";
import { deleteOpportunity, purgeAllOpportunities } from "./_lib/persistence.js";

// Shared filter logic — returns { ids, items } matching the given filters
async function getFilteredOpps(url, { allResults = false } = {}) {
  const app = url.searchParams.get("app") || "";
  const encaje = url.searchParams.get("encaje") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const page = allResults ? 1 : Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = allResults ? 10000 : Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  // Choose the right index
  let indexKey = keys.idxAll();
  if (app) indexKey = keys.idxApp(app);
  else if (encaje) indexKey = keys.idxEncaje(encaje.toUpperCase());

  // Date range filter via scores
  let minScore = "-inf";
  let maxScore = "+inf";
  if (from) minScore = new Date(from).getTime();
  if (to) maxScore = new Date(to + "T23:59:59Z").getTime();

  const total = await kv.zcount(indexKey, minScore, maxScore);
  const start = (page - 1) * limit;

  let ids;
  if (from || to) {
    ids = await kv.zrange(indexKey, maxScore, minScore, {
      rev: true,
      byScore: true,
      offset: start,
      count: limit,
    });
  } else {
    ids = await kv.zrange(indexKey, start, start + limit - 1, { rev: true });
  }

  if (!ids || ids.length === 0) {
    return { ids: [], items: [], total, page, pages: Math.ceil(total / limit) || 1 };
  }

  // Fetch opportunity data
  const rawData = await Promise.all(ids.map((id) => kv.get(keys.opp(id))));
  let items = rawData
    .filter(Boolean)
    .map((d) => (typeof d === "string" ? JSON.parse(d) : d));

  // Secondary filters
  if (search) {
    items = items.filter(
      (o) =>
        (o.titulo || "").toLowerCase().includes(search) ||
        (o.Resumen_Ejecutivo || "").toLowerCase().includes(search) ||
        (o.Angulo_de_Venta || "").toLowerCase().includes(search)
    );
  }
  if (app && encaje) {
    items = items.filter((o) => o.Nivel_de_Encaje === encaje.toUpperCase());
  }

  return { ids, items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export default async function handler(req, res) {
  // DELETE: remove opportunity(ies)
  if (req.method === "DELETE") {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const purge = url.searchParams.get("purge");

      if (purge === "all") {
        const count = await purgeAllOpportunities();
        return res.status(200).json({ purged: true, count });
      }

      if (purge === "filtered") {
        // Delete all opportunities matching current filters
        const { items } = await getFilteredOpps(url, { allResults: true });
        let deleted = 0;
        for (const opp of items) {
          await deleteOpportunity(opp.id, opp);
          deleted++;
        }
        return res.status(200).json({ purged: true, count: deleted });
      }

      const id = url.searchParams.get("id");
      if (!id) return res.status(400).json({ error: "Missing id" });

      const raw = await kv.get(keys.opp(id));
      const oppData = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
      await deleteOpportunity(id, oppData);
      return res.status(200).json({ deleted: true, id });
    } catch (error) {
      console.error("Error delete opportunity:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  // GET: list opportunities
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const result = await getFilteredOpps(url);
    res.status(200).json({
      items: result.items,
      total: result.total,
      page: result.page,
      pages: result.pages,
    });
  } catch (error) {
    console.error("Error opportunities:", error);
    res.status(500).json({ error: error.message });
  }
}
