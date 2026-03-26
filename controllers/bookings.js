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

    // Validate guest count against listing's maxGuests
    const maxGuests = listing.maxGuests || 10;
    if (parseInt(guests) > maxGuests) {
        req.flash("error", `This property allows a maximum of ${maxGuests} guests.`);
        return res.redirect(`/listings/${id}/book`);
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    // Check for date conflicts (overlapping bookings)
    const existingBookings = await Booking.find({
        listing: id,
        status: { $nin: ['cancelled_by_guest', 'cancelled_by_host'] }, // Ignore cancelled bookings
        $or: [
            // Case 1: New check-in is during an existing booking
            { checkIn: { $lte: checkInDate }, checkOut: { $gt: checkInDate } },
            // Case 2: New check-out is during an existing booking
            { checkIn: { $lt: checkOutDate }, checkOut: { $gte: checkOutDate } },
            // Case 3: New booking completely envelops an existing booking
            { checkIn: { $gte: checkInDate }, checkOut: { $lte: checkOutDate } }
        ]
    });

    if (existingBookings.length > 0) {
        req.flash("error", "Sorry, these dates are already booked! Please select different dates.");
        return res.redirect(`/listings/${id}/book`);
    }

    // Calculate number of nights
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    // Calculate total price
    const totalPrice = listing.price * nights;

    // Create the Booking as "Pending" Payment
    const newBooking = new Booking({
        listing: id,
        user: req.user._id,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: guests,
        totalPrice: totalPrice,
        paymentStatus: "pending"
    });

    await newBooking.save();
    
    // Redirect to our PREIMUM simulated checkout page
    res.render("bookings/payment.ejs", { 
        booking: newBooking, 
        amount: totalPrice,
        listingTitle: listing.title
    });
};

module.exports.simulatePayment = async (req, res) => {
    const { booking_id, status } = req.body;

    // Logic to simulate backend delay for "REAL" feel
    if (status === "success") {
        await Booking.findByIdAndUpdate(booking_id, {
            paymentStatus: "paid"
        });
        req.flash("success", "Payment successful! Your booking is confirmed.");
    } else {
        await Booking.findByIdAndUpdate(booking_id, {
            paymentStatus: "failed"
        });
        req.flash("error", "Payment failed. Please try booking again.");
    }
    
    res.redirect("/bookings");
};

module.exports.showUserBookings = async (req, res) => {
    const bookings = await Booking.find({ user: req.user._id })
        .populate({
            path: 'listing',
            populate: { path: 'owner' } // Need owner to show who canceled
        })
        .sort({ createdAt: -1 });

    res.render("bookings/index.ejs", { bookings });
};

module.exports.cancelBooking = async (req, res) => {
    let { id } = req.params;
    const booking = await Booking.findById(id).populate("listing");
    
    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    // Determine who is cancelling
    if (req.user._id.equals(booking.user)) {
        // Enforce 1-hour limit for guests
        const ONE_HOUR = 60 * 60 * 1000;
        if (Date.now() - new Date(booking.createdAt).getTime() > ONE_HOUR) {
            req.flash("error", "You can only cancel a booking within 1 hour of making it.");
            return res.redirect("/bookings");
        }
        booking.status = 'cancelled_by_guest';
        req.flash("success", "You have successfully cancelled your booking.");
    } else if (req.user._id.equals(booking.listing.owner)) {
        booking.status = 'cancelled_by_host';
        req.flash("success", "You have cancelled the guest's booking.");
    } else {
        req.flash("error", "Unauthorized action.");
        return res.redirect("/bookings");
    }

    await booking.save();
    
    // Redirect back to the page they came from
    const redirectUrl = req.headers.referer || "/bookings";
    res.redirect(redirectUrl);
};

module.exports.getHostBookings = async (req, res) => {
    // Find all listings owned by this user
    const listings = await Listing.find({ owner: req.user._id });
    const listingIds = listings.map(l => l._id);

    // Find all bookings for those listings, populate guest & listing info
    const bookings = await Booking.find({ listing: { $in: listingIds } })
        .populate("listing")
        .populate("user", "username email")
        .sort({ createdAt: -1 });

    // Count new bookings to send to the view
    const newBookingsCount = bookings.filter(b => b.isNewBooking).length;

    res.render("bookings/host.ejs", { bookings, listings, newBookingsCount });

    // Mark all new bookings for this host as seen AFTER rendering
    if (newBookingsCount > 0) {
        const newBookingIds = bookings.filter(b => b.isNewBooking).map(b => b._id);
        await Booking.updateMany({ _id: { $in: newBookingIds } }, { isNewBooking: false });
    }
};
