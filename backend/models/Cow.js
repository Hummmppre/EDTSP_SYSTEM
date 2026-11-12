const mongoose = require("mongoose");

const HEALTH_STATUSES = ["Healthy", "Under Observation", "Under Treatment"];

const cowSchema = new mongoose.Schema(
    {
        cowId: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        breed: {
            type: String,
            default: "",
            trim: true
        },

        ageYears: {
            type: Number,
            min: 0,
            max: 30,
            default: null
        },

        healthStatus: {
            type: String,
            enum: HEALTH_STATUSES,
            default: "Healthy"
        },

        // Several trainees may be responsible for one animal.
        assignedTrainees: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ],

        notes: {
            type: String,
            default: "",
            trim: true
        }
    },
    { timestamps: true }
);

cowSchema.index({ assignedTrainees: 1 });

const Cow = mongoose.model("Cow", cowSchema);

module.exports = Cow;
module.exports.HEALTH_STATUSES = HEALTH_STATUSES;
