/**
 * wanderbot.js — WanderBot AI Service
 * Handles all Gemini API calls + live context building (DB listings, availability, weather)
 */

const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");

// ── Model fallback chain (first available wins) ──────────────────────────────
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

// ── Raw REST call to Gemini (no SDK) ────────────────────────────────────────
async function callGemini(apiKey, model, contents) {
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
      if (data.error?.code === 429) return { ok: false, code: 429 };
      if (data.error?.code !== 404) return { ok: false, code: data.error?.code || 500 };
      // 404 = model not on this API version → try next version
    } catch (e) {
      return { ok: false, code: 503, msg: e.message };
    }
  }
  return { ok: false, code: 404 };
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
  // 1. All listings from DB (auto-updates as new listings are added)
  const listings = await Listing.find({})
    .select("title price location country category maxGuests description")
    .lean();

  // 2. Which listings are currently booked (checking today's date)
  const today = new Date();
  const activeBookings = await Booking.find({
    status: "active",
    checkIn: { $lte: today },
    checkOut: { $gte: today },
  })
    .select("listing")
    .lean();
  const bookedIds = new Set(activeBookings.map((b) => b.listing.toString()));

  // 3. Format listing data as readable lines
  const listingLines = listings
    .map((l) => {
      const status = bookedIds.has(l._id.toString())
        ? "❌ Currently Booked"
        : "✅ Available Now";
      const desc = l.description ? ` | 📝 ${l.description.substring(0, 80)}` : "";
      return `• "${l.title}" | 📍 ${l.location}, ${l.country} | 💰 ₹${l.price}/night | 👥 Max ${l.maxGuests} guests | 🏷️ ${l.category} | ${status}${desc}`;
    })
    .join("\n");

  // 4. Live weather for top 3 unique locations
  const uniqueLocations = [
    ...new Set(listings.map((l) => l.location).filter(Boolean)),
  ].slice(0, 3);
  const weatherResults = await Promise.all(
    uniqueLocations.map((loc) => getWeather(loc))
  );
  const weatherLines = uniqueLocations
    .map((loc, i) => (weatherResults[i] ? `• ${weatherResults[i]}` : null))
    .filter(Boolean)
    .join("\n");

  return `You are WanderBot 🌍, the smart AI travel assistant for WanderLust — a premium Airbnb-style property booking platform built in India.

=== LIVE WANDERLUST LISTINGS (real-time from database) ===
${listingLines || "No listings found."}

=== CURRENT WEATHER AT OUR TOP LOCATIONS ===
${weatherLines || "Weather data unavailable."}

=== WHAT YOU CAN DO ===
PLATFORM-SPECIFIC (use live data above):
- Answer questions about specific listings, exact prices, availability right now
- Help users pick the best stay based on their budget, guests, category preference
- Tell if a property is currently available or booked
- Share live weather at listed destinations
- Explain how WanderLust works: searching, booking, messaging hosts, writing reviews

GENERAL TRAVEL KNOWLEDGE (use your own knowledge freely):
- Answer ANY travel question — destinations, countries, cities worldwide
- Visa requirements, best time to visit, travel documents, currency info
- Flight tips, train routes, budget travel hacks, solo travel advice
- Hotel vs hostel vs Airbnb comparisons, what to pack for any trip
- Local culture, food recommendations, must-see attractions anywhere in the world
- Weather at ANY location (not just our listing cities)
- Safety tips, travel insurance, health precautions for different countries
- Itinerary planning, day trip suggestions, hidden gems
- Indian travel tips: best hill stations, beaches, heritage sites, budget trips

=== RULES ===
- For WanderLust listings: use ACTUAL data above. Never make up property names or prices.
- For general travel questions: answer freely using your knowledge — do NOT say "I can only help with WanderLust".
- If a user wants to book a WanderLust property, guide them to the listing page.
- If asked about weather anywhere (not in our DB), you can still give a general answer based on your knowledge.
- Answer in the same language the user writes in (Hindi / English / Hinglish).
- Be warm, friendly, and concise. Use emojis occasionally. 🌍
- Today's date: ${new Date().toDateString()}`;
}

// ── Main exported function — call this from the route ────────────────────────
async function wanderbotReply(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemPrompt = await buildSystemPrompt();

  const contents = [
    { role: "user",  parts: [{ text: "Who are you and what listings do you have?" }] },
    { role: "model", parts: [{ text: systemPrompt }] },
    ...history.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    const result = await callGemini(apiKey, model, contents);
    if (result.ok) return { reply: result.text };
    lastError = result;
    if (result.code !== 429 && result.code !== 404) break; // hard error, stop
  }

  if (lastError?.code === 429) return { quota_exceeded: true };
  return { error: true };
}

module.exports = { wanderbotReply };
