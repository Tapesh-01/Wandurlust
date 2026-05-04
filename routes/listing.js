const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isOwner, validateListing, isAdmin } = require("../middleware.js");
const listingController = require("../controllers/listings.js");
const multer = require('multer');
const{storage} = require("../cloudConfig.js");
const upload = multer({ storage});

// USER LISTINGS ROUTE (UNIQUE ROUTE TO PREVENT CONFLICTS)
router.get("/mylistings", isLoggedIn, wrapAsync(listingController.userListings));

// EXPLORE SPLIT VIEW (NEW)
router.get("/explore", wrapAsync(listingController.renderExplorePage));

// ALL DESTINATIONS VIEW (NEW)
router.get("/destinations", wrapAsync(listingController.renderDestinationsPage));

// INDEX + CREATE
router.
route("/")
  .get(wrapAsync(listingController.index))
  .post(
    isLoggedIn,
    isAdmin, // Only Admin can create
    upload.array("listing[images]", 5),
    validateListing,
    wrapAsync(listingController.createListing)
  );

// NEW ROUTE
router.get(
  "/new",
  isLoggedIn,
  isAdmin, // Only Admin can see form
  listingController.renderNewForm
);

// show +  update + delete
  router.route("/:id")
    .get(
  wrapAsync(listingController.showListing))
  .put(
  isLoggedIn,
  isOwner,
  upload.array("listing[images]", 5),
  validateListing,
  wrapAsync(listingController.updateListing))
.delete(
  isLoggedIn,
  isOwner,
  wrapAsync(listingController.destroyListing));


// EDIT FORM
router.get(
  "/:id/edit",
  isLoggedIn,
  isOwner,
  wrapAsync(listingController.renderEditForm)
);



module.exports = router;
