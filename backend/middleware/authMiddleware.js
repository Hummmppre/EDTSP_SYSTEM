
const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
    try {
        // Get the token from the request header
        const authHeader = req.headers.authorization;

        console.log("Authorization header received:", !!authHeader);
console.log(
    "Authorization header starts correctly:",
    authHeader ? authHeader.startsWith("Bearer ") : false


);

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. Please log in."
            });
        }

        const token = authHeader.split(" ")[1];

        // Verify the token using the secret in .env
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Make the logged-in user's information available to the route
        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired login session."
        });
    }
};

// Allow only trainee accounts
const traineeOnly = (req, res, next) => {
    if (req.user.role !== "trainee") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Trainee accounts only."
        });
    }

    next();
};


const adminOnly = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Administrator accounts only."
        });
    }

    next();
};

module.exports = { protect, traineeOnly, adminOnly };