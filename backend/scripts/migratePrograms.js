/**
 * Migrate free-text TraineeProfile.program values onto the Program collection.
 *
 *   node scripts/migratePrograms.js            (dry run — prints the plan)
 *   node scripts/migratePrograms.js --apply    (writes)
 */
const mongoose = require("mongoose");

require("dotenv").config();

const Program = require("../models/Program");
const TraineeProfile = require("../models/TraineeProfile");

const DEFAULT_PROGRAM = {
    name: "Dairy Production Training",
    code: "DAIRY",
    totalFee: 18000
};

const run = async () => {
    const apply = process.argv.includes("--apply");
    const stats = {
        profilesScanned: 0,
        programsCreated: 0,
        profilesUpdated: 0,
        unmatched: 0
    };

    const plan = [];
    const programsByName = new Map();

    await mongoose.connect(process.env.MONGODB_URI);

    const existingPrograms = await Program.find();
    existingPrograms.forEach((program) =>
        programsByName.set(program.name.trim().toLowerCase(), program)
    );

    const ensureProgram = async (name) => {
        const key = name.trim().toLowerCase();

        if (programsByName.has(key)) {
            return programsByName.get(key);
        }

        const generatedCode = name
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 12)
            .toUpperCase() || "PROGRAM";

        if (apply) {
            const created = await Program.create({
                name: name.trim(),
                code: `${generatedCode}-${programsByName.size + 1}`,
                totalFee: 18000
            });

            programsByName.set(key, created);
            stats.programsCreated += 1;

            return created;
        }

        const virtual = {
            _id: null,
            name: name.trim(),
            code: `${generatedCode}-${programsByName.size + 1}`
        };

        programsByName.set(key, virtual);
        stats.programsCreated += 1;

        return virtual;
    };

    const defaultProgram = await ensureProgram(DEFAULT_PROGRAM.name);

    const profiles = await TraineeProfile.find({
        $or: [
            { program: { $type: "string" } },
            { program: null },
            { program: { $exists: false } }
        ]
    });

    stats.profilesScanned = await TraineeProfile.countDocuments();

    for (const profile of profiles) {
        const raw = profile.get("program");
        const name = typeof raw === "string" && raw.trim()
            ? raw.trim()
            : DEFAULT_PROGRAM.name;

        if (!name) {
            stats.unmatched += 1;
            continue;
        }

        const program = await ensureProgram(name);
        plan.push({ profile: String(profile._id), name, program: program.code });

        if (apply) {
            profile.set("program", program._id || defaultProgram._id);
            profile.set("legacyProgramName", name);
            await profile.save();
            stats.profilesUpdated += 1;
        }
    }

    if (!apply) {
        plan.forEach((row) => {
            console.log(`  profile ${row.profile}: "${row.name}" -> ${row.program}`);
        });
        console.log(
            "\nDry run only. Re-run with --apply to write the migration."
        );
    }

    console.log("\nProgram migration report");
    console.log("  profiles scanned :", stats.profilesScanned);
    console.log("  profiles in scope:", profiles.length);
    console.log(
        `  programs created : ${stats.programsCreated}${apply ? "" : " (planned)"}`
    );
    console.log(
        `  profiles updated : ${stats.profilesUpdated}${apply ? "" : " (planned)"}`
    );
    console.log("  unmatched        :", stats.unmatched);
};

run()
    .catch((error) => {
        console.error("Program migration failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
