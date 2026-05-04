const mongoose = require('mongoose');
const Listing = require('../models/listing');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.ATLASDB_URL);
    const count = await Listing.countDocuments({});
    console.log("Total Listings:", count);
    process.exit(0);
}
check();
