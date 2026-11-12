const Program = require("../models/Program");
const TraineeProfile = require("../models/TraineeProfile");

const { getPagination, paginationMeta } = require("../utils/pagination");
const { searchRegExp } = require("../utils/dates");
const { serializedProgram } = require("../utils/serializers");

const attachTraineeCounts = async (programs) => {
    const counts = await TraineeProfile.aggregate([
        { $match: { program: { $in: programs.map((program) => program._id) } } },
        { $group: { _id: "$program", count: { $sum: 1 } } }
    ]);

    const countByProgram = new Map(
        counts.map((row) => [String(row._id), row.count])
    );

    return programs.map((program) => ({
        ...serializedProgram(program),
        traineeCount: countByProgram.get(String(program._id)) || 0
    }));
};

const listPrograms = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const { search, active } = req.query;

        const filter = {};

        if (active === "true" || active === "false") {
            filter.active = active === "true";
        }

        if (search && String(search).trim()) {
            const rx = searchRegExp(search);
            filter.$or = [{ name: rx }, { code: rx }];
        }

        const [total, programs] = await Promise.all([
            Program.countDocuments(filter),
            Program.find(filter)
                .sort({ name: 1 })
                .skip(skip)
                .limit(limit)
        ]);

        const withCounts = await attachTraineeCounts(programs);

        const [allPrograms, activePrograms, enrolled, feeConfigured] =
            await Promise.all([
                Program.countDocuments(),
                Program.countDocuments({ active: true }),
                TraineeProfile.countDocuments({ program: { $ne: null } }),
                Program.aggregate([
                    { $group: { _id: null, total: { $sum: "$totalFee" } } }
                ])
            ]);

        return res.status(200).json({
            success: true,
            count: withCounts.length,
            ...paginationMeta(total, { page, limit }),
            summary: {
                programs: allPrograms,
                activePrograms,
                enrolledTrainees: enrolled,
                totalFeesConfigured: allPrograms,
                totalFeeValue: feeConfigured.length ? feeConfigured[0].total : 0
            },
            programs: withCounts
        });
    } catch (error) {
        return next(error);
    }
};

const createProgram = async (req, res, next) => {
    try {
        const { name, code, totalFee, description, active } = req.body;

        if (!String(name || "").trim() || !String(code || "").trim()) {
            return res.status(400).json({
                success: false,
                message: "Program name and code are required.",
                code: "MISSING_FIELD"
            });
        }

        if (!Number.isFinite(Number(totalFee)) || Number(totalFee) < 0) {
            return res.status(400).json({
                success: false,
                message: "The total fee must be zero or more.",
                field: "totalFee",
                code: "INVALID_FEE"
            });
        }

        const program = await Program.create({
            name: String(name).trim(),
            code: String(code).trim().toUpperCase(),
            totalFee: Number(totalFee),
            description: description || "",
            active: active !== false
        });

        return res.status(201).json({
            success: true,
            message: "Program created.",
            program: { ...serializedProgram(program), traineeCount: 0 }
        });
    } catch (error) {
        return next(error);
    }
};

const updateProgram = async (req, res, next) => {
    try {
        const program = await Program.findById(req.params.id);

        if (!program) {
            return res.status(404).json({
                success: false,
                message: "Program not found.",
                code: "NOT_FOUND"
            });
        }

        const { name, code, totalFee, description, active } = req.body;

        if (name !== undefined) program.name = String(name).trim();
        if (code !== undefined) program.code = String(code).trim().toUpperCase();

        if (totalFee !== undefined) {
            if (!Number.isFinite(Number(totalFee)) || Number(totalFee) < 0) {
                return res.status(400).json({
                    success: false,
                    message: "The total fee must be zero or more.",
                    field: "totalFee",
                    code: "INVALID_FEE"
                });
            }

            program.totalFee = Number(totalFee);
        }

        if (description !== undefined) program.description = description;
        if (active !== undefined) program.active = Boolean(active);

        await program.save();

        const [withCount] = await attachTraineeCounts([program]);

        return res.status(200).json({
            success: true,
            message: "Program updated. Balances recalculate immediately.",
            program: withCount
        });
    } catch (error) {
        return next(error);
    }
};

const deleteProgram = async (req, res, next) => {
    try {
        const program = await Program.findById(req.params.id);

        if (!program) {
            return res.status(404).json({
                success: false,
                message: "Program not found.",
                code: "NOT_FOUND"
            });
        }

        const inUse = await TraineeProfile.countDocuments({
            program: program._id
        });

        if (inUse > 0) {
            return res.status(409).json({
                success: false,
                message: `${inUse} trainee${inUse === 1 ? " is" : "s are"} still enrolled in this program. Reassign them before deleting it.`,
                code: "PROGRAM_IN_USE"
            });
        }

        await program.deleteOne();

        return res.status(200).json({
            success: true,
            message: "Program deleted."
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    listPrograms,
    createProgram,
    updateProgram,
    deleteProgram
};
