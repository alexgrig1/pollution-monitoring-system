import express from "express";

// import {
//   generateRuleFromPrompt,
//   getGeneratedRules,
//   getGeneratedRuleById,
//   updateGeneratedRuleStatus,
// } from "../services/aiRuleService.js";

const router = express.Router();

router.post("/generate", async (req, res) => {
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
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await getGeneratedRules(req.query.limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await getGeneratedRuleById(req.params.id);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const result = await updateGeneratedRuleStatus(req.params.id, status);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;