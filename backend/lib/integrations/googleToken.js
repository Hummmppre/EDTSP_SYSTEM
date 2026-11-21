const { randomUUID } = require("crypto");
const { fetchProvider, ProviderTransportError } = require("./http");
const { parseScopes } = require("./googleScopes");

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function errorCode(body) {
  return body && typeof body === "object" ? String(body.error || "") : "";
}

function transportCode(error) {
  if (error instanceof ProviderTransportError) return error.code;

  return "provider_error";
}

async function verifyClientPair({
  clientId,
  clientSecret,
  redirectUri,
  dummyCode,
  fetchImpl,
  timeoutMs,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: dummyCode || `edtsp-validation-${randomUUID()}`,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri || "http://localhost",
  });

  try {
    const response = await fetchProvider(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
      fetchImpl,
      timeoutMs,
    });

    if (response.status === 200) return { ok: true };

    if (response.status === 429 || response.status >= 500) {
      return { ok: false, code: "provider_error" };
    }

    const code = errorCode(response.body);

    if (code === "invalid_grant" || code === "redirect_uri_mismatch") {
      return { ok: true };
    }

    if (
      code === "invalid_client" ||
      code === "unauthorized_client" ||
      code === "invalid_request"
    ) {
      return { ok: false, code: "invalid_credentials" };
    }

    return { ok: false, code: "provider_error" };
  } catch (error) {
    return { ok: false, code: transportCode(error) };
  }
}

async function refreshAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl,
  timeoutMs,
}) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  try {
    const response = await fetchProvider(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
      fetchImpl,
      timeoutMs,
    });

    if (response.status === 200 && response.body && response.body.access_token) {
      return {
        ok: true,
        accessToken: response.body.access_token,
        scopes: parseScopes(response.body.scope),
      };
    }

    if (response.status === 429 || response.status >= 500) {
      return { ok: false, code: "provider_error" };
    }

    const code = errorCode(response.body);

    if (code === "invalid_client") {
      return { ok: false, code: "invalid_credentials" };
    }

    if (code === "invalid_grant") {
      return { ok: false, code: "needs_reconnect" };
    }

    return { ok: false, code: "provider_error" };
  } catch (error) {
    return { ok: false, code: transportCode(error) };
  }
}

module.exports = {
  TOKEN_URL,
  verifyClientPair,
  refreshAccessToken,
};
