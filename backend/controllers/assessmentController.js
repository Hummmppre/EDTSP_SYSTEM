const Assessment = require("../models/Assessment");

// GET: Retrieve assessments belonging to the logged-in trainee
const getMyAssessments = async (req, res, next) => {
    try {
        const assessments = await Assessment.find({
            user: req.user.id
        }).sort({ assessmentDate: -1, createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: assessments.length,
            assessments
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getMyAssessments };
