export const runtime = "nodejs";
export const preferredRegion = "iad1";

export function GET() {
  return Response.json({
    ok: true,
    service: "yeswehack-mcp",
    version: "1.0.0",
    yeswehack_api: "https://api.yeswehack.com",
    deployment: {
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
      production_url: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    },
    transport: "/api/mcp",
    oauth: {
      enabled: true,
      flow: "authorization_code_pkce_s256",
      storage: "vercel-runtime-cache",
      region: "iad1",
      protected_resource_metadata: "/.well-known/oauth-protected-resource",
      authorization_server_metadata: "/.well-known/oauth-authorization-server",
    },
  });
}
