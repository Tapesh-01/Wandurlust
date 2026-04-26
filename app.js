if (process.env.NODE_ENV != "production") {
  require('dotenv').config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const Listing = require("./models/listing.js");

// -------------------- SESSION OPTIONS --------------------
const sessionOptions = {
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

// -------------------- VIEW ENGINE --------------------
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// -------------------- MIDDLEWARE --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "/public")));

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());




// Make flash messages available in all templates
app.use(async (req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  res.locals.currUserIsHost = false;
  res.locals.unreadMsgCount = 0;
  
  if (req.user) {
    try {
      const Listing = require("./models/listing.js");
      const Booking = require('./models/booking.js');
      const Chat = require('./models/chat.js');
      
      // Check if user is a host (has at least one listing)
      const userListings = await Listing.find({ owner: req.user._id }).select('_id');
      res.locals.currUserIsHost = userListings.length > 0;
      
      if (res.locals.currUserIsHost) {
        const listingIds = userListings.map(l => l._id);
        const [newBookingsCount, latestNewBookings] = await Promise.all([
          Booking.countDocuments({ listing: { $in: listingIds }, isNewBooking: true }),
          Booking.find({ listing: { $in: listingIds }, isNewBooking: true })
            .populate("listing", "title")
            .populate("user", "username")
            .sort({ createdAt: -1 })
            .limit(5)
        ]);
        res.locals.globalNewBookingsCount = newBookingsCount;
        res.locals.globalNewBookings = latestNewBookings;
      }

      // Count all unread messages received by this user
      res.locals.unreadMsgCount = await Chat.countDocuments({ receiver: req.user._id, isRead: false });
    } catch (e) {
      console.warn("Middleware Host Check Error:", e.message);
    }
  }
  next();
});


const { Server } = require("socket.io");
const http = require("http");

// -------------------- DATABASE --------------------
const MONGO_URL = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

mongoose
  .connect(MONGO_URL)
  .then(async () => {
    console.log("Connected to DB");
    try {
      const Listing = require("./models/listing.js");
      // Aggregate to find most frequent locations
      const topLocs = await Listing.aggregate([
        { $group: { _id: "$location", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 4 }
      ]);
      app.locals.topLocations = topLocs.map(l => l._id).filter(l => l);
    } catch (e) {
      console.log("Failed to load top locations:", e);
      app.locals.topLocations = [];
    }
  })
  .catch((err) => console.log(err));

// -------------------- ROUTES --------------------
const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");
const Chat = require("./models/chat.js");

// Root route - Landing Page
app.get("/", (req, res) => {
  res.render("home.ejs");
});

// Privacy & Terms page
app.get("/privacy", (req, res) => {
  res.render("privacy.ejs");
});

// ── Chat: single room ──
app.get("/listings/:id/chat", async (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash("error", "You must be logged in to chat!");
    return res.redirect("/login");
  }
  const { id } = req.params;
  const partnerId = req.query.partner;
  const listing = await Listing.findById(id).populate("owner");
  
  const targetUser = partnerId ? partnerId : listing.owner._id;

  const chats = await Chat.find({
    listing: id,
    $or: [
      { sender: req.user._id, receiver: targetUser },
      { sender: targetUser, receiver: req.user._id }
    ]
  }).populate("sender", "username").sort({ createdAt: 1 });

  let partnerUser;
  if(targetUser.toString() === listing.owner._id.toString()) {
      partnerUser = listing.owner;
  } else {
      partnerUser = await User.findById(targetUser);
  }

  res.render("listings/chat.ejs", { listing, chats, partnerUser });
});

// ── Mark Chat Read API ──
app.post("/chats/mark-read", async (req, res) => {
  if (req.isAuthenticated()) {
    const { partnerId, listingId } = req.body;
    await Chat.updateMany(
      { sender: partnerId, receiver: req.user._id, listing: listingId, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// ── Delete Chat Message API ──
app.delete("/chats/:msgId", async (req, res) => {
  if (req.isAuthenticated()) {
    const { msgId } = req.params;
    // Ensure only the sender can delete their message
    const deleted = await Chat.findOneAndDelete({ _id: msgId, sender: req.user._id });
    if(deleted) {
      res.json({ success: true });
    } else {
      res.json({ success: false, msg: "Unauthorized or not found" });
    }
  } else {
    res.json({ success: false });
  }
});

// ── Inbox: all conversations for logged-in user ──
app.get("/inbox", async (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash("error", "Please login to view your inbox.");
    return res.redirect("/login");
  }

  // Get all messages involving this user, most recent first
  const allChats = await Chat.find({
    $or: [{ sender: req.user._id }, { receiver: req.user._id }]
  })
    .populate("sender", "username")
    .populate("receiver", "username")
    .populate("listing", "title images image")
    .sort({ createdAt: -1 });

  // Group by listing+partner to show 1 row per conversation
  const seen = new Set();
  const conversations = [];
  for (const chat of allChats) {
    const partnerId = chat.sender._id.toString() === req.user._id.toString()
      ? chat.receiver._id.toString()
      : chat.sender._id.toString();
    const key = `${chat.listing._id}-${partnerId}`;
    if (!seen.has(key)) {
      seen.add(key);
      conversations.push({
        listing: chat.listing,
        partner: chat.sender._id.toString() === req.user._id.toString() ? chat.receiver : chat.sender,
        lastMsg: chat.message,
        lastTime: chat.createdAt
      });
    }
  }

  res.render("inbox.ejs", { conversations });
});

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);
app.use("/", bookingRouter);

// -------------------- AI CHATBOT --------------------
const aiRouter = require("./routes/ai.js");
app.use("/", aiRouter);


// -------------------- 404 HANDLER --------------------

app.use((req, res, next) => {
  next(new ExpressError(404, "Page Not Found!"));
});

// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong!" } = err;
  res.status(statusCode).render("error.ejs", { message });
});

// -------------------- SERVER & SOCKETS --------------------
const server = http.createServer(app);
const io = new Server(server);

// Attach io to app so it's accessible in controllers
app.set("socketio", io);

io.on("connection", (socket) => {
  console.log("New User Connected:", socket.id);

  socket.on("join_private", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User joined private room: user_${userId}`);
  });

  socket.on("join_chat", (chatId) => {
    socket.join(chatId);
    console.log(`User joined chat room: ${chatId}`);
  });

  socket.on("send_message", async (data) => {
    try {
      const { sender, receiver, listing, message, roomId } = data;
      const newChat = new Chat({ sender, receiver, listing, message });
      await newChat.save();
      
      // Emit to the specific chat room
      io.to(roomId).emit("receive_message", {
        msgId: newChat._id,
        message,
        sender,
        createdAt: newChat.createdAt
      });

      // Emit global notification to the receiver's private room
      io.to(`user_${receiver}`).emit("new_notification");

    } catch (e) {
      console.error("Socket send_message error:", e);
    }
  });

  socket.on("delete_request", (data) => {
    const { roomId, msgId } = data;
    io.to(roomId).emit("message_deleted", msgId);
  });

  socket.on("disconnect", () => {
    console.log("User Disconnected");
  });
});

server.listen(8080, () => {
  console.log("Server is listening on port 8080");
});
// Restarted!
