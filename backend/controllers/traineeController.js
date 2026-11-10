
const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");

// GET: Retrieve the logged-in trainee's information
const getMyProfile = async (req, res) => {
    try {
        // Find the account using the verified JWT user ID
        const user = await User.findById(req.user.id).select("-password");

        if (!user || user.role !== "trainee") {
            return res.status(404).json({
                success: false,
                message: "Trainee account not found."
            });
        }

        // Find this account's profile
        let profile = await TraineeProfile.findOne({
            user: req.user.id
        });

        // Create a profile if one does not exist
        if (!profile) {
            profile = await TraineeProfile.create({
                user: req.user.id
            });
        }

        return res.status(200).json({
            success: true,
            user,
            profile
        });

    } catch (error) {
        console.error("Get trainee profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve trainee information."
        });
    }
};


// PUT: Update the logged-in trainee's profile
const updateMyProfile = async (req, res) => {
    try {
        const allowedFields = ["phone", "address"];

        const updates = {};

        // Accept only fields that trainees are allowed to update
        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const profile = await TraineeProfile.findOneAndUpdate(
            { user: req.user.id },
            { $set: updates, $setOnInsert: { user: req.user.id } },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            profile
        });

    } catch (error) {
        console.error("Update trainee profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update trainee profile."
        });
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile
};
