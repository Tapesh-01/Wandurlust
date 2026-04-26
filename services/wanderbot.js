/**
 * wanderbot.js — WanderBot AI Service
 * Handles all Gemini API calls + live context building (DB listings)
 */

const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

async function callGemini(apiKey, model, contents) {
  let lastErr = null;
  // Using v1beta for widest compatibility
  for (const ver of ["v1beta", "v1"]) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`;
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
      
      lastErr = { ok: false, code: data.error?.code || res.status, msg: data.error?.message || "Unknown error" };
      if (lastErr.code === 429) return lastErr; 
      
    } catch (e) {
      lastErr = { ok: false, code: 503, msg: e.message };
    }
  }
  return lastErr || { ok: false, code: 404 };
}

async function getWeather(location) {
  try {
    const r = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=3`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? (await r.text()).trim() : null;
  } catch { return null; }
}

async function buildSystemPrompt() {
  const listings = await Listing.find({}).select("title price location country category description").limit(15).lean();
  const listingLines = listings.map(l => `• ${l.title} | ${l.location} | ₹${l.price}`).join("\n");
  
  return `You are WanderBot 🌍, the AI assistant for WanderLust.
  
=== CURRENT LISTINGS ===
${listingLines || "No listings yet."}

Rules:
1. Use listing data above for queries.
2. Answer any travel questions.
3. Keep it short and use emojis. 🌍`;
}

async function wanderbotReply(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: true };

  const systemPrompt = await buildSystemPrompt();

  // Simple, standard payload (System Context as the first turn)
  const contents = [
    { role: "user",  parts: [{ text: `SYSTEM CONTEXT: ${systemPrompt}\n\nUSER MESSAGE: ${message}` }] },
    ...history.slice(-4).map(m => ({ 
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.text }] 
    })).filter(m => m.parts[0].text !== message) // prevent duplicates
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
