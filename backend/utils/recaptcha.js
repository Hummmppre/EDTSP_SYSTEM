const axios = require("axios");
const { resolveField } = require("../lib/integrationCredentials");

const verifyRecaptcha = async (token) => {
  try {
    if (!token) {
      return false;
    }

    const secret = await resolveField("recaptcha", "secretKey");

    if (!secret.value) {
      return false;
    }

    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      new URLSearchParams({
        secret: secret.value,
        response: token,
      }),
    );

    return response.data.success === true;
  } catch (error) {
    console.error("reCAPTCHA verification error:", error.message);

    return false;
  }
};

module.exports = verifyRecaptcha;
