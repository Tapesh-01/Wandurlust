const Joi = require('joi');

module.exports.listingSchema = Joi.object({
    listing: Joi.object({
        title: Joi.string().required(),
        description: Joi.string().required(),
        location: Joi.string().required(),
        country: Joi.string().required(),
        price: Joi.number().required().min(0),
        image: Joi.any().optional(),
        category: Joi.string().valid('Trending', 'Rooms', 'Iconic Cities', 'Mountains', 'Castels', 'Amezing Pool', 'Camping', 'Farms', 'Arctic', 'Domes', 'Boats', 'Resort').default('Trending'),
        maxGuests: Joi.number().min(1).default(10),
        taxRate: Joi.number().min(0).max(100).default(0)
    }).required(),
}).unknown(true);  // allow deleteImages, coverImage etc.

module.exports.reviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().required().min(1).max(5),
        comment: Joi.string().required(),
    }).required(),
});