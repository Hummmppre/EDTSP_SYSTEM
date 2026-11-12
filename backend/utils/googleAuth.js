
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (idToken) => {
    const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email || payload.email_verified !== true) {
        throw new Error("Google account email is not verified.");
    }

    return {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        firstName: payload.given_name || "Google",
        lastName: payload.family_name || "User"
    };
};

module.exports = verifyGoogleToken;
