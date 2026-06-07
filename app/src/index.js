import express from "express";
import path from "path";
import gitWorkspaceRoutes from "./routes/gitWorkspaceRoutes.js";
import dataObjectChangeRoutes from "./routes/dataObjectChangeRoutes.js";
// import runtimeControlRoutes from "./routes/runtimeControlRoutes.js";
import { initDb, dbPath } from "./db.js";
// import { ingestReading } from "./services/ingestService.js";
import aggregateRoutes from "./routes/aggregateRoutes.js";
import modelGovernanceRoutes from "./routes/modelGovernanceRoutes.js";
import dataRoutes from "./routes/dataRoutes.js";
import aiRuleRoutes from "./routes/aiRuleRoutes.js";


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



app.use("/api/git-workspace", gitWorkspaceRoutes);
// app.use("/api/runtime", runtimeControlRoutes);
app.use("/api/model", modelGovernanceRoutes);
app.use("/api/model/change", dataObjectChangeRoutes);
app.use("/api", dataRoutes);
app.use("/api/aggregates", aggregateRoutes);
app.use("/api/ai-rules", aiRuleRoutes);
app.use("/api/model", modelGovernanceRoutes);
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