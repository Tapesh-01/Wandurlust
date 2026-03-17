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

// Simulate payment success/failure
router.post(
    "/bookings/simulate-payment",
    isLoggedIn,
    wrapAsync(bookingController.simulatePayment)
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

// Host dashboard - show bookings on my listings
router.get(
    "/host/bookings",
    isLoggedIn,
    wrapAsync(bookingController.getHostBookings)
);

module.exports = router;
