/**
 * wanderbot.js — WanderBot AI Service
 * Standardized for Gemini 1.5 Flash (Reliable Free Tier)
 */

const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-pro"
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

async function buildSystemPrompt(userQuery = "") {
  // Extract keywords to search in DB
  const keywords = userQuery.split(/\s+/).filter(w => w.length > 2);
  let listings = [];
  
  // Also fetch unique categories to tell AI our strengths
  const categories = await Listing.distinct("category");
  
  if (keywords.length > 0) {
    const searchRegex = new RegExp(keywords.join("|"), "i");
    listings = await Listing.find({
      $or: [
        { title: searchRegex },
        { location: searchRegex },
        { country: searchRegex },
        { category: searchRegex }
      ]
    }).select("title location price category").limit(8).lean();
  }

  // Fallback to top/recent listings if no keyword matches
  if (listings.length < 3) {
    const general = await Listing.find({}).sort({createdAt: -1}).select("title location price category").limit(5).lean();
    const seen = new Set(listings.map(l => l._id.toString()));
    for (const item of general) {
      if (!seen.has(item._id.toString()) && listings.length < 10) {
        listings.push(item);
      }
    }
  }

  const listingCtx = listings.map(l => `• ${l.title} in ${l.location} [Category: ${l.category}] (₹${l.price}/night)`).join("\n");
  
  return `You are WanderBot, the premium AI Travel Expert for WanderLust.
  
OUR INVENTORY & STRENGTHS:
- We have properties in categories like: ${categories.join(", ")}.
- Total available stays shown to you: ${listings.length}.

AVAILABLE LISTINGS DATA:
${listingCtx || "Currently, we are refreshing our top picks. Tell the user we have amazing stays globally!"}

INTERACTION GUIDELINES:
1. RECOMMENDATION: Always try to suggest a specific listing from the list above if it matches the user's vibe/location/budget.
2. PRICE SENSITIVITY: If the user asks for "cheap" or "budget", pick the lowest price ones from the list.
3. CONTEXT: If the user asks for a place NOT in the list, use your general knowledge but mention: "On WanderLust, we have great options in similar vibes, but here is what's trending elsewhere..."
4. PERSONALITY: Be helpful, energetic, and use travel emojis! 🎒🏨✨`;
}

async function wanderbotReply(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: true };

  const systemPrompt = await buildSystemPrompt(message);
  
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
