/**
 * Guarded demo dataset.
 *
 *   node scripts/seedDemo.js --demo            (create/refresh demo records)
 *   node scripts/seedDemo.js --demo --reset    (remove demo records only)
 *
 * Only accounts on the DEMO_DOMAIN and records referencing them are touched.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

require("dotenv").config();

const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const Program = require("../models/Program");
const Assessment = require("../models/Assessment");
const Cow = require("../models/Cow");
const MaintenanceActivity = require("../models/MaintenanceActivity");
const Payment = require("../models/Payment");

const DEMO_DOMAIN = "@demo.edtsp.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "DemoPass123!";
const DEMO_COW_IDS = ["COW-901", "COW-902", "COW-903"];

const PROGRAM_SEEDS = [
    { name: "Dairy Production Training", code: "DAIRY", totalFee: 18000 },
    { name: "Animal Nutrition", code: "NUTRITION", totalFee: 15000 },
    { name: "Farm Safety", code: "SAFETY", totalFee: 12000 }
];

const TRAINEE_SEEDS = [
    {
        firstName: "Juan",
        lastName: "Dela Cruz",
        handle: "juan",
        traineeId: "EDT-2026-901",
        programCode: "DAIRY",
        enrollmentStatus: "Ongoing"
    },
    {
        firstName: "Maria",
        lastName: "Santos",
        handle: "maria",
        traineeId: "EDT-2026-902",
        programCode: "NUTRITION",
        enrollmentStatus: "Pending"
    },
    {
        firstName: "Pedro",
        lastName: "Reyes",
        handle: "pedro",
        traineeId: "EDT-2026-903",
        programCode: "DAIRY",
        enrollmentStatus: "Completed"
    },
    {
        firstName: "Ana",
        lastName: "Garcia",
        handle: "ana",
        traineeId: "EDT-2026-904",
        programCode: "SAFETY",
        enrollmentStatus: "Inactive",
        status: "inactive"
    }
];

const fail = (message) => {
    console.error(`\nSeed refused: ${message}\n`);
    process.exit(1);
};

const daysAgo = (days) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const resetDemo = async () => {
    const demoUsers = await User.find({
        email: { $regex: `${DEMO_DOMAIN}$` }
    }).distinct("_id");

    const [payments, assessments, activities, profiles, cows, users] =
        await Promise.all([
            Payment.deleteMany({ user: { $in: demoUsers } }),
            Assessment.deleteMany({ user: { $in: demoUsers } }),
            MaintenanceActivity.deleteMany({
                $or: [
                    { assignedTrainees: { $in: demoUsers } },
                    { createdBy: { $in: demoUsers } }
                ]
            }),
            TraineeProfile.deleteMany({ user: { $in: demoUsers } }),
            Cow.deleteMany({ cowId: { $in: DEMO_COW_IDS } }),
            User.deleteMany({ _id: { $in: demoUsers } })
        ]);

    console.log("\nDemo reset report");
    console.log("  users removed      :", users.deletedCount);
    console.log("  profiles removed   :", profiles.deletedCount);
    console.log("  payments removed   :", payments.deletedCount);
    console.log("  assessments removed:", assessments.deletedCount);
    console.log("  activities removed :", activities.deletedCount);
    console.log("  cows removed       :", cows.deletedCount);
};

const seed = async () => {
    const programByCode = new Map();

    for (const seedProgram of PROGRAM_SEEDS) {
        const program = await Program.findOneAndUpdate(
            { code: seedProgram.code },
            { $set: { ...seedProgram, active: true } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        programByCode.set(program.code, program);
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const trainees = [];

    for (const seedTrainee of TRAINEE_SEEDS) {
        const email = `${seedTrainee.handle}${DEMO_DOMAIN}`;

        const user = await User.findOneAndUpdate(
            { email },
            {
                $set: {
                    firstName: seedTrainee.firstName,
                    lastName: seedTrainee.lastName,
                    email,
                    password: passwordHash,
                    role: "trainee",
                    status: seedTrainee.status || "active"
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        const profile = await TraineeProfile.findOneAndUpdate(
            { user: user._id },
            {
                $set: {
                    traineeId: seedTrainee.traineeId,
                    program: programByCode.get(seedTrainee.programCode)._id,
                    legacyProgramName: "",
                    enrollmentStatus: seedTrainee.enrollmentStatus,
                    phone: "+63 917 000 0000",
                    address: "Esperon Dairy Farm, Batangas"
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        trainees.push({ user, profile, seed: seedTrainee });
    }

    const assessments = [
        {
            handle: "juan",
            assessmentTitle: "Dairy production assessment",
            subject: "Dairy Production",
            assessmentType: "Written",
            totalScore: 100,
            score: 85,
            status: "Graded",
            assessmentDate: daysAgo(8)
        },
        {
            handle: "juan",
            assessmentTitle: "Milking hygiene practical",
            subject: "Dairy Production",
            assessmentType: "Practical",
            totalScore: 50,
            score: null,
            status: "Pending",
            dueDate: daysAgo(-3)
        },
        {
            handle: "maria",
            assessmentTitle: "Animal nutrition assessment",
            subject: "Animal Nutrition",
            assessmentType: "Written",
            totalScore: 100,
            score: null,
            status: "Pending",
            dueDate: daysAgo(-5)
        },
        {
            handle: "pedro",
            assessmentTitle: "Farm safety assessment",
            subject: "Farm Safety",
            assessmentType: "Oral",
            totalScore: 100,
            score: 92,
            status: "Graded",
            assessmentDate: daysAgo(6)
        },
        {
            handle: "pedro",
            assessmentTitle: "Feed handling performance",
            subject: "Animal Nutrition",
            assessmentType: "Performance",
            totalScore: 40,
            score: 31,
            status: "Graded",
            assessmentDate: daysAgo(2)
        },
        {
            handle: "ana",
            assessmentTitle: "Safety induction",
            subject: "Farm Safety",
            assessmentType: "Written",
            totalScore: 60,
            score: null,
            status: "Pending",
            dueDate: daysAgo(-10)
        }
    ];

    const byHandle = new Map(
        trainees.map((entry) => [entry.seed.handle, entry])
    );

    for (const item of assessments) {
        const trainee = byHandle.get(item.handle);

        await Assessment.findOneAndUpdate(
            {
                user: trainee.user._id,
                assessmentTitle: item.assessmentTitle
            },
            {
                $set: {
                    subject: item.subject,
                    assessmentType: item.assessmentType,
                    totalScore: item.totalScore,
                    score: item.score,
                    status: item.status,
                    assessmentDate: item.assessmentDate || null,
                    dueDate: item.dueDate || null,
                    remarks: item.remarks || ""
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }

    const cows = [];

    for (const cowSeed of [
        {
            cowId: "COW-901",
            name: "Bella",
            breed: "Holstein",
            ageYears: 4,
            healthStatus: "Healthy",
            handles: ["juan", "pedro"],
            notes: "Morning milking group."
        },
        {
            cowId: "COW-902",
            name: "Daisy",
            breed: "Jersey",
            ageYears: 3,
            healthStatus: "Under Observation",
            handles: ["maria"],
            notes: "Monitor appetite this week."
        },
        {
            cowId: "COW-903",
            name: "Clover",
            breed: "Brown Swiss",
            ageYears: 5,
            healthStatus: "Under Treatment",
            handles: ["juan", "maria", "pedro"],
            notes: "Hoof treatment every other day."
        }
    ]) {
        const cow = await Cow.findOneAndUpdate(
            { cowId: cowSeed.cowId },
            {
                $set: {
                    name: cowSeed.name,
                    breed: cowSeed.breed,
                    ageYears: cowSeed.ageYears,
                    healthStatus: cowSeed.healthStatus,
                    assignedTrainees: cowSeed.handles.map(
                        (handle) => byHandle.get(handle).user._id
                    ),
                    notes: cowSeed.notes
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        cows.push(cow);
    }

    const activitySeeds = [
        {
            cowId: "COW-901",
            type: "Feeding",
            description: "Morning feed round",
            scheduledAt: new Date(new Date().setHours(6, 0, 0, 0)),
            status: "Completed",
            handles: ["juan", "pedro"]
        },
        {
            cowId: "COW-901",
            type: "Drinking",
            description: "Refill water trough",
            scheduledAt: new Date(new Date().setHours(16, 0, 0, 0)),
            status: "Pending",
            handles: ["juan"]
        },
        {
            cowId: "COW-902",
            type: "Medication",
            description: "Appetite observation and vitamin dose",
            scheduledAt: new Date(new Date().setHours(9, 30, 0, 0)),
            status: "Pending",
            handles: ["maria"]
        },
        {
            cowId: "COW-903",
            type: "Medication",
            description: "Hoof treatment",
            scheduledAt: daysAgo(1),
            status: "Completed",
            handles: ["juan", "maria", "pedro"]
        },
        {
            cowId: "COW-903",
            type: "General",
            description: "Stall cleaning",
            scheduledAt: new Date(new Date().setHours(14, 0, 0, 0)),
            status: "Pending",
            handles: ["pedro"]
        },
        {
            cowId: "COW-902",
            type: "Feeding",
            description: "Evening feed round",
            scheduledAt: daysAgo(3),
            status: "Completed",
            handles: ["maria"]
        }
    ];

    for (const activitySeed of activitySeeds) {
        const cow = cows.find((item) => item.cowId === activitySeed.cowId);

        await MaintenanceActivity.findOneAndUpdate(
            {
                cow: cow._id,
                description: activitySeed.description,
                scheduledAt: activitySeed.scheduledAt
            },
            {
                $set: {
                    type: activitySeed.type,
                    status: activitySeed.status,
                    assignedTrainees: activitySeed.handles.map(
                        (handle) => byHandle.get(handle).user._id
                    ),
                    completedAt:
                        activitySeed.status === "Completed"
                            ? activitySeed.scheduledAt
                            : null
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }

    const paymentSeeds = [
        {
            handle: "juan",
            amount: 9000,
            status: "Verified",
            method: "Bank Transfer",
            reference: "DEMO-BT-001",
            daysAgo: 30
        },
        {
            handle: "juan",
            amount: 4500,
            status: "Verified",
            method: "GCash",
            reference: "DEMO-GC-002",
            daysAgo: 12
        },
        {
            handle: "juan",
            amount: 1500,
            status: "Pending",
            method: "Cash",
            reference: "DEMO-CS-003",
            daysAgo: 1
        },
        {
            handle: "pedro",
            amount: 18000,
            status: "Verified",
            method: "Cash",
            reference: "DEMO-CS-004",
            daysAgo: 60
        },
        {
            handle: "maria",
            amount: 5000,
            status: "Rejected",
            method: "GCash",
            reference: "DEMO-GC-005",
            daysAgo: 5,
            remarks: "Reference could not be matched to a transfer."
        },
        {
            handle: "ana",
            amount: 3000,
            status: "Pending",
            method: "Bank Transfer",
            reference: "DEMO-BT-006",
            daysAgo: 2
        }
    ];

    let counter = 0;

    for (const paymentSeed of paymentSeeds) {
        const trainee = byHandle.get(paymentSeed.handle);
        counter += 1;

        const paymentRef = `EDT-PAY-9${String(counter).padStart(5, "0")}`;

        await Payment.findOneAndUpdate(
            { paymentRef },
            {
                $set: {
                    user: trainee.user._id,
                    program: trainee.profile.program,
                    amount: paymentSeed.amount,
                    paymentDate: daysAgo(paymentSeed.daysAgo),
                    method: paymentSeed.method,
                    reference: paymentSeed.reference,
                    status: paymentSeed.status,
                    remarks: paymentSeed.remarks || "",
                    verifiedAt:
                        paymentSeed.status === "Pending" ? null : daysAgo(1)
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }

    console.log("\nDemo dataset ready");
    console.log("  programs   :", PROGRAM_SEEDS.length);
    console.log("  trainees   :", TRAINEE_SEEDS.length);
    console.log("  assessments:", assessments.length);
    console.log("  cows       :", cows.length);
    console.log("  activities :", activitySeeds.length);
    console.log("  payments   :", paymentSeeds.length);
    console.log("\nLogin with any demo account:");
    TRAINEE_SEEDS.forEach((trainee) => {
        console.log(`  ${trainee.handle}${DEMO_DOMAIN}  /  ${DEMO_PASSWORD}`);
    });
};

const run = async () => {
    if (!process.argv.includes("--demo")) {
        fail("pass --demo to seed the development dataset.");
    }

    if (
        process.env.NODE_ENV === "production" &&
        !process.argv.includes("--force")
    ) {
        fail(
            "NODE_ENV is production. Pass --force only if you are certain."
        );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    if (process.argv.includes("--reset")) {
        await resetDemo();
    } else {
        await seed();
    }
};

run()
    .catch((error) => {
        console.error("Demo seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
