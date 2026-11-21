const mongoose = require("mongoose");
const { exposeVersionAsJson } = require("../lib/versioning");

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
            trim: true,
            maxlength: 80
        },

        breed: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80
        },

        ageYears: {
            type: Number,
            required: true,
            min: 0,
            max: 40
        },

        // The trainee responsible for the animal's daily care.
        assignedTrainee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },

        healthStatus: {
            type: String,
            enum: ["Healthy", "Under Observation", "Under Treatment"],
            default: "Healthy"
        },

        careStatus: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active"
        },

        notes: {
            type: String,
            default: "",
            trim: true,
            maxlength: 500
        }
    },
    { timestamps: true }
);

exposeVersionAsJson(cowSchema);

const Cow = mongoose.model("Cow", cowSchema);

module.exports = Cow;
