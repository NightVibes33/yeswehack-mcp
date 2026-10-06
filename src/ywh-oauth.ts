export const YWH_APPS_API_BASE = "https://apps.yeswehack.com";

function requiredConfig(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      "YesWeHack OAuth is not configured: missing " + name + "."
    );
  }
  return value;
}

export function isYesWeHackOAuthConfigured() {
  return Boolean(
    process.env.YWH_OAUTH_CLIENT_ID?.trim() &&
      process.env.YWH_OAUTH_CLIENT_SECRET?.trim()
  );
}

export function yesWeHackOAuthRedirectUri(issuer: string) {
  return (
    process.env.YWH_OAUTH_REDIRECT_URI?.trim() ||
    issuer.replace(/\/$/, "") + "/oauth/callback"
  );
}

export function buildYesWeHackAuthorizationUrl(
  state: string,
  redirectUri: string
) {
  const url = new URL(
    process.env.YWH_OAUTH_AUTHORIZE_URL?.trim() ||
      "https://apps.yeswehack.com/oauth/v2/authorize"
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requiredConfig("YWH_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url;
}

type YesWeHackTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function tokenRequest(
  params: Record<string, string>
): Promise<YesWeHackTokenResponse> {
  const response = await fetch(
    process.env.YWH_OAUTH_TOKEN_URL?.trim() ||
      "https://apps.yeswehack.com/oauth/v2/token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      cache: "no-store",
    }
  );

  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const detail =
      body && typeof body === "object"
        ? body.error_description || body.message || body.error || JSON.stringify(body)
        : String(body || response.statusText);
    throw new Error(
      "YesWeHack OAuth token exchange failed (" +
        response.status +
        "): " +
        detail
    );
  }

  if (!body || typeof body.access_token !== "string") {
    throw new Error("YesWeHack OAuth did not return an access token.");
  }

  return body as YesWeHackTokenResponse;
}

export function exchangeYesWeHackAuthorizationCode(
  code: string,
  redirectUri: string
) {
  return tokenRequest({
    client_id: requiredConfig("YWH_OAUTH_CLIENT_ID"),
    client_secret: requiredConfig("YWH_OAUTH_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

export function refreshYesWeHackAccessToken(
  refreshToken: string,
  redirectUri: string
) {
  return tokenRequest({
    client_id: requiredConfig("YWH_OAUTH_CLIENT_ID"),
    client_secret: requiredConfig("YWH_OAUTH_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    redirect_uri: redirectUri,
  });
}

export function expiresAtFromTokenResponse(expiresIn?: number) {
  const seconds =
    typeof expiresIn === "number" && Number.isFinite(expiresIn)
      ? Math.max(0, expiresIn)
      : 3600;
  return Date.now() + seconds * 1000;
}
