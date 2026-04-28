const Booking = require("../models/booking");
const Listing = require("../models/listing");
const PDFDocument = require("pdfkit");

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalizes guest names: ensures array, trims, and pads with defaults if missing
 */
const normalizeGuestNames = (guestNames, guestCount, defaultPrimaryName) => {
    let names = Array.isArray(guestNames) ? guestNames : (guestNames ? [guestNames] : []);
    names = names.map(n => (n || '').trim());
    
    const count = parseInt(guestCount) || 1;
    const result = [];
    for (let i = 0; i < count; i++) {
        if (names[i]) {
            result.push(names[i]);
        } else {
            result.push(i === 0 ? defaultPrimaryName : `Guest ${i + 1}`);
        }
    }
    return result;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

    const { checkIn, checkOut, guests, guestNames } = req.body.booking;

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
        status: { $nin: ['cancelled_by_guest', 'cancelled_by_host'] },
        $or: [
            { checkIn: { $lte: checkInDate }, checkOut: { $gt: checkInDate } },
            { checkIn: { $lt: checkOutDate }, checkOut: { $gte: checkOutDate } },
            { checkIn: { $gte: checkInDate }, checkOut: { $lte: checkOutDate } }
        ]
    });

    if (existingBookings.length > 0) {
        req.flash("error", "Sorry, these dates are already booked! Please select different dates.");
        return res.redirect(`/listings/${id}/book`);
    }

    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const baseTotal = listing.price * nights;
    const taxRate = listing.taxRate || 0;
    const taxAmount = (baseTotal * taxRate) / 100;
    const totalPrice = baseTotal + taxAmount;

    // Use helper to normalize guest names
    const names = normalizeGuestNames(guestNames, guests, req.user.username);

    const newBooking = new Booking({
        listing: id,
        user: req.user._id,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: guests,
        guestNames: names,
        totalPrice: totalPrice,
        paymentStatus: "pending"
    });

    await newBooking.save();

    res.render("bookings/payment.ejs", {
        booking: newBooking,
        amount: totalPrice,
        listingTitle: listing.title
    });
};

module.exports.simulatePayment = async (req, res) => {
    const { booking_id, status } = req.body;

    if (status === "success") {
        await Booking.findByIdAndUpdate(booking_id, { paymentStatus: "paid" });
        return res.redirect(`/bookings?newBooking=${booking_id}`);
    } else {
        await Booking.findByIdAndUpdate(booking_id, { paymentStatus: "failed" });
        req.flash("error", "Payment failed. Please try booking again.");
        return res.redirect("/bookings");
    }
};

