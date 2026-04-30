const express = require("express");
const router = express.Router();
const User = require('../models/user');
const wrapAsync = require("../utils/wrapAsync");
const passport = require("passport");
const {saveRedirectUrl} = require("../middleware");

const userController = require("../controllers/users.js");


router
.route("/signup")
.get(userController.renderSignupForm)
.post( wrapAsync (userController.signup)
);

router
.route("/login")
.get(userController.renderLoginForm)
.post(saveRedirectUrl,
    passport.authenticate("local", 
    { failureRedirect: '/login', 
    failureFlash: true}), 
    userController.login
);

router.get("/logout", userController.logout);

// Password Reset
router.get("/forgot", userController.renderForgotForm);
router.post("/forgot", wrapAsync(userController.sendResetEmail));
router.get("/verify-otp", userController.renderVerifyOtpForm);
router.post("/verify-otp", wrapAsync(userController.verifyOtpAndReset));



// Favorite Route
router.post("/listings/:id/favorite", userController.toggleFavorite);

// Wishlist Route
router.get("/wishlist", wrapAsync(userController.showWishlist));

module.exports = router;