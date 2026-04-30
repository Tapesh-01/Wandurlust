const User = require("../models/user");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

module.exports.renderForgotForm = (req, res) => {
    res.render("users/forgot.ejs");
};

module.exports.sendResetEmail = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        req.flash("error", "No account with that email address exists.");
        return res.redirect("/forgot");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = otp;
    user.resetPasswordExpires = Date.now() + 600000; // 10 mins valid
    await user.save();

    const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        to: user.email,
        from: "Wanderlust Support <no-reply@wanderlust.com>",
        subject: "Wanderlust Password Reset OTP",
        text: `Your OTP for password reset is: ${otp}\n\n` +
              `This code is valid for 10 minutes.\n\n` +
              `If you did not request this, please ignore this email.\n`,
    };

    try {
        await transporter.sendMail(mailOptions);
        req.flash("success", `An OTP has been sent to ${user.email}.`);
        res.redirect(`/verify-otp?email=${user.email}`);
    } catch (err) {
        console.error("Email Error:", err);
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.log("\x1b[33m%s\x1b[0m", "DEBUG: Forgot Password OTP -> " + otp);
            req.flash("success", "(DEV MODE) OTP generated! Check terminal console for code.");
            res.redirect(`/verify-otp?email=${user.email}`);
        } else {
            req.flash("error", "Failed to send email. Please try again later.");
            res.redirect("/forgot");
        }
    }
};

module.exports.renderVerifyOtpForm = (req, res) => {
    const { email } = req.query;
    res.render("users/verify-otp.ejs", { email });
};

module.exports.verifyOtpAndReset = async (req, res) => {
    try {
        const { email, otp, password, confirm } = req.body;
        const user = await User.findOne({
            email,
            resetPasswordToken: otp,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash("error", "Invalid or expired OTP.");
            return res.redirect("back");
        }

        if (password !== confirm) {
            req.flash("error", "Passwords do not match.");
            return res.redirect("back");
        }

        await user.setPassword(password);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        req.login(user, (err) => {
            if (err) return next(err);
            req.flash("success", "Password reset successful! Welcome back.");
            res.redirect("/listings");
        });
    } catch (err) {
        req.flash("error", err.message);
        res.redirect("back");
    }
};


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