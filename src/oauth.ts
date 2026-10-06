import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getCache } from "@vercel/functions";
import {
  YWH_APPS_API_BASE,
  expiresAtFromTokenResponse,
  refreshYesWeHackAccessToken,
  yesWeHackOAuthRedirectUri,
} from "./ywh-oauth";

function defaultIssuer() {
  const explicit = process.env.OAUTH_ISSUER?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production)
    return (
      "https://" +
      production.replace(/^https?:\/\//, "").replace(/\/$/, "")
    );
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment)
    return (
      "https://" +
      deployment.replace(/^https?:\/\//, "").replace(/\/$/, "")
    );
  return "http://localhost:3000";
}

export const OAUTH_ISSUER = defaultIssuer();
export const OAUTH_RESOURCE =
  process.env.OAUTH_RESOURCE?.trim() || OAUTH_ISSUER + "/api/mcp";
export const PROTECTED_RESOURCE_METADATA_URL =
  OAUTH_ISSUER + "/.well-known/oauth-protected-resource";
export const OAUTH_SCOPE = "yeswehack";
export const OFFLINE_SCOPE = "offline_access";

const AUTH_CODE_TTL = 5 * 60;
const UPSTREAM_STATE_TTL = 10 * 60;
const ACCESS_TOKEN_TTL = 60 * 60;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;

export type OAuthGrant = {
  token: string;
  upstreamRefreshToken?: string | null;
  upstreamExpiresAt?: number | null;
  username?: string | null;
  email?: string | null;
  clientId: string;
  resource: string;
  scope: string;
  apiBase?: string;
  authMode?: "bearer" | "legacy";
};

export type AuthorizationCodeRecord = OAuthGrant & {
  redirectUri: string;
  codeChallenge: string;
};

export type UpstreamAuthorizationRecord = {
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  codeChallenge: string;
  clientState: string;
};

type TokenKind = "code" | "access" | "refresh" | "upstream";

function oauthCache() {
  return getCache({
    namespace: "ywh-mcp-oauth",
    namespaceSeparator: ":",
  });
}

function tokenKey(kind: TokenKind, token: string) {
  const digest = createHash("sha256").update(token, "utf8").digest("hex");
  return kind + ":" + digest;
}

function opaqueToken(prefix: string) {
  return prefix + "_" + randomBytes(32).toString("base64url");
}

async function putRecord(
  kind: TokenKind,
  ttl: number,
  value: object
) {
  const token = opaqueToken(kind);
  await oauthCache().set(tokenKey(kind, token), value, {
    ttl,
    tags: ["ywh-mcp-oauth"],
    name: "yeswehack-mcp-oauth-" + kind,
  });
  return token;
}

async function getRecord<T>(kind: TokenKind, token: string): Promise<T> {
  if (!token || token.length < 20) throw new Error("Malformed OAuth token.");
  const value = (await oauthCache().get(tokenKey(kind, token))) as
    | T
    | undefined;
  if (!value)
    throw new Error("OAuth token is invalid, expired, or no longer active.");
  return value;
}

export async function createUpstreamAuthorizationState(
  input: UpstreamAuthorizationRecord
) {
  return putRecord("upstream", UPSTREAM_STATE_TTL, input);
}

export async function readUpstreamAuthorizationState(state: string) {
  return getRecord<UpstreamAuthorizationRecord>("upstream", state);
}

export async function consumeUpstreamAuthorizationState(state: string) {
  await oauthCache().delete(tokenKey("upstream", state));
}

export async function createAuthorizationCode(input: AuthorizationCodeRecord) {
  return putRecord("code", AUTH_CODE_TTL, input);
}

export async function readAuthorizationCode(code: string) {
  return getRecord<AuthorizationCodeRecord>("code", code);
}

export async function consumeAuthorizationCode(code: string) {
  await oauthCache().delete(tokenKey("code", code));
}

