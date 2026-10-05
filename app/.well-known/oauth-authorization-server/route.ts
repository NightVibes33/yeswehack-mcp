import { authorizationServerMetadata } from "../../../src/oauth";

export const runtime = "nodejs";

export function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
