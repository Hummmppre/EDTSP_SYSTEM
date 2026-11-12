// Development convenience only: creates training programs and batches so the
// application form has something to list. Never creates applicants.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");

const Program = require("../models/Program");
const Batch = require("../models/Batch");

const PROGRAMS = [
    {
        name: "Dairy Production Training",
        description:
            "Hands-on training in milk production, animal handling, and farm records.",
        fee: 18000,
        batches: [
            { label: "Batch 1 · 2026", slotCapacity: 25, intakeDate: "2026-01-12" },
            { label: "Batch 2 · 2026", slotCapacity: 25, intakeDate: "2026-06-08" }
        ]
    },
    {
        name: "Animal Nutrition & Feeding",
        description:
            "Feed formulation, ration planning, and nutrition records for dairy herds.",
        fee: 12000,
        batches: [
            { label: "Batch 1 · 2026", slotCapacity: 15, intakeDate: "2026-02-02" }
        ]
    },
    {
        name: "Farm Safety & Hygiene",
        description:
            "Milking hygiene, biosecurity, and safe handling practices on a dairy farm.",
        fee: 9000,
        batches: [
            { label: "Batch 1 · 2026", slotCapacity: 20, intakeDate: "2026-03-09" }
        ]
    }
];

async function seedPrograms() {
    await mongoose.connect(process.env.MONGODB_URI);

    for (const entry of PROGRAMS) {
        const program = await Program.findOneAndUpdate(
            { name: entry.name },
            {
                $set: {
                    description: entry.description,
                    fee: entry.fee,
                    status: "Open"
                },
                $setOnInsert: { name: entry.name }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        for (const batch of entry.batches) {
            await Batch.findOneAndUpdate(
                { program: program._id, label: batch.label },
                {
                    $setOnInsert: {
                        program: program._id,
                        label: batch.label,
                        slotCapacity: batch.slotCapacity,
                        intakeDate: batch.intakeDate ? new Date(batch.intakeDate) : null,
                        filledCount: 0,
                        status: "Open"
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }

        console.log(`Seeded program: ${entry.name}`);
    }

    console.log("Programs and batches seeded. No applicant records were created.");
}

seedPrograms()
    .catch(error => {
        console.error("Seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
