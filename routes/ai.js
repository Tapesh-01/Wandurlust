const express = require("express");
const router = express.Router();
const { wanderbotStream } = require("../services/wanderbot.js");

router.post("/api/ai-chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Set headers for SSE (Server-Sent Events)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = wanderbotStream(message, history);
    let fullReply = "";

    for await (const chunk of stream) {
      fullReply += chunk;
      // Send chunk in SSE format
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("WanderBot Route Error:", err.message || err);
    // If headers haven't been sent, we can send a 500
    if (!res.headersSent) {
      res.status(500).json({ error: "AI service unavailable." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted." })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
