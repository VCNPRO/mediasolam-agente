import { kv } from "@vercel/kv";
import { keys } from "./_lib/kv-schema.js";
import { deleteOpportunity } from "./_lib/persistence.js";

export default async function handler(req, res) {
  // DELETE: remove a specific opportunity
  if (req.method === "DELETE") {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const id = url.searchParams.get("id");
      if (!id) return res.status(400).json({ error: "Missing id" });

      // Load opportunity data for index cleanup
      const raw = await kv.get(keys.opp(id));
      const oppData = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
      await deleteOpportunity(id, oppData);
      return res.status(200).json({ deleted: true, id });
    } catch (error) {
      console.error("Error delete opportunity:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const app = url.searchParams.get("app") || "";
    const encaje = url.searchParams.get("encaje") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const search = (url.searchParams.get("search") || "").toLowerCase();

    // Choose the right index
    let indexKey = keys.idxAll();
    if (app) indexKey = keys.idxApp(app);
    else if (encaje) indexKey = keys.idxEncaje(encaje.toUpperCase());

    // Date range filter via scores
    let minScore = "-inf";
    let maxScore = "+inf";
    if (from) minScore = new Date(from).getTime();
    if (to) minScore = minScore; // keep minScore, set maxScore
    if (to) maxScore = new Date(to + "T23:59:59Z").getTime();

    // Get total count
    const total = await kv.zcount(indexKey, minScore, maxScore);

    // Paginate: get IDs in reverse order
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let ids;
    if (from || to) {
      ids = await kv.zrange(indexKey, maxScore, minScore, {
        rev: true,
        byScore: true,
        offset: start,
        count: limit,
      });
    } else {
      ids = await kv.zrange(indexKey, start, end, { rev: true });
    }

    if (!ids || ids.length === 0) {
      return res.status(200).json({ items: [], total, page, pages: Math.ceil(total / limit) || 1 });
    }

    // Fetch opportunity data
    const oppData = await Promise.all(
      ids.map((id) => kv.get(keys.opp(id)))
    );

    let items = oppData
      .filter(Boolean)
      .map((d) => (typeof d === "string" ? JSON.parse(d) : d));

    // Secondary filters (text search, combined app+encaje)
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

    res.status(200).json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Error opportunities:", error);
    res.status(500).json({ error: error.message });
  }
}
