const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const listingController = require("../controllers/listings.js");
const multer = require('multer');
const{storage} = require("../cloudConfig.js");
const upload = multer({ storage});

// INDEX + CREATE
router.
route("/")
  .get(wrapAsync(listingController.index))
  .post(
    isLoggedIn,
    validateListing,
    upload.single("listing[image]"),
    wrapAsync(listingController.createListing)
  );

// NEW ROUTE (THIS WAS MISSING)
router.get(
  "/new",
  isLoggedIn,
  listingController.renderNewForm
);

// show +  update + delete
  router.route("/:id")
    .get(
  wrapAsync(listingController.showListing))
  .put(
  isLoggedIn,
  isOwner,
  upload.single("listing[image]"),
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
