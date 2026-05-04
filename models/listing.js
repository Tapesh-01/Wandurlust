const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");

const listingSchema = new Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  // OLD field — kept for backward compat with existing DB records
  image: {
    url: String,
    filename: String,
  },
  // NEW field — used for multi-image uploads
  images: [
    {
      url: String,
      filename: String,
    }
  ],


  price: Number,
  location: String,
  country: String,
  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref: "Review",
    },
  ],
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  maxGuests: {
    type: Number,
    default: 10,
    min: 1,
  },
  category: {
    type: String,
    enum: ['Trending', 'Rooms', 'Iconic Cities', 'Mountains', 'Castels', 'Amezing Pool', 'Camping', 'Farms', 'Arctic', 'Domes', 'Boats', 'Resort'],
    default: 'Trending'
  },
  geometry: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  views: {
    type: Number,
    default: 0
  }
});

listingSchema.post("findOneAndDelete", async (listing) => {
  if (listing) {
    const Review = require("./review.js");
    const Booking = require("./booking.js");
    await Review.deleteMany({ _id: { $in: listing.reviews } });
    await Booking.deleteMany({ listing: listing._id });
  }
});


const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;