const Booking = require("../models/booking");
const Listing = require("../models/listing");

module.exports.renderBookingForm = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist");
        return res.redirect("/listings");
    }

    res.render("bookings/book.ejs", { listing });
};

module.exports.createBooking = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist");
        return res.redirect("/listings");
    }

    const { checkIn, checkOut, guests } = req.body.booking;

    // Calculate number of nights
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    // Calculate total price
    const totalPrice = listing.price * nights;

    const newBooking = new Booking({
        listing: id,
        user: req.user._id,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: guests,
        totalPrice: totalPrice
    });

    await newBooking.save();
    req.flash("success", "Booking created successfully!");
    res.redirect("/bookings");
};

module.exports.showUserBookings = async (req, res) => {
    const bookings = await Booking.find({ user: req.user._id })
        .populate("listing")
        .sort({ createdAt: -1 });

    res.render("bookings/index.ejs", { bookings });
};

module.exports.cancelBooking = async (req, res) => {
    let { id } = req.params;
    await Booking.findByIdAndDelete(id);
    req.flash("success", "Booking cancelled successfully!");
    res.redirect("/bookings");
};
