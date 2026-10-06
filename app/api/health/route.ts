import { isYesWeHackOAuthConfigured } from "../../../src/ywh-oauth";

export const runtime = "nodejs";
export const preferredRegion = "iad1";

export function GET() {
  return Response.json({
    ok: true,
    service: "yeswehack-mcp",
    version: "1.1.0",
    yeswehack_api: "https://apps.yeswehack.com",
    deployment: {
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
      production_url: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    },
    transport: "/api/mcp",
    oauth: {
      enabled: true,
      flow: "chatgpt_pkce_brokered_to_yeswehack_authorization_code",
      upstream: "https://apps.yeswehack.com/oauth/v2/authorize",
      upstream_configured: isYesWeHackOAuthConfigured(),
      storage: "vercel-runtime-cache",
      region: "iad1",
      callback: "/oauth/callback",
      protected_resource_metadata: "/.well-known/oauth-protected-resource",
      authorization_server_metadata: "/.well-known/oauth-authorization-server",
    },
  });
}
