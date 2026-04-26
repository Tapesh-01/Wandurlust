/**
 * wanderbot.js — WanderBot AI Service
 * Handles all Gemini API calls + live context building (DB listings, availability, weather)
 */

const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");

// ── Model fallback chain (first available wins) ──────────────────────────────
const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

// ── Raw REST call to Gemini (no SDK) ────────────────────────────────────────
async function callGemini(apiKey, model, contents, systemInstruction) {
  let lastErr = null;
  // Try v1beta first as it's almost always supported for free tier
  for (const ver of ["v1beta", "v1"]) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`;
    try {
      const payload = { contents };
      if (systemInstruction) {
        payload.system_instruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();

      if (data.candidates && data.candidates[0]) {
        return { ok: true, text: data.candidates[0].content.parts[0].text };
      }
      
      lastErr = { ok: false, code: data.error?.code || res.status, msg: data.error?.message || "Unknown error" };
      
      // If we got a 429, it means the key is hitting its limit for THIS model
      if (lastErr.code === 429) break; 
      
    } catch (e) {
      lastErr = { ok: false, code: 503, msg: e.message };
    }
  }
  return lastErr || { ok: false, code: 404 };
}

// ── Live weather via wttr.in (no API key needed) ─────────────────────────────
async function getWeather(location) {
  try {
    const r = await fetch(
      `https://wttr.in/${encodeURIComponent(location)}?format=3`,
      { signal: AbortSignal.timeout(4000) }
    );
    return r.ok ? (await r.text()).trim() : null;
  } catch {
    return null;
  }
}

// ── Build dynamic system prompt with LIVE data ───────────────────────────────
async function buildSystemPrompt() {
  const listings = await Listing.find({})
    .select("title price location country category maxGuests description")
    .lean();

  const today = new Date();
  const activeBookings = await Booking.find({
    status: "active",
    checkIn: { $lte: today },
    checkOut: { $gte: today },
  })
    .select("listing")
    .lean();
  const bookedIds = new Set(activeBookings.map((b) => b.listing.toString()));

  const listingLines = listings
    .map((l) => {
      const status = bookedIds.has(l._id.toString()) ? "Booked" : "Available";
      return `• ${l.title} | ${l.location} | ₹${l.price} | ${status}`;
    })
    .join("\n");

  const topLoc = listings.length > 0 ? listings[0].location : null;
  const weatherLine = topLoc ? await getWeather(topLoc) : null;
  const weatherInfo = weatherLine ? `• ${weatherLine}` : "Weather data unavailable.";

  return `You are WanderBot 🌍, the AI assistant for WanderLust.
  
=== CURRENT LISTINGS ===
${listingLines || "No listings yet."}

=== WEATHER INFO ===
${weatherInfo}

Rules:
1. Use ACTUAL listing data above for queries.
2. Answer ANY general travel questions using your internal knowledge.
3. Keep answers friendly, short, and use emojis. 🌍
Date: ${new Date().toDateString()}`;
}

// ── Main exported function — call this from the route ────────────────────────
async function wanderbotReply(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("WanderBot Error: GEMINI_API_KEY is missing!");
    return { error: true };
  }

  const systemInstruction = await buildSystemPrompt();

  const contents = [
    ...history.slice(-4).map((m) => ({ 
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    const result = await callGemini(apiKey, model, contents, systemInstruction);
    if (result.ok) return { reply: result.text };
    console.error(`WanderBot Model ${model} failed with code: ${result.code}`, result.msg || "");
    lastError = result;
  }

  if (lastError?.code === 429) return { quota_exceeded: true };
  return { error: true };
}

module.exports = { wanderbotReply };
