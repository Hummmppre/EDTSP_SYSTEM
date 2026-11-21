
const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const { assignTraineeId } = require("../lib/traineeId");
const {
    currentVersionOf,
    readExpectedVersion,
    sendVersionConflict,
    versionFilter
} = require("../lib/versioning");
const { notifyRecordUpdated } = require("../lib/realtime");
const {
    validateAvatar,
    storeAvatar,
    deleteAvatarFile,
    streamAvatar
} = require("../lib/avatarUpload");

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

        // Find this account's profile, creating one and issuing a trainee ID
        // when the record is missing or predates automatic IDs.
        let profile = await TraineeProfile.findOne({
            user: req.user.id
        });

        if (!profile || !profile.traineeId) {
            profile = await assignTraineeId(req.user.id);
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
        const body = req.body || {};
        const expectedVersion = readExpectedVersion(body);

        if (expectedVersion.invalid) {
            return res.status(400).json({
                success: false,
                message: "Version must be a non-negative integer."
            });
        }

        const updates = {};

        // Accept only fields that trainees are allowed to update
        allowedFields.forEach((field) => {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        });

        await ensureMyProfile(req.user.id);

        const profile = await TraineeProfile.findOneAndUpdate(
            { user: req.user.id, ...versionFilter(expectedVersion.value) },
            { $set: updates, $inc: { __v: 1 } },
            { new: true, runValidators: true }
        );

        if (!profile) {
            const current = await TraineeProfile.findOne({
                user: req.user.id
            }).lean();

            return sendVersionConflict(res, {
                currentVersion: currentVersionOf(current),
                current
            });
        }

        notifyRecordUpdated({
            resource: "trainee",
            id: String(req.user.id),
            version: currentVersionOf(profile),
            actorId: req.user && req.user.id
        });

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

// A versioned update requires the profile row to exist first. A concurrent
// first save is resolved by reading the winner's row.
async function ensureMyProfile(userId) {
    try {
        return await TraineeProfile.findOneAndUpdate(
            { user: userId },
            { $setOnInsert: { user: userId } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        if (error && error.code === 11000) {
            return TraineeProfile.findOne({ user: userId });
        }

        throw error;
    }
}

// GET: Stream the logged-in trainee's profile picture
const getMyAvatar = async (req, res) => {
    try {
        const profile = await TraineeProfile.findOne({
            user: req.user.id
        }).select("avatar");

        if (!profile || !profile.avatar || !profile.avatar.fileId) {
            return res.status(404).json({
                success: false,
                message: "No profile picture is set."
            });
        }

        return await streamAvatar(res, profile.avatar);

    } catch (error) {
        console.error("Get trainee avatar error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load your profile picture."
        });
    }
};

// POST: Replace the logged-in trainee's profile picture
const uploadMyAvatar = async (req, res) => {
    let storedFileId = null;

    try {
        const validation = validateAvatar(req.file);

        if (validation.error) {
            return res.status(400).json({
                success: false,
                message: validation.error
            });
        }

        const accepted = validation.file;

        let profile = await TraineeProfile.findOne({ user: req.user.id });

        if (!profile) {
            profile = await assignTraineeId(req.user.id);
        }

        const previousFileId = profile.avatar && profile.avatar.fileId;

        storedFileId = await storeAvatar({
            buffer: accepted.buffer,
            contentType: accepted.contentType,
            userId: req.user.id
        });

        profile.avatar = {
            fileId: storedFileId,
            contentType: accepted.contentType,
            size: accepted.size,
            updatedAt: new Date()
        };

        // Avatar changes are record changes too, so a stale admin form cannot
        // save over them without seeing the conflict.
        profile.__v = currentVersionOf(profile) + 1;

        await profile.save();

        // The new picture is safely recorded before the old blob is dropped.
        if (
            previousFileId &&
            String(previousFileId) !== String(storedFileId)
        ) {
            await deleteAvatarFile(previousFileId);
        }

        return res.status(200).json({
            success: true,
            message: "Profile picture updated.",
            avatar: profile.avatar
        });

    } catch (error) {
        if (storedFileId) {
            await deleteAvatarFile(storedFileId);
        }

        console.error("Upload trainee avatar error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to save your profile picture. Please try again."
        });
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    getMyAvatar,
    uploadMyAvatar
};
