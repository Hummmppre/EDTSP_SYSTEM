/**
 * Bring legacy assessment documents onto the current schema:
 *   - add assessmentType "Written" where missing
 *   - convert status "Completed" to "Pending" (no score) or "Graded" (score)
 *
 *   node scripts/migrateAssessments.js            (dry run)
 *   node scripts/migrateAssessments.js --apply    (writes)
 */
const mongoose = require("mongoose");

require("dotenv").config();

const Assessment = require("../models/Assessment");

const run = async () => {
    const apply = process.argv.includes("--apply");
    const stats = {
        scanned: 0,
        missingType: 0,
        completedToPending: 0,
        completedToGraded: 0
    };

    await mongoose.connect(process.env.MONGODB_URI);

    stats.scanned = await Assessment.countDocuments();

    const missingType = await Assessment.find({
        $or: [
            { assessmentType: { $exists: false } },
            { assessmentType: null }
        ]
    });

    stats.missingType = missingType.length;

    if (apply && missingType.length > 0) {
        await Assessment.updateMany(
            { _id: { $in: missingType.map((item) => item._id) } },
            { $set: { assessmentType: "Written" } }
        );
    }

    const completed = await Assessment.find({ status: "Completed" });

    for (const assessment of completed) {
        const hasScore =
            assessment.score !== null &&
            assessment.score !== undefined &&
            Number.isFinite(Number(assessment.score));

        if (hasScore) {
            stats.completedToGraded += 1;
            if (apply) {
                assessment.status = "Graded";
                await assessment.save();
            }
        } else {
            stats.completedToPending += 1;
            if (apply) {
                assessment.status = "Pending";
                await assessment.save();
            }
        }
    }

    console.log("\nAssessment migration report");
    console.log("  documents scanned    :", stats.scanned);
    console.log("  missing type         :", stats.missingType);
    console.log("  Completed -> Graded  :", stats.completedToGraded);
    console.log("  Completed -> Pending :", stats.completedToPending);

    if (!apply) {
        console.log("\nDry run only. Re-run with --apply to write the migration.");
    }
};

run()
    .catch((error) => {
        console.error("Assessment migration failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
