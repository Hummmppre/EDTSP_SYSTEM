
const Assessment = require("../models/Assessment");

// GET: Retrieve assessments belonging to the logged-in trainee
const getMyAssessments = async (req, res) => {
    try {
        const assessments = await Assessment.find({
            user: req.user.id
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: assessments.length,
            assessments
        });

    } catch (error) {
        console.error("Get assessments error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve assessments."
        });
    }
};

module.exports = { getMyAssessments };
