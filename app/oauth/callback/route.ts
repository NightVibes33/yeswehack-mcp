import {
  OAUTH_ISSUER,
  consumeUpstreamAuthorizationState,
  createAuthorizationCode,
  readUpstreamAuthorizationState,
} from "../../../src/oauth";
import {
  YWH_APPS_API_BASE,
  exchangeYesWeHackAuthorizationCode,
  expiresAtFromTokenResponse,
  yesWeHackOAuthRedirectUri,
} from "../../../src/ywh-oauth";
import { verifyYesWeHackOAuthToken } from "../../../src/ywhclient";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

function redirectError(
  redirectUri: string,
  clientState: string,
  error: string,
  description: string
) {
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("error", error);
  redirect.searchParams.set("error_description", description);
  if (clientState) redirect.searchParams.set("state", clientState);
  redirect.searchParams.set("iss", OAUTH_ISSUER);
  return Response.redirect(redirect.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (!state) {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Missing YesWeHack OAuth state.",
      },
      { status: 400 }
    );
  }

  let pending;
  try {
    pending = await readUpstreamAuthorizationState(state);
  } catch (error: any) {
    return Response.json(
      {
        error: "invalid_grant",
        error_description:
          error?.message || "The YesWeHack OAuth state is invalid or expired.",
      },
      { status: 400 }
    );
  }

  const upstreamError = url.searchParams.get("error");
  if (upstreamError) {
    await consumeUpstreamAuthorizationState(state);
    return redirectError(
      pending.redirectUri,
      pending.clientState,
      upstreamError,
      url.searchParams.get("error_description") ||
        "YesWeHack account authorization was not completed."
    );
  }

  const code = url.searchParams.get("code") || "";
  if (!code) {
    await consumeUpstreamAuthorizationState(state);
    return redirectError(
      pending.redirectUri,
      pending.clientState,
      "access_denied",
      "YesWeHack did not return an authorization code."
    );
  }

  try {
    const upstream = await exchangeYesWeHackAuthorizationCode(
      code,
      yesWeHackOAuthRedirectUri(OAUTH_ISSUER)
    );
    const identity = await verifyYesWeHackOAuthToken(upstream.access_token);

    const localCode = await createAuthorizationCode({
      token: upstream.access_token,
      upstreamRefreshToken: upstream.refresh_token || null,
      upstreamExpiresAt: expiresAtFromTokenResponse(upstream.expires_in),
      username: identity.username,
      email: identity.email,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      resource: pending.resource,
      codeChallenge: pending.codeChallenge,
      scope: pending.scope,
      apiBase: YWH_APPS_API_BASE,
      authMode: "bearer",
    });

    await consumeUpstreamAuthorizationState(state);

    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", localCode);
    if (pending.clientState) {
      redirect.searchParams.set("state", pending.clientState);
    }
    redirect.searchParams.set("iss", OAUTH_ISSUER);
    return Response.redirect(redirect.toString(), 302);
  } catch (error: any) {
    await consumeUpstreamAuthorizationState(state).catch(() => undefined);
    return redirectError(
      pending.redirectUri,
      pending.clientState,
      "server_error",
      error?.message || "YesWeHack account linking failed."
    );
  }
}