module.exports.showUserBookings = async (req, res) => {
    const bookings = await Booking.find({ user: req.user._id })
        .populate({
            path: 'listing',
            populate: { path: 'owner' }
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

    if (req.user._id.equals(booking.user)) {
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
    const redirectUrl = req.headers.referer || "/bookings";
    res.redirect(redirectUrl);
};

module.exports.getHostBookings = async (req, res) => {
    const listings = await Listing.find({ owner: req.user._id });
    const listingIds = listings.map(l => l._id);

    const bookings = await Booking.find({ listing: { $in: listingIds } })
        .populate("listing")
        .populate("user", "username email")
        .sort({ createdAt: -1 });

    const newBookingsCount = bookings.filter(b => b.isNewBooking).length;

    res.render("bookings/host.ejs", { bookings, listings, newBookingsCount });

    if (newBookingsCount > 0) {
        const newBookingIds = bookings.filter(b => b.isNewBooking).map(b => b._id);
        await Booking.updateMany({ _id: { $in: newBookingIds } }, { isNewBooking: false });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DOWNLOAD PDF TICKET — Refactored modular layout
// ═══════════════════════════════════════════════════════════════════════════════

module.exports.downloadTicket = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id)
        .populate("listing")
        .populate("user", "username email");

    if (!booking || !req.user._id.equals(booking.user._id) || booking.paymentStatus !== "paid") {
        req.flash("error", "Ticket unavailable or unauthorized.");
        return res.redirect("/bookings");
    }

    const listing = booking.listing;
    const user = booking.user;
    const nights = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
    const perNight = listing.price || Math.round(booking.totalPrice / nights);
    const bookingRef = booking._id.toString().slice(-8).toUpperCase();

    // Data formatters
    const fmtShort = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const fmtLong  = (d) => new Date(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const fmtMon   = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const fmtMoney = (n) => `\u20B9${Number(n).toLocaleString("en-IN")}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="WandurLust-Ticket-${bookingRef}.pdf"`);

    const doc = new PDFDocument({ margin: 0, size: "A4" });
    doc.pipe(res);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const ML = 50;
    const MR = PW - 50;
    const CW = MR - ML;

    // ── Internal Helpers ──
    const hRule = (y, color = "#cccccc") => doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor(color).stroke();
    const drawBox = (x, y, w, h) => doc.rect(x, y, w, h).lineWidth(0.5).strokeColor("#cccccc").stroke();
    const innerRule = (x, y, w) => doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).strokeColor("#e0e0e0").stroke();

    // 1. TOP HEADER & LOGO
    let y = 28;
    doc.font("Helvetica").fontSize(8).fillColor("#555555").text(fmtShort(booking.createdAt), ML, y);
    doc.text(`WandurLust Travel Receipt, Confirmation Code ${bookingRef}`, ML, y, { align: "center", width: CW });
    
    // Address block
    const addr = ["WandurLust Pvt. Ltd.", "Harinagar, Durg, CG 490022", `Booking ID: ${bookingRef}`];
    addr.forEach((line, i) => doc.text(line, ML, y + (i * 11), { align: "right", width: CW }));
    
    y = 80;
    doc.rect(ML, y, 3, 28).fill("#fe424d");
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#111111").text("WandurLust", ML + 12, y + 2);
    doc.font("Helvetica").fontSize(8.5).fillColor("#fe424d").text("TRAVEL & STAYS", ML + 12, y + 24);
    
    y += 36; hRule(y);

    // 2. CONFIRMATION TITLE
    y += 22;
    const titleText = `Confirmed: ${nights} night${nights > 1 ? "s" : ""} in ${listing.location}, ${listing.country}`;
    doc.font("Helvetica-Bold").fontSize(19).fillColor("#111111").text(titleText, ML, y, { width: CW });
    
    y += 35;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#222222").text(`Booked by ${user.username}`, ML, y);
    doc.font("Helvetica").fontSize(9).fillColor("#777777").text(fmtLong(booking.createdAt), ML, y + 13);
    doc.text("Accepted", ML, y, { align: "right", width: CW });
    doc.text(bookingRef, ML, y + 13, { align: "right", width: CW });

    y += 40; hRule(y); y += 22;

    // 3. TWO COLUMNS
    const LC_X = ML; const LC_W = 268;
    const RC_X = ML + LC_W + 22; const RC_W = CW - LC_W - 22;
    const PAD  = 14;

    // Left Column: Dates, Property, Travelers
    drawBox(LC_X, y, LC_W, 78);
    doc.font("Helvetica").fontSize(8).fillColor("#777777").text("Check In", LC_X + PAD, y + PAD);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111").text(`${fmtMon(booking.checkIn)}, ${new Date(booking.checkIn).getFullYear()}`, LC_X + PAD, y + PAD + 14);
    doc.text(`${fmtMon(booking.checkOut)}, ${new Date(booking.checkOut).getFullYear()}`, LC_X + LC_W/2 + 15, y + PAD + 14);
    innerRule(LC_X, y + 51, LC_W);
    doc.font("Helvetica").fontSize(8.5).fillColor("#555555").text(`${nights} night${nights > 1 ? "s" : ""}`, LC_X + PAD, y + 58);

    // Property Info
    const py = y + 92;
    drawBox(LC_X, py, LC_W, 118);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Entire home / apt", LC_X + PAD, py + PAD);
    doc.font("Helvetica").fontSize(9).fillColor("#444444").text(listing.title, LC_X + PAD, py + PAD + 16, { width: LC_W - PAD * 2 });
    doc.text(`${listing.location}, ${listing.country}`, LC_X + PAD, py + PAD + 31);
    innerRule(LC_X, py + 76, LC_W);
    doc.font("Helvetica-Bold").fontSize(9).text("Hosted by WandurLust", LC_X + PAD, py + 82);

    // Travelers
    const travelerNames = normalizeGuestNames(booking.guestNames, booking.guests, user.username);
    const ty = py + 132;
    const th = 38 + travelerNames.length * 16;
    drawBox(LC_X, ty, LC_W, th);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(`${travelerNames.length} Traveler${travelerNames.length > 1 ? "s" : ""}`, LC_X + PAD, ty + PAD);
    travelerNames.forEach((name, i) => doc.font("Helvetica").fontSize(9).text(name, LC_X + PAD, ty + PAD + 18 + (i * 16)));

    // Right Column: Charges & Payment
    drawBox(RC_X, y, RC_W, 138);
    doc.font("Helvetica-Bold").fontSize(12).text("Charges", RC_X + PAD, y + PAD);
    doc.font("Helvetica").fontSize(9).text(`${fmtMoney(perNight)} \u00D7 ${nights} nights`, RC_X + PAD, y + 38);
    doc.text(fmtMoney(booking.totalPrice), RC_X, y + 38, { align: "right", width: RC_W - PAD });
    innerRule(RC_X, y + 82, RC_W);
    doc.font("Helvetica-Bold").fontSize(11).text("Total", RC_X + PAD, y + 95);
    doc.text(fmtMoney(booking.totalPrice), RC_X, y + 95, { align: "right", width: RC_W - PAD });

    const payY = y + 152;
    drawBox(RC_X, payY, RC_W, 95);
    doc.font("Helvetica-Bold").fontSize(12).text("Payment", RC_X + PAD, payY + PAD);
    doc.font("Helvetica").fontSize(9).text("Paid Online \u2014 Confirmed", RC_X + PAD, payY + 38);
    innerRule(RC_X, payY + 66, RC_W);
    doc.font("Helvetica-Bold").fontSize(10).text("Total Paid", RC_X + PAD, payY + 74);
    doc.text(fmtMoney(booking.totalPrice), RC_X, payY + 74, { align: "right", width: RC_W - PAD });

    // 4. FOOTER & POLICY
    const fy = Math.max(ty + th, payY + 95) + 30;
    hRule(fy);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#222222").text("Cost per traveler", ML, fy + 16);
    doc.font("Helvetica").fontSize(9).fillColor("#555555").text(`Approx ${fmtMoney(Math.round(booking.totalPrice/travelerNames.length))} per person.`, ML, fy + 30);
    
    const py2 = fy + 68; hRule(py2);
    doc.font("Helvetica-Bold").fontSize(8.5).text("Cancellation Policy", ML, py2 + 14);
    doc.font("Helvetica").fontSize(8).fillColor("#666666").text("Full refund within 1 hour of booking. Non-refundable thereafter.", ML, py2 + 28, { width: CW });

    doc.font("Helvetica").fontSize(7.5).fillColor("#aaaaaa").text(`Generated by WandurLust | ID: ${booking._id}`, ML, PH - 28, { align: "center", width: CW });

    doc.end();
};
