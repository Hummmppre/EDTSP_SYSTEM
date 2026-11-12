const mongoose = require("mongoose");

const Program = require("../models/Program");
const Batch = require("../models/Batch");

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateOnly(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return { date: null };
    }

    const text = String(value).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const date = new Date(year, month, day);

        const valid =
            !Number.isNaN(date.getTime()) &&
            date.getFullYear() === year &&
            date.getMonth() === month &&
            date.getDate() === day;

        return valid ? { date } : { error: true };
    }

    const parsed = new Date(text);

    return Number.isNaN(parsed.getTime())
        ? { error: true }
        : { date: startOfDay(parsed) };
}

function parseIntakeDate(value, existingIntakeDate = null) {
    const parsed = parseDateOnly(value);

    if (parsed.error) {
        return { error: "Enter a valid intake date." };
    }

    if (!parsed.date) {
        return { date: null };
    }

    const today = startOfDay(new Date());
    const unchanged =
        existingIntakeDate &&
        startOfDay(new Date(existingIntakeDate)).getTime() === parsed.date.getTime();

    if (parsed.date.getTime() < today.getTime() && !unchanged) {
        return { error: "Intake date cannot be in the past." };
    }

    return { date: parsed.date };
}

function batchView(batch) {
    return {
        _id: batch._id,
        program: batch.program,
        label: batch.label,
        intakeDate: batch.intakeDate,
        slotCapacity: batch.slotCapacity,
        filledCount: batch.filledCount,
        slotsRemaining: Math.max(batch.slotCapacity - batch.filledCount, 0),
        status: batch.status
    };
}

// ADMIN: Programs with their batches
const getPrograms = async (req, res) => {
    try {
        const programs = await Program.find().sort({ name: 1 }).lean();
        const batches = await Batch.find().sort({ label: 1 }).lean();

        const result = programs.map(program => {
            const programBatches = batches
                .filter(batch => String(batch.program) === String(program._id))
                .map(batchView);

            return {
                ...program,
                batches: programBatches,
                totalSlots: programBatches.reduce((sum, batch) => sum + batch.slotCapacity, 0),
                slotsRemaining: programBatches.reduce((sum, batch) => sum + batch.slotsRemaining, 0)
            };
        });

        return res.status(200).json({
            success: true,
            count: result.length,
            programs: result
        });

    } catch (error) {
        console.error("Get programs error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve programs."
        });
    }
};

// ADMIN: Create a program, optionally with its first batch
const createProgram = async (req, res) => {
    try {
        const { name, description, fee, firstBatch } = req.body || {};

        if (!name || !String(name).trim() || !description || !String(description).trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a program name and description."
            });
        }

        if (!Number.isFinite(Number(fee)) || Number(fee) < 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid training fee."
            });
        }

        let batchInput = null;

        if (firstBatch !== undefined && firstBatch !== null) {
            if (typeof firstBatch !== "object" || Array.isArray(firstBatch)) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide valid first batch details."
                });
            }

            const label = String(firstBatch.label || "").trim();
            const capacity = Number(firstBatch.slotCapacity);

            if (!label) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a batch label."
                });
            }

            if (!Number.isInteger(capacity) || capacity < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Slot capacity must be a whole number of at least 1."
                });
            }

            const intake = parseIntakeDate(firstBatch.intakeDate);

            if (intake.error) {
                return res.status(400).json({
                    success: false,
                    message: intake.error
                });
            }

            batchInput = {
                label,
                slotCapacity: capacity,
                intakeDate: intake.date
            };
        }

        const program = await Program.create({
            name: String(name).trim(),
            description: String(description).trim(),
            fee: Number(fee),
            status: "Open",
            createdBy: req.user.id
        });

        if (!batchInput) {
            return res.status(201).json({
                success: true,
                message: "Program created.",
                program
            });
        }

        try {
            const batch = await Batch.create({
                program: program._id,
                label: batchInput.label,
                slotCapacity: batchInput.slotCapacity,
                intakeDate: batchInput.intakeDate,
                filledCount: 0,
                status: "Open"
            });

            return res.status(201).json({
                success: true,
                message: "Program and first batch created.",
                program,
                batch: batchView(batch)
            });

        } catch (batchError) {
            // The first batch is part of the same save: do not leave a
            // program behind that the administrator cannot see the result of.
            try {
                await Program.deleteOne({ _id: program._id });
            } catch (rollbackError) {
                console.error(
                    `Failed to roll back program ${program._id} after first batch error:`,
                    rollbackError
                );
            }

            if (batchError && batchError.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: "This program already has a batch with that label."
                });
            }

            if (batchError && batchError.name === "ValidationError") {
                return res.status(400).json({
                    success: false,
                    message: Object.values(batchError.errors)[0]?.message || "Please check the first batch details."
                });
            }

            console.error("Create first batch error:", batchError);

            return res.status(500).json({
                success: false,
                message: "Unable to create this program."
            });
        }

    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A program with this name already exists."
            });
        }

        console.error("Create program error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create this program."
        });
    }
};

