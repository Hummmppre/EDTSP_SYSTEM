// One-time, idempotent move from the old `version` field to Mongoose's `__v`
// version key. Raw collection writes are used so stored `updatedAt` values are
// preserved exactly; Mongoose timestamps would otherwise rewrite them.
const TraineeProfile = require("../models/TraineeProfile");
const Assessment = require("../models/Assessment");
const Payment = require("../models/Payment");
const Program = require("../models/Program");
const Cow = require("../models/Cow");
const Batch = require("../models/Batch");

const VERSIONED_MODELS = [
    TraineeProfile,
    Assessment,
    Payment,
    Program,
    Cow,
    Batch
];

async function migrateVersionCounters({ logger = console } = {}) {
    const results = [];

    for (const Model of VERSIONED_MODELS) {
        const collection = Model.collection;

        // Copying the old counter keeps every version a client already read
        // valid, so an open edit form still saves unless another write landed.
        const copied = await collection.updateMany(
            { version: { $exists: true } },
            [
                {
                    $set: {
                        __v: {
                            $cond: [
                                { $isNumber: "$version" },
                                { $max: [0, { $floor: "$version" }] },
                                { $ifNull: ["$__v", 0] }
                            ]
                        }
                    }
                },
                { $unset: "version" }
            ]
        );

        // Documents written outside Mongoose may never have received `__v`.
        const initialized = await collection.updateMany(
            { __v: null },
            { $set: { __v: 0 } }
        );

        const result = {
            collection: collection.collectionName,
            migrated: copied.modifiedCount || 0,
            initialized: initialized.modifiedCount || 0
        };

        results.push(result);

        if (logger && (result.migrated || result.initialized)) {
            logger.log(
                `Version migration ${result.collection}: ` +
                    `${result.migrated} copied, ${result.initialized} initialized.`
            );
        }
    }

    return {
        migrated: results.reduce((total, item) => total + item.migrated, 0),
        initialized: results.reduce((total, item) => total + item.initialized, 0),
        collections: results
    };
}

module.exports = { migrateVersionCounters };
