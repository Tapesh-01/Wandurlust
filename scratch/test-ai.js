require('dotenv').config();
const mongoose = require('mongoose');
const { wanderbotReply } = require('../services/wanderbot.js');

const MONGO_URL = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

async function test() {
    try {
        await mongoose.connect(MONGO_URL);
        console.log("DB Connected");
        const res = await wanderbotReply("hello");
        console.log("Result:", res);
        process.exit(0);
    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
}

test();
