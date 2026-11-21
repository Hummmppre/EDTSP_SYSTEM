const Counter = require("../models/Counter");
const TraineeProfile = require("../models/TraineeProfile");
const User = require("../models/User");

// Sequence collisions only happen when the counter is behind IDs that already
// exist (legacy or manually edited records). Each retry mints a fresh candidate.
const MAX_ASSIGN_ATTEMPTS = 10;

const currentYear = () => new Date().getFullYear();

const counterKey = (year) => `traineeId-${year}`;

const formatTraineeId = (year, seq) =>
    `EDT-${year}-${String(seq).padStart(3, "0")}`;

// $inc is atomic, so simultaneous signups receive different sequence numbers.
async function nextTraineeId(attempt = 0) {
    const year = currentYear();

    try {
        const counter = await Counter.findOneAndUpdate(
            { _id: counterKey(year) },
            { $inc: { seq: 1 } },
            { upsert: true, new: true }
        );

        return formatTraineeId(year, counter.seq);

    } catch (error) {
        // Two first-ever upserts can race; the loser retries against the doc.
        if (error && error.code === 11000 && attempt < 3) {
            return nextTraineeId(attempt + 1);
        }

        throw error;
    }
}

// If the counter is missing or stale, jump it past the highest ID already in
// use for this year so new IDs cannot collide with existing ones.
async function syncCounterWithExistingIds() {
    const year = currentYear();
    const prefix = `EDT-${year}-`;
    const pattern = new RegExp(`^${prefix}\\d+$`);

    const profiles = await TraineeProfile.find({
        traineeId: { $regex: pattern }
    })
        .select("traineeId")
        .lean();

    const maxSeq = profiles.reduce((highest, profile) => {
        const seq = Number(String(profile.traineeId).slice(prefix.length));

        return Number.isInteger(seq) && seq > highest ? seq : highest;
    }, 0);

    if (maxSeq === 0) return;

    // Raw collection write: Mongoose would add a `seq` default on upsert and
    // conflict with $max on the same path.
    await Counter.collection.updateOne(
        { _id: counterKey(year) },
        { $max: { seq: maxSeq } },
        { upsert: true }
    );
}

// Returns the user's profile with a trainee ID, minting one only when missing.
// Existing IDs are always kept, so this is safe to call repeatedly.
async function assignTraineeId(userId) {
    for (let attempt = 0; attempt < MAX_ASSIGN_ATTEMPTS; attempt += 1) {
        const existing = await TraineeProfile.findOne({ user: userId });

        if (existing && existing.traineeId) {
            return existing;
        }

        const traineeId = await nextTraineeId();

        try {
            if (existing) {
                // Conditional write: never overwrite an ID another request set.
                const updated = await TraineeProfile.findOneAndUpdate(
                    {
                        _id: existing._id,
                        $or: [
                            { traineeId: { $exists: false } },
                            { traineeId: null },
                            { traineeId: "" }
                        ]
                    },
                    {
                        $set: { traineeId },
                        $inc: { version: 1 }
                    },
                    { new: true, runValidators: true }
                );

                if (updated) {
                    return updated;
                }

                continue;
            }

            return await TraineeProfile.create({ user: userId, traineeId });

        } catch (error) {
            // A parallel request may have created this profile; keep its ID.
            const current = await TraineeProfile.findOne({ user: userId });

            if (current && current.traineeId) {
                return current;
            }

            if (error && error.code === 11000) {
                await syncCounterWithExistingIds();
                continue;
            }

            throw error;
        }
    }

    throw new Error(
        "Unable to assign a unique trainee ID after multiple attempts."
    );
}

// Idempotent migration: give an ID to every trainee account that lacks one.
async function backfillTraineeIds({ logger = console } = {}) {
    // Make sure the unique index exists before minting anything.
    await TraineeProfile.init();
    await syncCounterWithExistingIds();

    const users = await User.find({ role: "trainee" }).select("_id").lean();

    if (users.length === 0) {
        return { total: 0, assigned: 0, preserved: 0, failed: 0 };
    }

    const profiles = await TraineeProfile.find({
        user: { $in: users.map(user => user._id) }
    })
        .select("user traineeId")
        .lean();

    const usersWithId = new Set(
        profiles
            .filter(profile => profile.traineeId)
            .map(profile => String(profile.user))
    );

    let assigned = 0;
    let failed = 0;

    for (const user of users) {
        if (usersWithId.has(String(user._id))) continue;

        try {
            await assignTraineeId(user._id);
            assigned += 1;
        } catch (error) {
            failed += 1;

            if (logger) {
                logger.error(
                    `Trainee ID backfill failed for ${user._id}:`,
                    error.message
                );
            }
        }
    }

    return {
        total: users.length,
        assigned,
        preserved: users.length - assigned - failed,
        failed
    };
}

module.exports = {
    nextTraineeId,
    assignTraineeId,
    backfillTraineeIds
};
