const Listing = require("../models/listing");
const Review = require("../models/review");
module.exports.createReview = async (req, res) => {
  let listing = await Listing.findById(req.params.id).populate("reviews");
  
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }

  // Check if user is the owner
  if (listing.owner.equals(req.user._id)) {
    req.flash("error", "Owners cannot review their own listings!");
    return res.redirect(`/listings/${listing._id}`);
  }

  // Check if user has already reviewed this listing
  let alreadyReviewed = listing.reviews.some((review) => 
    review.author.equals(req.user._id)
  );

  if (alreadyReviewed) {
    req.flash("error", "You have already reviewed this listing!");
    return res.redirect(`/listings/${listing._id}`);
  }

  let newReview = new Review(req.body.review);
  newReview.author = req.user._id;

  listing.reviews.push(newReview);

  await newReview.save();
  await listing.save();
  req.flash("success", "New Review Created!");
  res.redirect(`/listings/${listing._id}`);
};

module.exports.destroyReview = async (req, res) => {
        let { id, reviewId } = req.params;

        await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
        await Review.findByIdAndDelete(reviewId);
        req.flash("success", "Review Deleted!");
        res.redirect(`/listings/${id}`);
    }