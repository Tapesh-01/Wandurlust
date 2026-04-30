const express = require("express");
const router = express.Router();
const axios = require("axios");

router.get("/discover", async (req, res) => {
    const { lat, lng, radius = 2000 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "Lat/Lng required" });

    // Overpass API Query: Fetch hotels, guest houses, and landmarks within radius
    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const query = `
        [out:json][timeout:25];
        (
          node["tourism"~"hotel|guest_house|resort|motel|hostel"](around:${radius},${lat},${lng});
          node["amenity"~"hospital|school|college|university|mall|bus_station"](around:${radius},${lat},${lng});
          node["historic"](around:${radius},${lat},${lng});
          node["natural"~"water|wood"](around:${radius},${lat},${lng});
        );
        out body;
    `;

    try {
        const response = await axios.get(overpassUrl, { params: { data: query } });
        const pois = response.data.elements.map(el => ({
            id: el.id,
            name: el.tags.name || el.tags.amenity || el.tags.tourism || "Unknown",
            lat: el.lat,
            lon: el.lon,
            type: el.tags.tourism ? "hotel" : (el.tags.amenity || "landmark")
        }));
        res.json(pois);
    } catch (err) {
        console.error("Overpass API Error:", err.message);
        res.status(500).json({ error: "Failed to fetch map data" });
    }
});

module.exports = router;
