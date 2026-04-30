const Listing = require("../models/listing");
const Booking = require("../models/booking");

module.exports.index = async (req, res) => {
  const { search, maxPrice, category, guests, dates } = req.query;
  
  let query = {};
  
  // 1. Build Text Search Condition
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
      { country: { $regex: search, $options: 'i' } }
    ];
  }

  // 2. Build Max Price Condition
  if (maxPrice && !isNaN(maxPrice)) {
    query.price = { $lte: parseInt(maxPrice) };
  }

  // 3. Build Category Condition (Only if NO search is present)
  if (category && !search) {
    query.category = category;
  }

  // 4. Build Guests Limit Condition
  if (guests && !isNaN(guests) && parseInt(guests) > 0) {
    query.maxGuests = { $gte: parseInt(guests) };
  }

  // 5. Build Dates Availability Conflict Condition
  if (dates && dates.includes("to")) {
    const datesArr = dates.split(" to ");
    if (datesArr.length === 2) {
      const searchStart = new Date(datesArr[0]);
      const searchEnd = new Date(datesArr[1]);
      
      // Find all bookings that overlap with the requested dates
      // Overlap logic: booking.checkIn < searchEnd AND booking.checkOut > searchStart
      const conflictingBookings = await Booking.find({
        checkIn: { $lt: searchEnd },
        checkOut: { $gt: searchStart }
      }).select('listing');
      
      const conflictingListingIds = conflictingBookings.map(b => b.listing);
      
      if (conflictingListingIds.length > 0) {
        query._id = { $nin: conflictingListingIds };
      }
    }
  }

  const allListings = await Listing.find(query).populate("reviews");

  res.render("listings/index.ejs", { allListings, search, maxPrice, category });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
      },
    })
    .populate("owner"); // This is the fix for showing owner data

  if (!listing) {
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }
  console.log(listing);
  res.render("listings/show.ejs", { listing });
};

// Free Geocoding helper using Nominatim (OpenStreetMap)
async function getCoordinates(location, country) {
  try {
    const query = encodeURIComponent(`${location}, ${country}`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'WandurLust/1.0' }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        type: 'Point',
        coordinates: [parseFloat(data[0].lon), parseFloat(data[0].lat)]
      };
    }
    return null;
  } catch (e) {
    console.error("Geocoding Error:", e.message);
    return null;
  }
}

module.exports.createListing = async (req, res, next) => {
  const newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;

  // Set geometry: Use coordinates from frontend if available, else geocode
  if (req.body.listing.lat && req.body.listing.lng) {
    newListing.geometry = {
      type: "Point",
      coordinates: [parseFloat(req.body.listing.lng), parseFloat(req.body.listing.lat)]
    };
  } else {
    const geometry = await getCoordinates(req.body.listing.location, req.body.listing.country);
    if (geometry) {
      newListing.geometry = geometry;
    } else {
      req.flash("error", "Location not found, please try a clearer city/country name.");
      return res.redirect("/listings/new");
    }
  }

  // Map all uploaded files to {url, filename} objects
  if (req.files && req.files.length > 0) {
    const images = req.files.map(f => ({ url: f.path, filename: f.filename }));
    const coverIndex = parseInt(req.body.coverIndex) || 0;
    
    // If user picked a specific cover, move it to the front
    if (coverIndex > 0 && coverIndex < images.length) {
      const [coverImg] = images.splice(coverIndex, 1);
      images.unshift(coverImg);
    }
    
    newListing.images = images;
  }
  await newListing.save();
  
  // REAL-TIME: Emit new listing to all clients for Global Map update
  try {
    const io = req.app.get("socketio");
    if (io) {
      io.emit("new_listing", newListing);
    }
  } catch (err) {
    console.error("Socket emit error:", err);
  }

  req.flash("success", "New Listing Created!");
  res.redirect("/listings");
}

module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }
  res.render("listings/edit.ejs", { listing });
};

module.exports.updateListing = async (req, res) => {
  let { id } = req.params;
  
  let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing }, { new: true });

  // Update geometry: Use coordinates from frontend if available, else geocode
  if (req.body.listing.lat && req.body.listing.lng) {
    listing.geometry = {
      type: "Point",
      coordinates: [parseFloat(req.body.listing.lng), parseFloat(req.body.listing.lat)]
    };
  } else {
    const geometry = await getCoordinates(req.body.listing.location, req.body.listing.country);
    if (geometry) {
      listing.geometry = geometry;
    }
  }


  // Append newly uploaded images to the images[] array
  if (req.files && req.files.length > 0) {
    const newImages = req.files.map(f => ({ url: f.path, filename: f.filename }));
    listing.images.push(...newImages);
  }

  // Remove images that the user checked to delete
  if (req.body.deleteImages) {
    const toDelete = Array.isArray(req.body.deleteImages)
      ? req.body.deleteImages
      : [req.body.deleteImages];
    listing.images = listing.images.filter(img => !toDelete.includes(img.filename));
    if (listing.image && listing.image.filename && toDelete.includes(listing.image.filename)) {
      listing.image = { url: undefined, filename: undefined };
    }
  }

  // Reorder images so that coverImage is first (index 0)
  if (req.body.coverImage && listing.images.length > 0) {
    const coverFilename = req.body.coverImage;
    const coverIdx = listing.images.findIndex(img => img.filename === coverFilename);
    if (coverIdx > 0) {
      const [coverImg] = listing.images.splice(coverIdx, 1);
      listing.images.unshift(coverImg);
    }
  }

  await listing.save();
  req.flash("success", "Listing Updated!");
  res.redirect(`/listings/${id}`);
};
module.exports.destroyListing = async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  req.flash("success", "Listing Deleted!");
  res.redirect("/listings");
}

module.exports.userListings = async (req, res) => {
  const allListings = await Listing.find({ owner: req.user._id });
  res.render("listings/user_listings.ejs", { allListings });
};

module.exports.renderExplorePage = async (req, res) => {
  let { minPrice, maxPrice, category } = req.query;
  let query = {};

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  if (category && category !== "All") {
    query.category = category;
  }

  const allListings = await Listing.find(query).populate("reviews");
  res.render("listings/explore.ejs", { allListings, filters: req.query });
};

module.exports.renderDestinationsPage = async (req, res) => {
  const allListings = await Listing.find({}).populate("reviews");
  // Group by location
  const cityGroups = {};
  allListings.forEach(l => {
    if(!cityGroups[l.location]) {
      cityGroups[l.location] = [];
    }
    cityGroups[l.location].push(l);
  });
  res.render("listings/destinations.ejs", { cityGroups });
};