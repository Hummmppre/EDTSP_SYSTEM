const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const { serializeProfile, serializeUser } = require("../utils/serializers");

const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

// GET: Retrieve the logged-in trainee's information
const getMyProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user || user.role !== "trainee") {
            return res.status(404).json({
                success: false,
                message: "Trainee account not found.",
                code: "NOT_FOUND"
            });
        }

        let profile = await TraineeProfile.findOne({
            user: req.user.id
        }).populate("program");

        // Create a profile if one does not exist
        if (!profile) {
            profile = await TraineeProfile.create({
                user: req.user.id
            });
            profile = await TraineeProfile.findById(profile._id).populate("program");
        }

        return res.status(200).json({
            success: true,
            user: serializeUser(user),
            profile: serializeProfile(profile)
        });
    } catch (error) {
        return next(error);
    }
};

// PUT: Update the logged-in trainee's profile
const updateMyProfile = async (req, res, next) => {
    try {
        const updates = {};

        if (req.body.phone !== undefined) {
            const phone = String(req.body.phone || "").trim();

            if (phone && !PHONE_REGEX.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: "Enter a phone number using digits, spaces, +, ( ) or -.",
                    field: "phone",
                    code: "INVALID_PHONE"
                });
            }

            updates.phone = phone;
        }

        if (req.body.address !== undefined) {
            const address = String(req.body.address || "").trim();

            if (address.length > 200) {
                return res.status(400).json({
                    success: false,
                    message: "The address must be 200 characters or fewer.",
                    field: "address",
                    code: "ADDRESS_TOO_LONG"
                });
            }

            updates.address = address;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Only phone and address can be updated.",
                code: "NO_UPDATES"
            });
        }

        const profile = await TraineeProfile.findOneAndUpdate(
            { user: req.user.id },
            { $set: updates, $setOnInsert: { user: req.user.id } },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        ).populate("program");

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            profile: serializeProfile(profile)
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile
};
