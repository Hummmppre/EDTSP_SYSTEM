const { OAuth2Client } = require("google-auth-library");
const { resolveField } = require("../lib/integrationCredentials");

const verifyGoogleToken = async (idToken) => {
  const clientId = await resolveField("google-auth", "clientId");

  if (!clientId.value) {
    throw new Error("Google sign-in is not configured.");
  }

  const client = new OAuth2Client(clientId.value);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId.value,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email || payload.email_verified !== true) {
    throw new Error("Google account email is not verified.");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    firstName: payload.given_name || "Google",
    lastName: payload.family_name || "User",
  };
};

module.exports = verifyGoogleToken;