export function accessTokenExpiresIn(input: OAuthGrant) {
  if (!input.upstreamExpiresAt) return ACCESS_TOKEN_TTL;
  const upstreamRemaining = Math.floor(
    (input.upstreamExpiresAt - Date.now()) / 1000
  );
  return Math.max(60, Math.min(ACCESS_TOKEN_TTL, upstreamRemaining - 30));
}

export async function createAccessToken(input: OAuthGrant) {
  return putRecord("access", accessTokenExpiresIn(input), input);
}

export async function resolveAccessToken(token: string) {
  const payload = await getRecord<OAuthGrant>("access", token);
  if (payload.resource !== OAUTH_RESOURCE) {
    throw new Error("OAuth token audience does not match this MCP server.");
  }
  if (!payload.scope.split(/\s+/).includes(OAUTH_SCOPE)) {
    throw new Error("OAuth token does not include the required YesWeHack scope.");
  }
  if (
    payload.upstreamExpiresAt &&
    payload.upstreamExpiresAt <= Date.now() + 15_000
  ) {
    throw new Error(
      "The linked YesWeHack access token has expired. Refresh or reconnect the account."
    );
  }
  return {
    token: payload.token,
    apiBase: payload.apiBase || YWH_APPS_API_BASE,
    authMode: payload.authMode || ("bearer" as const),
  };
}

export async function createRefreshToken(input: OAuthGrant) {
  return putRecord("refresh", REFRESH_TOKEN_TTL, input);
}

export async function readRefreshToken(token: string) {
  return getRecord<OAuthGrant>("refresh", token);
}

export async function consumeRefreshToken(token: string) {
  await oauthCache().delete(tokenKey("refresh", token));
}

export async function refreshUpstreamGrant(
  payload: OAuthGrant
): Promise<OAuthGrant> {
  if (payload.authMode !== "bearer" || !payload.upstreamRefreshToken) {
    if (
      payload.upstreamExpiresAt &&
      payload.upstreamExpiresAt <= Date.now() + 15_000
    ) {
      throw new Error(
        "The linked YesWeHack session expired and cannot be refreshed. Reconnect the account."
      );
    }
    return payload;
  }

  const refreshed = await refreshYesWeHackAccessToken(
    payload.upstreamRefreshToken,
    yesWeHackOAuthRedirectUri(OAUTH_ISSUER)
  );

  return {
    ...payload,
    token: refreshed.access_token,
    upstreamRefreshToken:
      refreshed.refresh_token || payload.upstreamRefreshToken,
    upstreamExpiresAt: expiresAtFromTokenResponse(refreshed.expires_in),
    apiBase: YWH_APPS_API_BASE,
    authMode: "bearer",
  };
}

export function verifyPkce(verifier: string, challenge: string) {
  const computed = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  const left = Buffer.from(computed, "utf8");
  const right = Buffer.from(challenge, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeScope(scope?: string | null) {
  const requested = new Set(
    (scope || OAUTH_SCOPE)
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  requested.add(OAUTH_SCOPE);
  return [
    OAUTH_SCOPE,
    ...(requested.has(OFFLINE_SCOPE) ? [OFFLINE_SCOPE] : []),
  ].join(" ");
}

export function isAllowedClientId(clientId: string) {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com")
      return false;
    return (
      url.pathname === "/oauth/client.json" ||
      /^\/oauth\/[^/]+\/client\.json$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isAllowedRedirectUri(redirectUri: string) {
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com")
      return false;
    return (
      url.pathname === "/connector_platform_oauth_redirect" ||
      /^\/connector\/oauth\/[^/]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function protectedResourceMetadata() {
  return {
    resource: OAUTH_RESOURCE,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: [OAUTH_SCOPE, OFFLINE_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: OAUTH_ISSUER + "/",
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: OAUTH_ISSUER,
    authorization_endpoint: OAUTH_ISSUER + "/oauth/authorize",
    token_endpoint: OAUTH_ISSUER + "/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [OAUTH_SCOPE, OFFLINE_SCOPE],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: OAUTH_ISSUER + "/",
  };
}
