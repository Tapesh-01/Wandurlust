const Listing = require("./models/listing");
const Review = require("./models/review");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema, reviewSchema } = require("./schema.js");



module.exports.isLoggedIn = (req, res, next)  =>  {
   
    if(!req.isAuthenticated()) {
    req.session.redirectUrl = req.originalUrl;
    req.flash("error", "You must be logged in to create listing!");
    return res.redirect("/login");
  }
  next();
};
  
  module.exports.saveRedirectUrl = (req, res, next) =>{
    if(req.session.redirectUrl) {
      res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
  };

  module.exports.isOwner = async (req, res, next) =>  {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    
    // Safety check: ensure listing exists and owner is defined
    if (!listing || !listing.owner) {
      req.flash("error" ," Listing not found or owner undefined");
      return res.redirect("/listings");
    }

    // Use .equals() for ObjectId comparison
    // listing.owner might be a populated object or a raw ObjectId
    const ownerId = listing.owner._id || listing.owner;
    if(!ownerId.equals(res.locals.currUser._id)){
      req.flash("error" ," You are not the owner of this listing");
      return res.redirect(`/listings/${id}`);
    }

    next();
  };

  module.exports.validateListing = (req, res, next) => {
  let { error } = listingSchema.validate(req.body);
  if (error) {
    let errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};

module.exports.validateReview = (req, res, next) => {
    let { error } = reviewSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el)  => el.message). join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

 module.exports.isReviewAuthor = async (req, res, next) =>  {
    let { id, reviewId } = req.params;
    let review = await Review.findById(reviewId);
    if(!review.author.equals(res.locals.currUser._id)){
      req.flash("error" ," You are not the author of this review");
      return res.redirect(`/listings/${id}`);
    }

    next();
  };
