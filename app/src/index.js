import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ message: "Pollution Monitoring App Running" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Example endpoint to receive sensor data later
app.post("/ingest", (req, res) => {
  res.json({ ok: true, received: req.body });
});

app.listen(PORT, () => {
  console.log(`pollution-app listening on http://localhost:${PORT}`);
});