/**
 * wanderbot.js — WanderBot AI Service
 * Standardized for Gemini 1.5 Flash (Reliable Free Tier)
 */

const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");

const GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash"
];

async function callGemini(apiKey, model, contents) {
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
  // 1. Fetch real-time total count
  const totalCount = await Listing.countDocuments({});

  // 2. Extract keywords to search in DB
  const keywords = userQuery.split(/\s+/).filter(w => w.length > 2);
  let listings = [];
  
  // Also fetch unique categories
  const categories = await Listing.distinct("category");
  
  if (keywords.length > 0) {
    // Improved search: check more fields and increase limit for specific city/state requests
    const searchRegex = new RegExp(keywords.join("|"), "i");
    listings = await Listing.find({
      $or: [
        { title: searchRegex },
        { location: searchRegex },
        { country: searchRegex },
        { category: searchRegex },
        { description: searchRegex }
      ]
    }).select("title location price category").limit(20).lean();
  }

  // Fallback to top listings if no specific keyword matches
  if (listings.length < 5) {
    const general = await Listing.find({}).sort({createdAt: -1}).select("title location price category").limit(10).lean();
    const seen = new Set(listings.map(l => l._id.toString()));
    for (const item of general) {
      if (!seen.has(item._id.toString()) && listings.length < 15) {
        listings.push(item);
      }
    }
  }

  const listingCtx = listings.map(l => `• ${l.title} in ${l.location} [Category: ${l.category}] (₹${l.price}/night)`).join("\n");
  
  return `You are WanderBot, the premium AI Travel Expert for WanderLust.
  
OUR REAL-TIME STATUS:
- Total Properties in Database: ${totalCount}. (Always mention the actual total if asked).
- Available Categories: ${categories.join(", ")}.

CONTEXT LISTINGS (Top matches for current query):
${listingCtx || "We are currently updating our picks. But we have properties globally!"}

INTERACTION GUIDELINES:
1. ACCURACY: If the user asks for the total number of listings, tell them exactly ${totalCount}.
2. RECOMMENDATION: Suggest specific listings from the context above. If you find a city/state match, show all of them.
3. PERSONALITY: Be professional, energetic, and use travel emojis! 🎒🏨✨`;
}

/**
 * wanderbotStream — Handles streaming response from Gemini
 */
async function* wanderbotStream(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    yield "Error: Gemini API Key missing.";
    return;
  }

  const systemPrompt = await buildSystemPrompt(message);
  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Understood. I will provide real-time info and stream my responses word-by-word." }] },
    ...history.slice(-6).map(m => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.text }]
    })),
    { role: "user", parts: [{ text: message }] }
  ];

  // Try models in sequence
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Gemini Stream Error (${model}):`, errorData);
        continue; // Try next model
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Gemini streaming returns a JSON array or multiple objects
        // We need to parse chunks carefully
        let startIdx = buffer.indexOf('{');
        while (startIdx !== -1) {
          let endIdx = -1;
          let depth = 0;
          for (let i = startIdx; i < buffer.length; i++) {
            if (buffer[i] === '{') depth++;
            else if (buffer[i] === '}') depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }

          if (endIdx !== -1) {
            const jsonStr = buffer.substring(startIdx, endIdx + 1);
            try {
              const chunk = JSON.parse(jsonStr);
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) yield text;
            } catch (e) {
              // Partial JSON, wait for more data
            }
            buffer = buffer.substring(endIdx + 1);
            startIdx = buffer.indexOf('{');
          } else {
            break;
          }
        }
      }
      return; // Success, exit generator
    } catch (err) {
      console.error(`Stream Failed for ${model}:`, err.message);
    }
  }
  yield "AI service is currently unavailable. Please try again later.";
}

module.exports = { wanderbotReply: async (m, h) => { /* fallback if needed */ }, wanderbotStream };
