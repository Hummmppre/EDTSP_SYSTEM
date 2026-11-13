const mongoose = require("mongoose");

const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const TrainingApplication = require("../models/TrainingApplication");

const ENROLLMENT_STATUSES = ["Pending", "Ongoing", "Completed", "Inactive"];
const ACCOUNT_STATUSES = ["active", "inactive"];

// Newest approved application per user. It is the source of truth for the
// trainee's program and batch, the same way the payment ledger reads it.
async function approvedApplicationByUser(userIds) {
    const applications = await TrainingApplication.find({
        user: { $in: userIds },
        status: "Approved"
    })
        .populate("program", "name")
        .populate("batch", "label")
        .sort({ decidedAt: -1, submittedAt: -1 })
        .lean();

    const map = new Map();

    applications.forEach(application => {
        const key = String(application.user);

        if (!map.has(key)) {
            map.set(key, application);
        }
    });

    return map;
}

function traineeRow(user, profile, application) {
    return {
        userId: String(user._id),
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        traineeId: (profile && profile.traineeId) || null,
        programName: application && application.program
            ? application.program.name
            : null,
        batchLabel: application && application.batch
            ? application.batch.label
            : null,
        approvedAt: application ? application.decidedAt : null,
        enrollmentStatus: (profile && profile.enrollmentStatus) || "Pending",
        accountStatus: user.status || "active",
        // Applications collect contact details before a profile is edited.
        phone: (profile && profile.phone) || (application && application.phone) || "",
        address: (profile && profile.address) || (application && application.address) || "",
        createdAt: user.createdAt || null
    };
}

function summarize(rows) {
    const countBy = status =>
        rows.filter(row => row.enrollmentStatus === status).length;

    return {
        total: rows.length,
        ongoing: countBy("Ongoing"),
        pending: countBy("Pending"),
        completed: countBy("Completed")
    };
}

async function loadTrainee(userId) {
    const user = await User.findById(userId)
        .select("firstName lastName email status createdAt")
        .lean();

    if (!user) return null;

    const profile = await TraineeProfile.findOne({ user: user._id }).lean();
    const applications = await approvedApplicationByUser([user._id]);

    return traineeRow(user, profile, applications.get(String(user._id)));
}

// ADMIN: every registered trainee with their live profile and program
const getTrainees = async (req, res) => {
    try {
        const users = await User.find({ role: "trainee" })
            .select("firstName lastName email status createdAt")
            .sort({ lastName: 1, firstName: 1 })
            .lean();

        const userIds = users.map(user => user._id);

        const profiles = userIds.length
            ? await TraineeProfile.find({ user: { $in: userIds } }).lean()
            : [];

        const applications = userIds.length
            ? await approvedApplicationByUser(userIds)
            : new Map();

        const profileByUser = new Map(
            profiles.map(profile => [String(profile.user), profile])
        );

        const trainees = users.map(user => traineeRow(
            user,
            profileByUser.get(String(user._id)),
            applications.get(String(user._id))
        ));

        return res.status(200).json({
            success: true,
            count: trainees.length,
            summary: summarize(trainees),
            trainees
        });

    } catch (error) {
        console.error("Get trainees error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve trainees."
        });
    }
};

// ADMIN: update the details an administrator owns on a trainee record
const updateTrainee = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            return res.status(404).json({
                success: false,
                message: "Trainee not found."
            });
        }

        const user = await User.findById(req.params.userId);

        if (!user || user.role !== "trainee") {
            return res.status(404).json({
                success: false,
                message: "Trainee not found."
            });
        }

        const body = req.body || {};
        const profileSet = {};
        let clearTraineeId = false;

        if (body.traineeId !== undefined) {
            const traineeId = String(body.traineeId).trim().toUpperCase();

            if (traineeId === "") {
                clearTraineeId = true;
            } else if (!/^[A-Z0-9-]{3,30}$/.test(traineeId)) {
                return res.status(400).json({
                    success: false,
                    message: "Trainee ID must be 3–30 characters using letters, numbers, or hyphens."
                });
            } else {
                profileSet.traineeId = traineeId;
            }
        }

        if (body.enrollmentStatus !== undefined) {
            if (!ENROLLMENT_STATUSES.includes(body.enrollmentStatus)) {
                return res.status(400).json({
                    success: false,
                    message: "Enrolment status must be Pending, Ongoing, Completed, or Inactive."
                });
            }

            profileSet.enrollmentStatus = body.enrollmentStatus;
        }

        if (body.phone !== undefined) {
            const phone = String(body.phone).trim();

            if (phone.length > 30) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number must be 30 characters or fewer."
                });
            }

            profileSet.phone = phone;
        }

        if (body.address !== undefined) {
            const address = String(body.address).trim();

            if (address.length > 300) {
                return res.status(400).json({
                    success: false,
                    message: "Address must be 300 characters or fewer."
                });
            }

            profileSet.address = address;
        }

        if (body.accountStatus !== undefined) {
            if (!ACCOUNT_STATUSES.includes(body.accountStatus)) {
                return res.status(400).json({
                    success: false,
                    message: "Account status must be active or inactive."
                });
            }
        }

        const hasProfileChange = Object.keys(profileSet).length > 0 || clearTraineeId;

        if (hasProfileChange) {
            const update = {
                $set: profileSet,
                $setOnInsert: { user: user._id }
            };

            if (clearTraineeId) {
                update.$unset = { traineeId: 1 };
            }

            await TraineeProfile.findOneAndUpdate(
                { user: user._id },
                update,
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                    setDefaultsOnInsert: true
                }
            );
        }

        if (body.accountStatus !== undefined) {
            user.status = body.accountStatus;
            await user.save();
        }

        const trainee = await loadTrainee(user._id);

        return res.status(200).json({
            success: true,
            message: "Trainee record updated.",
            trainee
        });

    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "That trainee ID is already assigned to another trainee."
            });
        }

        if (error && error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors)[0]?.message || "Please check the trainee details."
            });
        }

        console.error("Update trainee error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update this trainee."
        });
    }
};

module.exports = {
    getTrainees,
    updateTrainee
};
