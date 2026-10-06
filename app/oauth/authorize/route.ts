import {
  OAUTH_ISSUER,
  OAUTH_RESOURCE,
  createUpstreamAuthorizationState,
  isAllowedClientId,
  isAllowedRedirectUri,
  normalizeScope,
} from "../../../src/oauth";
import {
  buildYesWeHackAuthorizationUrl,
  isYesWeHackOAuthConfigured,
  yesWeHackOAuthRedirectUri,
} from "../../../src/ywh-oauth";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

type Fields = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  resource: string;
  scope: string;
};

function validate(fields: Fields) {
  if (fields.response_type !== "code")
    return "Only response_type=code is supported.";
  if (!isAllowedClientId(fields.client_id)) return "Unsupported OAuth client.";
  if (!isAllowedRedirectUri(fields.redirect_uri))
    return "Unsupported redirect URI.";
  if (!fields.code_challenge || fields.code_challenge_method !== "S256") {
    return "PKCE S256 is required.";
  }
  if (fields.resource !== OAUTH_RESOURCE) {
    return "OAuth resource does not match this MCP server.";
  }
  return null;
}

function fieldsFromUrl(url: URL): Fields {
  return {
    response_type: url.searchParams.get("response_type") || "",
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method: url.searchParams.get("code_challenge_method") || "",
    state: url.searchParams.get("state") || "",
    resource: url.searchParams.get("resource") || "",
    scope: normalizeScope(url.searchParams.get("scope")),
  };
}

async function authorize(fields: Fields) {
  const error = validate(fields);
  if (error) {
    return Response.json(
      { error: "invalid_request", error_description: error },
      { status: 400 }
    );
  }

  if (!isYesWeHackOAuthConfigured()) {
    return Response.json(
      {
        error: "server_configuration_error",
        error_description:
          "YesWeHack OAuth is not configured. Set YWH_OAUTH_CLIENT_ID and YWH_OAUTH_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const upstreamState = await createUpstreamAuthorizationState({
    clientId: fields.client_id,
    redirectUri: fields.redirect_uri,
    resource: fields.resource,
    scope: fields.scope,
    codeChallenge: fields.code_challenge,
    clientState: fields.state,
  });

  const redirectUri = yesWeHackOAuthRedirectUri(OAUTH_ISSUER);
  const upstream = buildYesWeHackAuthorizationUrl(
    upstreamState,
    redirectUri
  );

  return Response.redirect(upstream.toString(), 302);
}

export async function GET(request: Request) {
  return authorize(fieldsFromUrl(new URL(request.url)));
}

export async function POST(request: Request) {
  const form = await request.formData();
  return authorize({
    response_type: String(form.get("response_type") || ""),
    client_id: String(form.get("client_id") || ""),
    redirect_uri: String(form.get("redirect_uri") || ""),
    code_challenge: String(form.get("code_challenge") || ""),
    code_challenge_method: String(
      form.get("code_challenge_method") || ""
    ),
    state: String(form.get("state") || ""),
    resource: String(form.get("resource") || ""),
    scope: normalizeScope(String(form.get("scope") || "")),
  });
}
