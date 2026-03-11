const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const bookingController = require("../controllers/bookings.js");

// Render booking form for a specific listing
router.get(
    "/listings/:id/book",
    isLoggedIn,
    wrapAsync(bookingController.renderBookingForm)
);

// Create a new booking
router.post(
    "/listings/:id/book",
    isLoggedIn,
    wrapAsync(bookingController.createBooking)
);

// Show all bookings for the logged-in user
router.get(
    "/bookings",
    isLoggedIn,
    wrapAsync(bookingController.showUserBookings)
);

// Cancel a booking
router.delete(
    "/bookings/:id",
    isLoggedIn,
    wrapAsync(bookingController.cancelBooking)
);

module.exports = router;
