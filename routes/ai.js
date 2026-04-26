/**
 * routes/ai.js — WanderBot AI Chat Route
 * POST /api/ai-chat
 */

const express = require("express");
const router = express.Router();
const { wanderbotReply } = require("../services/wanderbot.js");

router.post("/api/ai-chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const result = await wanderbotReply(message, history);

    if (result.quota_exceeded) {
      return res.status(429).json({ error: "quota_exceeded" });
    }
    if (result.error) {
      return res.status(500).json({ error: "AI service unavailable. Please try again." });
    }

    res.json({ reply: result.reply });
  } catch (err) {
    console.error("WanderBot Route Error:", err.message || err);
    res.status(500).json({ error: "AI service unavailable. Please try again." });
  }
});

module.exports = router;
