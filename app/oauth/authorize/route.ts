import {
  OAUTH_ISSUER,
  OAUTH_RESOURCE,
  createAuthorizationCode,
  isAllowedClientId,
  isAllowedRedirectUri,
  normalizeScope,
  verifyCredential,
} from "../../../src/oauth";
import { loginYesWeHack } from "../../../src/ywhclient";

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
  if (fields.response_type !== "code") return "Only response_type=code is supported.";
  if (!isAllowedClientId(fields.client_id)) return "Unsupported OAuth client.";
  if (!isAllowedRedirectUri(fields.redirect_uri)) return "Unsupported redirect URI.";
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

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authPage(fields: Fields, error = "") {
  const hidden = Object.entries(fields)
    .map(([key, value]) => '<input type="hidden" name="' + esc(key) + '" value="' + esc(value) + '">')
    .join("");
  const errorHtml = error
    ? '<div style="padding:12px;border:1px solid #7f1d1d;background:#2b0b0b;border-radius:10px;margin-bottom:16px;color:#fecaca">' +
      esc(error) +
      "</div>"
    : "";

  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>Connect YesWeHack</title></head>" +
      '<body style="margin:0;background:#0a0a0a;color:#f5f5f5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">' +
      '<main style="min-height:100vh;display:grid;place-items:center;padding:24px"><section style="width:min(560px,100%)">' +
      '<div style="color:#22c55e;font-weight:700;margin-bottom:12px">YESWEHACK MCP</div>' +
      '<h1 style="font-size:32px;margin:0 0 12px">Connect your YesWeHack account</h1>' +
      '<p style="color:#bdbdbd;line-height:1.6">Sign in with your normal YesWeHack hunter account. Your email/password are sent directly to YesWeHack to obtain a session token and are not stored. Only the resulting YesWeHack token is kept server-side for this OAuth grant.</p>' +
      errorHtml +
      '<form method="post" autocomplete="off">' +
      hidden +
      '<label style="display:block;margin-bottom:8px">Email</label>' +
      '<input type="email" name="email" required autofocus autocomplete="username" style="box-sizing:border-box;width:100%;padding:14px;border-radius:10px;border:1px solid #333;background:#111;color:#fff;font:inherit;margin-bottom:12px">' +
      '<label style="display:block;margin-bottom:8px">Password</label>' +
      '<input type="password" name="password" required autocomplete="current-password" style="box-sizing:border-box;width:100%;padding:14px;border-radius:10px;border:1px solid #333;background:#111;color:#fff;font:inherit;margin-bottom:12px">' +
      '<label style="display:block;margin-bottom:8px">2FA code <span style="color:#666">(if enabled)</span></label>' +
      '<input type="text" inputmode="numeric" pattern="[0-9]*" name="totp" autocomplete="one-time-code" style="box-sizing:border-box;width:100%;padding:14px;border-radius:10px;border:1px solid #333;background:#111;color:#fff;font:inherit">' +
      '<button type="submit" style="margin-top:16px;width:100%;padding:14px;border:0;border-radius:10px;background:#22c55e;color:#041008;font:inherit;font-weight:800;cursor:pointer">Verify &amp; authorize ChatGPT</button>' +
      "</form>" +
      '<p style="margin-top:18px;color:#666;font-size:13px;line-height:1.5">Your password and 2FA code are not stored. They are used only for the YesWeHack login request. ChatGPT never receives them.</p>' +
      "</section></main></body></html>",
    {
      status: error ? 401 : 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    }
  );
}

export async function GET(request: Request) {
  const fields = fieldsFromUrl(new URL(request.url));
  const error = validate(fields);
  if (error) {
    return Response.json({ error: "invalid_request", error_description: error }, { status: 400 });
  }
  return authPage(fields);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const fields: Fields = {
    response_type: String(form.get("response_type") || ""),
    client_id: String(form.get("client_id") || ""),
    redirect_uri: String(form.get("redirect_uri") || ""),
    code_challenge: String(form.get("code_challenge") || ""),
    code_challenge_method: String(form.get("code_challenge_method") || ""),
    state: String(form.get("state") || ""),
    resource: String(form.get("resource") || ""),
    scope: normalizeScope(String(form.get("scope") || "")),
  };

  const error = validate(fields);
  if (error) {
    return Response.json({ error: "invalid_request", error_description: error }, { status: 400 });
  }

  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const totp = String(form.get("totp") || "").trim();
  const directToken = String(form.get("ywh_token") || "").trim();

  if ((!email || !password) && !directToken) {
    return authPage(fields, "Enter your YesWeHack email and password.");
  }

  try {
    const login = directToken
      ? { token: directToken, ...(await verifyCredential(directToken)) }
      : await loginYesWeHack(email, password, totp || undefined);
    const code = await createAuthorizationCode({
      token: login.token,
      username: login.username,
      email: login.email,
      clientId: fields.client_id,
      redirectUri: fields.redirect_uri,
      resource: fields.resource,
      codeChallenge: fields.code_challenge,
      scope: fields.scope,
    });

    const redirect = new URL(fields.redirect_uri);
    redirect.searchParams.set("code", code);
    if (fields.state) redirect.searchParams.set("state", fields.state);
    redirect.searchParams.set("iss", OAUTH_ISSUER);
    return Response.redirect(redirect.toString(), 302);
  } catch (error: any) {
    if (error?.message === "TOTP_REQUIRED") {
      return authPage(fields, "Your YesWeHack account requires a 2FA code. Enter email, password, and the current authenticator code.");
    }
    return authPage(fields, error?.message || "YesWeHack rejected that login.");
  }
}
