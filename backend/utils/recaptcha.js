
const axios = require("axios");

const verifyRecaptcha = async (token) => {
    try {
        if (!token || !process.env.RECAPTCHA_SECRET_KEY) {
            return false;
        }

        const response = await axios.post(
            "https://www.google.com/recaptcha/api/siteverify",
            new URLSearchParams({
                secret: process.env.RECAPTCHA_SECRET_KEY,
                response: token
            })
        );

        return response.data.success === true;

    } catch (error) {
        console.error(
            "reCAPTCHA verification error:",
            error.message
        );

        return false;
    }
};

module.exports = verifyRecaptcha;
