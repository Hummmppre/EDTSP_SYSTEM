const DEFAULT_TIMEOUT_MS = 8000;

class ProviderTransportError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);

    this.name = "ProviderTransportError";
    this.code = code;
  }
}

async function fetchProvider(
  url,
  {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = {},
) {
  let response;

  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new ProviderTransportError(
        "timeout",
        "The provider did not answer in time.",
        { cause: error },
      );
    }

    throw new ProviderTransportError(
      "network_error",
      "The provider could not be reached.",
      { cause: error },
    );
  }

  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      if (response.ok) {
        throw new ProviderTransportError(
          "provider_error",
          "The provider returned an unreadable response.",
          { cause: error },
        );
      }
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    body: parsed,
    headers: response.headers,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  ProviderTransportError,
  fetchProvider,
};
