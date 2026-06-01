import express from "express";
import path from "path";
import { initDb, allSql, dbPath } from "./db.js";
import { ingestReading } from "./services/ingestService.js";
import { getKieConfig } from "./services/kieService.js";
import { runAggregateRules } from "./services/aggregateKieService.js";
import { seedDemoData } from "./services/demoDataService.js";
import {
  generateRuleFromPrompt,
  getGeneratedRules,
  getGeneratedRuleById,
  updateGeneratedRuleStatus,
} from "./services/aiRuleService.js";
import {
  getReadings,
  getAlerts,
  getHourlyAggregates,
  getDailyAggregates,
  getShiftAggregates,
} from "./services/dataService.js";
import { calculateAggregates } from "./services/aggregateService.js";
import {
  getKieStatus,
  deployKieContainer,
} from "./services/kieAdminService.js";

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  console.log("Incoming:", req.method, req.url);
  next();
});

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.json({ ok: true, dbPath });
});

app.get("/debug/kie", async (req, res) => {
  const { baseUrl, user, pass } = getKieConfig();

  if (!baseUrl || !user || !pass) {
    return res.status(500).json({
      ok: false,
      error: "Missing KIE_BASE_URL / KIE_USER / KIE_PASS",
      got: {
        KIE_BASE_URL: baseUrl,
        KIE_USER: user ? "SET" : "NOT SET",
        KIE_PASS: pass ? "SET" : "NOT SET",
      },
    });
  }

  const url = `${baseUrl}/server/containers`;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    const text = await r.text();

    return res.status(r.status).json({
      ok: r.ok,
      kieStatus: r.status,
      kieUrl: url,
      kieResponse: text,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e),
      kieUrl: url,
    });
  }
});

app.post("/ingest", async (req, res) => {
  const result = await ingestReading(req.body);
  return res.status(result.status).json(result.body);
});

app.get("/debug/db", async (req, res) => {
  try {
    const rawReadings = await allSql(
      `SELECT * FROM raw_readings ORDER BY id DESC LIMIT 20`
    );
    const alerts = await allSql(
      `SELECT * FROM alerts ORDER BY id DESC LIMIT 20`
    );

    res.json({
      ok: true,
      dbPath,
      rawReadings,
      alerts,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
      dbPath,
    });
  }
});

app.get("/api/readings", async (req, res) => {
  try {
    const result = await getReadings(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

app.get("/api/alerts", async (req, res) => {
  try {
    const result = await getAlerts(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

app.get("/api/status", async (req, res) => {
  try {
    const status = await getKieStatus();
    res.json(status);
  } catch (err) {
    res.json({
      kie: "DOWN",
      error: String(err),
    });
  }
});
app.get("/api/ollama-test", async (req, res) => {
  try {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";
    const model = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:3b";

    const response = await fetch(`${baseUrl}/api/tags`);
    const data = await response.json();

    res.json({
      ok: true,
      baseUrl,
      model,
      ollama: data,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});
app.post("/api/ai-rules/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Missing prompt",
      });
    }

    const result = await generateRuleFromPrompt(prompt);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

app.get("/api/ai-rules", async (req, res) => {
  try {
    const result = await getGeneratedRules(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

app.get("/api/ai-rules/:id", async (req, res) => {
  try {
    const result = await getGeneratedRuleById(req.params.id);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

app.post("/api/ai-rules/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const result = await updateGeneratedRuleStatus(req.params.id, status);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});
app.post("/api/demo/seed", async (req, res) => {
  try {
    const result = await seedDemoData({
      days: Number(req.query.days ?? 7),
      intervalMinutes: Number(req.query.interval ?? 15),
      reset: req.query.reset !== "false",
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});

app.post("/api/aggregates/run-rules", async (req, res) => {
  try {
    const result = await runAggregateRules(req.query.limit);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});
app.post("/api/kie/deploy", async (req, res) => {
  try {
    const result = await deployKieContainer();
    res.status(result.status).json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String(err),
    });
  }
});
app.post("/api/aggregates/calculate", async (req, res) => {
  try {
    const result = await calculateAggregates();
    res.json(result);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
    });
  }
});
app.get("/api/aggregates/hourly", async (req, res) => {
  try {
    const result = await getHourlyAggregates(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/aggregates/daily", async (req, res) => {
  try {
    const result = await getDailyAggregates(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/aggregates/shift", async (req, res) => {
  try {
    const result = await getShiftAggregates(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
const publicDir = path.resolve(process.cwd(), "public");
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

initDb();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`pollution-app listening on http://localhost:${PORT}`);
  console.log(`Using SQLite DB at: ${dbPath}`);
});