import { kv } from "@vercel/kv";
import { keys, DEFAULT_FEEDS, DEFAULT_ALERTS } from "./_lib/kv-schema.js";
import { loadConfig } from "./_lib/persistence.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const [feeds, alerts] = await Promise.all([
        loadConfig(keys.configFeeds(), DEFAULT_FEEDS),
        loadConfig(keys.configAlerts(), DEFAULT_ALERTS),
      ]);
      return res.status(200).json({ feeds, alerts });
    }

    if (req.method === "POST") {
      // Auth temporarily disabled
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      if (body.feeds) {
        // Validate feeds array
        const feeds = body.feeds.map((f, i) => ({
          id: f.id || `feed-${i}`,
          name: f.name || `Feed ${i + 1}`,
          url: f.url || "",
          enabled: f.enabled !== false,
          category: f.category || "general",
        }));
        await kv.set(keys.configFeeds(), JSON.stringify(feeds));
      }

      if (body.alerts) {
        const alerts = {
          enabled: body.alerts.enabled !== false,
          minEncaje: ["ALTO", "MEDIO", "BAJO"].includes(body.alerts.minEncaje)
            ? body.alerts.minEncaje
            : "BAJO",
          apps: Array.isArray(body.alerts.apps) ? body.alerts.apps : [],
          emailTo: Array.isArray(body.alerts.emailTo) ? body.alerts.emailTo : [],
        };
        await kv.set(keys.configAlerts(), JSON.stringify(alerts));
      }

      // Return updated config
      const [feeds, alerts] = await Promise.all([
        loadConfig(keys.configFeeds(), DEFAULT_FEEDS),
        loadConfig(keys.configAlerts(), DEFAULT_ALERTS),
      ]);
      return res.status(200).json({ feeds, alerts, saved: true });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Error config:", error);
    res.status(500).json({ error: error.message });
  }
}
