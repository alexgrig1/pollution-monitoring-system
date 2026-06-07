import express from "express";

// import { calculateAggregates } from "../services/aggregateService.js";
// import {
//   getHourlyAggregates,
//   getDailyAggregates,
//   getShiftAggregates,
// } from "../services/dataService.js";

const router = express.Router();

router.post("/calculate", async (req, res) => {
  try {
    const result = await calculateAggregates();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/hourly", async (req, res) => {
  try {
    const result = await getHourlyAggregates(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/daily", async (req, res) => {
  try {
    const result = await getDailyAggregates(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/shift", async (req, res) => {
  try {
    const result = await getShiftAggregates(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;