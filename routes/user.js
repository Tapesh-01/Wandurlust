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

// Favorite Route
router.post("/listings/:id/favorite", userController.toggleFavorite);

// Wishlist Route
router.get("/wishlist", wrapAsync(userController.showWishlist));

module.exports = router;