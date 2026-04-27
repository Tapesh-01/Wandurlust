const User = require("../models/user");
module.exports.renderSignupForm = (req, res) => {
    res.render("users/signup.ejs");
};



module.exports.signup = async (req, res) => {
    try{
         let {username, email, password, redirectUrl} = req.body;
         const newUser = new User({email, username});
         const registeredUser = await User.register(newUser, password);
         console.log(registeredUser);
         req.login(registeredUser, (err) => 
        {
            if(err){
                return(next);
            }
         req.flash("success", "Welcome to Wanderlust!");
         res.redirect(req.session.redirectUrl || redirectUrl || "/listings");
        });
    } catch(e){
        req.flash("error", e.message);
        res.redirect("/signup");
    }

};

module.exports.renderLoginForm = (req, res)  =>  {
    res.render("users/login.ejs");
};

module.exports.login =  async (req, res) =>  {
    req.flash("success","Welcome to Wandurlust! You are logged in");
    let redirectUrl = res.locals.redirectUrl || req.body.redirectUrl || "/listings";
    res.redirect(redirectUrl);
};

module.exports.logout = (req, res, next) => {
    req.logout(err => {
        if (err) {
            return next(err);
        }
        req.flash("success", "you are logged out!"); // Set a success flash message
        res.redirect("/listings"); // Redirect the user to the homepage or listings page
    });
};

module.exports.toggleFavorite = async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ success: false, message: 'Must be logged in' });
        }
        
        const { id } = req.params;
        const user = await User.findById(req.user._id);
        
        if (!user.favorites) {
            user.favorites = [];
        }

        const isFavorited = user.favorites.includes(id);
        
        if (isFavorited) {
            // Remove from favorites
            user.favorites.pull(id);
        } else {
            // Add to favorites
            user.favorites.push(id);
        }
        
        await user.save();
        
        res.json({ success: true, isFavorited: !isFavorited });
    } catch (e) {
        console.error("Toggle Favorite Error:", e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports.showWishlist = async (req, res) => {
    const user = await User.findById(req.user._id).populate({
        path: "favorites",
        populate: {
            path: "reviews"
        }
    });
    res.render("users/wishlist.ejs", { allListings: user.favorites });
};