// ADMIN: Update a program
const updateProgram = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: "Program not found."
            });
        }

        const program = await Program.findById(req.params.id);

        if (!program) {
            return res.status(404).json({
                success: false,
                message: "Program not found."
            });
        }

        const previousStatus = program.status;
        const { name, description, fee, status } = req.body || {};

        if (name !== undefined) {
            if (!String(name).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Program name cannot be empty."
                });
            }
            program.name = String(name).trim();
        }

        if (description !== undefined) {
            if (!String(description).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Program description cannot be empty."
                });
            }
            program.description = String(description).trim();
        }

        if (fee !== undefined) {
            if (!Number.isFinite(Number(fee)) || Number(fee) < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid training fee."
                });
            }
            program.fee = Number(fee);
        }

        if (status !== undefined) {
            if (!["Open", "Closed"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Program status must be Open or Closed."
                });
            }
            program.status = status;
        }

        await program.save();

        let closedBatchCount = 0;

        if (status === "Closed") {
            try {
                const result = await Batch.updateMany(
                    { program: program._id, status: "Open" },
                    { $set: { status: "Closed" } }
                );

                closedBatchCount = result.modifiedCount || 0;

            } catch (batchError) {
                console.error("Close program batches error:", batchError);

                try {
                    program.status = previousStatus;
                    await program.save();
                } catch (revertError) {
                    console.error("Revert program status error:", revertError);
                }

                return res.status(500).json({
                    success: false,
                    message: "Unable to close this program."
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: "Program updated.",
            program,
            closedBatchCount
        });

    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A program with this name already exists."
            });
        }

        console.error("Update program error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update this program."
        });
    }
};

// ADMIN: Add a batch to a program
const createBatch = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: "Program not found."
            });
        }

        const program = await Program.findById(req.params.id);

        if (!program) {
            return res.status(404).json({
                success: false,
                message: "Program not found."
            });
        }

        const { label, slotCapacity, intakeDate } = req.body || {};

        if (!label || !String(label).trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a batch label."
            });
        }

        if (!Number.isInteger(Number(slotCapacity)) || Number(slotCapacity) < 1) {
            return res.status(400).json({
                success: false,
                message: "Slot capacity must be a whole number of at least 1."
            });
        }

        const intake = parseIntakeDate(intakeDate);

        if (intake.error) {
            return res.status(400).json({
                success: false,
                message: intake.error
            });
        }

        // An open batch under a closed program can never be seen by trainees.
        const batchStatus = program.status === "Open" ? "Open" : "Closed";

        const batch = await Batch.create({
            program: program._id,
            label: String(label).trim(),
            slotCapacity: Number(slotCapacity),
            intakeDate: intake.date,
            status: batchStatus
        });

        return res.status(201).json({
            success: true,
            message: batchStatus === "Open"
                ? "Batch created."
                : "Batch created. Reopen the program to accept applications.",
            batch: batchView(batch)
        });

    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This program already has a batch with that label."
            });
        }

        console.error("Create batch error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create this batch."
        });
    }
};

// ADMIN: Update a batch
const updateBatch = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: "Batch not found."
            });
        }

        const batch = await Batch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({
                success: false,
                message: "Batch not found."
            });
        }

        const { label, slotCapacity, intakeDate, status } = req.body || {};

        if (label !== undefined) {
            if (!String(label).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Batch label cannot be empty."
                });
            }
            batch.label = String(label).trim();
        }

        if (slotCapacity !== undefined) {
            if (!Number.isInteger(Number(slotCapacity)) || Number(slotCapacity) < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Slot capacity must be a whole number of at least 1."
                });
            }

            if (Number(slotCapacity) < batch.filledCount) {
                return res.status(400).json({
                    success: false,
                    message: "Capacity cannot be lower than the number of approved applicants already in this batch."
                });
            }

            batch.slotCapacity = Number(slotCapacity);
        }

        if (intakeDate !== undefined) {
            const intake = parseIntakeDate(intakeDate, batch.intakeDate);

            if (intake.error) {
                return res.status(400).json({
                    success: false,
                    message: intake.error
                });
            }

            batch.intakeDate = intake.date;
        }

        if (status !== undefined) {
            if (!["Open", "Closed"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Batch status must be Open or Closed."
                });
            }

            if (status === "Open") {
                const program = await Program.findById(batch.program);

                if (!program || program.status !== "Open") {
                    return res.status(409).json({
                        success: false,
                        message: "Reopen the program before opening this batch."
                    });
                }
            }

            batch.status = status;
        }

        await batch.save();

        return res.status(200).json({
            success: true,
            message: "Batch updated.",
            batch: batchView(batch)
        });

    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This program already has a batch with that label."
            });
        }

        console.error("Update batch error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update this batch."
        });
    }
};

module.exports = {
    getPrograms,
    createProgram,
    updateProgram,
    createBatch,
    updateBatch
};
