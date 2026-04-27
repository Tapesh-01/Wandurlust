/**
 * wanderbot.js — WanderBot AI Service
 * Standardized for Gemini 1.5 Flash (Reliable Free Tier)
 */

const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");

const GEMINI_MODELS = [
  "gemini-flash-latest",     // Verified Working (Gemini 3 Flash Preview)
  "gemini-2.5-flash",        // High Performance Fallback
  "gemini-2.0-flash",        // Reliable Fallback
  "gemini-1.5-flash-8b-exp", // Experimental fast tier
];

async function callGemini(apiKey, model, contents) {
  // Free tier keys strongly prefer v1beta for these models
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();

    if (data.candidates && data.candidates[0]) {
      return { ok: true, text: data.candidates[0].content.parts[0].text };
    }
    return { ok: false, code: data.error?.code || res.status, msg: data.error?.message || "Unknown error" };
  } catch (e) {
    return { ok: false, code: 503, msg: e.message };
  }
}

async function buildSystemPrompt() {
  const listings = await Listing.find({}).select("title location price").limit(10).lean();
  const listingCtx = listings.map(l => `• ${l.title} in ${l.location} (₹${l.price})`).join("\n");
  return `You are WanderBot for WanderLust.\n\nLISTINGS:\n${listingCtx}\n\nBe helpful, short, and use emojis.`;
}

async function wanderbotReply(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: true };

  const systemPrompt = await buildSystemPrompt();
  
  // Cleanest possible "Chat history" format for Gemini
  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Understood. I will help users find stays and answer travel questions using this data." }] },
    ...history.slice(-4).map(m => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.text }]
    })),
    { role: "user", parts: [{ text: message }] }
  ];

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    const result = await callGemini(apiKey, model, contents);
    if (result.ok) return { reply: result.text };
    console.error(`WanderBot Debug: Model ${model} failed. Code: ${result.code} | Msg: ${result.msg}`);
    lastError = result;
  }

  if (lastError?.code === 429) return { quota_exceeded: true };
  return { error: true };
}

module.exports = { wanderbotReply };
