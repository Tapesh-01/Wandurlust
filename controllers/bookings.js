const Booking = require("../models/booking");
const Listing = require("../models/listing");
const PDFDocument = require("pdfkit");

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
    const totalPrice = listing.price * nights;

    // Normalize guestNames: always an array, trimmed, pad to guest count
    const guestCount = parseInt(guests) || 1;
    let names = Array.isArray(guestNames) ? guestNames : (guestNames ? [guestNames] : []);
    names = names.map(n => (n || '').trim());
    // Ensure we have exactly guestCount entries
    for (let i = 0; i < guestCount; i++) {
        if (!names[i]) {
            names[i] = i === 0 ? req.user.username : `Guest ${i + 1}`;
        }
    }
    names = names.slice(0, guestCount); // trim extras

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
//  DOWNLOAD PDF TICKET — Airbnb-style receipt layout
// ═══════════════════════════════════════════════════════════════════════════════
module.exports.downloadTicket = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id)
        .populate("listing")
        .populate("user", "username email");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    if (!req.user._id.equals(booking.user._id)) {
        req.flash("error", "Unauthorized.");
        return res.redirect("/bookings");
    }

    if (booking.paymentStatus !== "paid") {
        req.flash("error", "Ticket is only available for confirmed (paid) bookings.");
        return res.redirect("/bookings");
    }

    const listing    = booking.listing;
    const user       = booking.user;
    const nights     = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
    const perNight   = listing.price || Math.round(booking.totalPrice / nights);
    const bookingRef = booking._id.toString().slice(-8).toUpperCase();

    const fmtShort = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const fmtLong  = (d) => new Date(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const fmtMon   = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const fmtMoney = (n) => `\u20B9${Number(n).toLocaleString("en-IN")}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="WandurLust-Ticket-${bookingRef}.pdf"`);

    const doc = new PDFDocument({ margin: 0, size: "A4" });
    doc.pipe(res);

    const PW = doc.page.width;   // 595.28
    const PH = doc.page.height;  // 841.89
    const ML = 50;
    const MR = PW - 50;
    const CW = MR - ML;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const hRule = (y, color = "#cccccc") =>
        doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor(color).stroke();

    const drawBox = (x, y, w, h) =>
        doc.rect(x, y, w, h).lineWidth(0.5).strokeColor("#cccccc").stroke();

    const innerRule = (x, y, w) =>
        doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).strokeColor("#e0e0e0").stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  TOP BAR — date | center title | address block
    // ═══════════════════════════════════════════════════════════════════════
    let y = 28;

    doc.font("Helvetica").fontSize(8).fillColor("#555555")
       .text(fmtShort(booking.createdAt), ML, y);

    doc.font("Helvetica").fontSize(8).fillColor("#555555")
       .text(`WandurLust Travel Receipt, Confirmation Code ${bookingRef}`, ML, y, { align: "center", width: CW });

    const addrLines = ["WandurLust Pvt. Ltd.", "Hospitality Division", "Harinagar, Durg, CG, India 490022", `Booking ID: ${bookingRef}`];
    let ay = y;
    for (const line of addrLines) {
        doc.font("Helvetica").fontSize(8).fillColor("#555555")
           .text(line, ML, ay, { align: "right", width: CW });
        ay += 11;
    }

    // ─── Logo row ─────────────────────────────────────────────────────────────
    y = 80;

    // Brand mark: thick accent line + bold brand name (clean, no symbol)
    doc.rect(ML, y, 3, 28).fill("#fe424d");   // red accent bar
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#111111")
       .text("WandurLust", ML + 12, y + 2);
    doc.font("Helvetica").fontSize(8.5).fillColor("#fe424d")
       .text("TRAVEL & STAYS", ML + 12, y + 24);

    y += 36;
    hRule(y);

    // ═══════════════════════════════════════════════════════════════════════
    //  CONFIRMED TITLE SECTION
    // ═══════════════════════════════════════════════════════════════════════
    y += 22;
    const titleText = `Confirmed: ${nights} night${nights > 1 ? "s" : ""} in ${listing.location}, ${listing.country}`;
    const titleH = doc.font("Helvetica-Bold").fontSize(19).heightOfString(titleText, { width: CW });
    doc.fillColor("#111111").text(titleText, ML, y, { width: CW });

    y += titleH + 12;   // dynamic gap — no overlap even on long titles
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#222222").text(`Booked by ${user.username}`, ML, y);
    doc.font("Helvetica").fontSize(9).fillColor("#777777").text(fmtLong(booking.createdAt), ML, y + 13);

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#222222").text("Accepted", ML, y, { align: "right", width: CW });
    doc.font("Helvetica").fontSize(9).fillColor("#777777").text(bookingRef, ML, y + 13, { align: "right", width: CW });

    y += 40;
    hRule(y);
    y += 22;

    // ═══════════════════════════════════════════════════════════════════════
    //  TWO COLUMN LAYOUT
    // ═══════════════════════════════════════════════════════════════════════
    const LC_X = ML;
    const LC_W = 268;
    const RC_X = ML + LC_W + 22;
    const RC_W = CW - LC_W - 22;
    const PAD  = 14;

    // ── LEFT COLUMN ───────────────────────────────────────────────────────────

    // Box A: Check-in / Check-out
    const boxAY = y;
    const boxAH = 78;
    drawBox(LC_X, boxAY, LC_W, boxAH);

    const half = LC_W / 2 - 5;
    doc.font("Helvetica").fontSize(8).fillColor("#777777").text("Check In", LC_X + PAD, boxAY + PAD);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111")
       .text(`${fmtMon(booking.checkIn)}, ${new Date(booking.checkIn).getFullYear()}`, LC_X + PAD, boxAY + PAD + 14);

    doc.font("Helvetica").fontSize(15).fillColor("#aaaaaa").text("\u2192", LC_X + half - 4, boxAY + PAD + 13);

    doc.font("Helvetica").fontSize(8).fillColor("#777777").text("Check Out", LC_X + half + 20, boxAY + PAD);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111")
       .text(`${fmtMon(booking.checkOut)}, ${new Date(booking.checkOut).getFullYear()}`, LC_X + half + 20, boxAY + PAD + 14);

    innerRule(LC_X, boxAY + 51, LC_W);
    doc.font("Helvetica").fontSize(8.5).fillColor("#555555")
       .text(`${nights} night${nights > 1 ? "s" : ""}`, LC_X + PAD, boxAY + 58);

    // Box B: Property info
    const boxBY = boxAY + boxAH + 14;
    const boxBH = 118;
    drawBox(LC_X, boxBY, LC_W, boxBH);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Entire home / apt", LC_X + PAD, boxBY + PAD);
    doc.font("Helvetica").fontSize(9).fillColor("#444444")
       .text(listing.title, LC_X + PAD, boxBY + PAD + 16, { width: LC_W - PAD * 2 });
    doc.font("Helvetica").fontSize(9).fillColor("#444444")
       .text(`${listing.location}`, LC_X + PAD, boxBY + PAD + 31, { width: LC_W - PAD * 2 });
    doc.font("Helvetica").fontSize(9).fillColor("#444444")
       .text(listing.country, LC_X + PAD, boxBY + PAD + 45);

    innerRule(LC_X, boxBY + 76, LC_W);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333")
       .text("Hosted by WandurLust", LC_X + PAD, boxBY + 82);
    doc.font("Helvetica").fontSize(8.5).fillColor("#666666")
       .text("support@wandurlust.com", LC_X + PAD, boxBY + 96);

    // Box C: Travelers
    const boxCY = boxBY + boxBH + 14;
    const guestCount = booking.guests || 1;
    // Build name list: use saved names, pad with Guest N for any missing
    let travelerNames = (booking.guestNames && booking.guestNames.length > 0)
        ? [...booking.guestNames]
        : [];
    for (let i = 0; i < guestCount; i++) {
        if (!travelerNames[i] || !travelerNames[i].trim()) {
            travelerNames[i] = i === 0 ? user.username : `Guest ${i + 1}`;
        }
    }
    travelerNames = travelerNames.slice(0, guestCount);
    const txCount = travelerNames.length;
    const boxCH = 38 + txCount * 16;
    drawBox(LC_X, boxCY, LC_W, boxCH);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111")
       .text(`${txCount} Traveler${txCount > 1 ? "s" : ""} on this trip`, LC_X + PAD, boxCY + PAD);

    let tY = boxCY + PAD + 18;
    for (const name of travelerNames) {
        doc.font("Helvetica").fontSize(9).fillColor("#444444").text(name, LC_X + PAD, tY);
        tY += 16;
    }

    // ── RIGHT COLUMN ──────────────────────────────────────────────────────────

    // Box D: Charges
    const boxDY = y;
    const boxDH = 138;
    drawBox(RC_X, boxDY, RC_W, boxDH);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text("Charges", RC_X + PAD, boxDY + PAD);

    let rY = boxDY + PAD + 24;
    const priceRow = `${fmtMoney(perNight)} \u00D7 ${nights} night${nights > 1 ? "s" : ""}`;
    doc.font("Helvetica").fontSize(9).fillColor("#333333").text(priceRow, RC_X + PAD, rY);
    doc.font("Helvetica").fontSize(9).fillColor("#333333")
       .text(fmtMoney(booking.totalPrice), RC_X, rY, { align: "right", width: RC_W - PAD });

    rY += 22;
    doc.font("Helvetica").fontSize(9).fillColor("#777777").text("Service Fee", RC_X + PAD, rY);
    doc.font("Helvetica").fontSize(9).fillColor("#777777").text("Included", RC_X, rY, { align: "right", width: RC_W - PAD });

    rY += 22;
    innerRule(RC_X, rY, RC_W);
    rY += 13;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text("Total", RC_X + PAD, rY);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
       .text(fmtMoney(booking.totalPrice), RC_X, rY, { align: "right", width: RC_W - PAD });

    // Box E: Payment
    const boxEY = boxDY + boxDH + 14;
    const boxEH = 95;
    drawBox(RC_X, boxEY, RC_W, boxEH);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text("Payment", RC_X + PAD, boxEY + PAD);

    doc.font("Helvetica").fontSize(9).fillColor("#333333")
       .text("Paid Online \u2014 Booking Confirmed", RC_X + PAD, boxEY + PAD + 24);
    doc.font("Helvetica").fontSize(8).fillColor("#888888")
       .text(fmtLong(booking.createdAt), RC_X + PAD, boxEY + PAD + 39, { width: RC_W - PAD * 2 });

    innerRule(RC_X, boxEY + 66, RC_W);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Total Paid", RC_X + PAD, boxEY + 74);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111")
       .text(fmtMoney(booking.totalPrice), RC_X, boxEY + 74, { align: "right", width: RC_W - PAD });

    // ═══════════════════════════════════════════════════════════════════════
    //  COST PER TRAVELER
    // ═══════════════════════════════════════════════════════════════════════
    const bottomY = Math.max(boxCY + boxCH, boxEY + boxEH) + 30;
    hRule(bottomY);

    let secY = bottomY + 16;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#222222").text("Cost per traveler", ML, secY);
    const perPerson = Math.round(booking.totalPrice / booking.guests);
    doc.font("Helvetica").fontSize(9).fillColor("#555555")
       .text(
           `This trip was ${fmtMoney(perPerson)} per person for ${nights} night${nights > 1 ? "s" : ""}, including all fees.`,
           ML, secY + 14, { width: CW * 0.58 }
       );

    // ═══════════════════════════════════════════════════════════════════════
    //  NEED HELP SECTION
    // ═══════════════════════════════════════════════════════════════════════
    secY += 52;
    hRule(secY);
    secY += 16;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#222222").text("Need help?", ML, secY);
    doc.font("Helvetica").fontSize(8.5).fillColor("#555555")
       .text("Visit our Support Center for any questions about your booking.", ML, secY + 14, { width: 250 });

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333")
       .text(bookingRef, ML, secY, { align: "right", width: CW });
    doc.font("Helvetica").fontSize(8.5).fillColor("#777777")
       .text(`Booked by ${user.username}`, ML, secY + 14, { align: "right", width: CW });
    doc.font("Helvetica").fontSize(8.5).fillColor("#777777")
       .text(fmtLong(booking.createdAt), ML, secY + 27, { align: "right", width: CW });

    // ═══════════════════════════════════════════════════════════════════════
    //  CANCELLATION POLICY
    // ═══════════════════════════════════════════════════════════════════════
    secY += 58;
    hRule(secY);
    secY += 14;

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333333").text("Cancellation Policy", ML, secY);
    doc.font("Helvetica").fontSize(8).fillColor("#666666")
       .text(
           "Cancellations made within 1 hour of booking receive a full refund. After that window, bookings are non-refundable. This receipt is system-generated and does not require a signature. WandurLust is not liable for service disruptions due to events beyond our control.",
           ML, secY + 14, { width: CW }
       );

    // ── Tiny footer ───────────────────────────────────────────────────────────
    doc.font("Helvetica").fontSize(7.5).fillColor("#aaaaaa")
       .text(
           `Full Booking ID: ${booking._id}  |  Generated by WandurLust  |  ${fmtShort(new Date())}`,
           ML, PH - 28, { align: "center", width: CW }
       );

    doc.end();
};
