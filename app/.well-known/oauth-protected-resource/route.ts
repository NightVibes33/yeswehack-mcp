import { protectedResourceMetadata } from "../../../src/oauth";

export const runtime = "nodejs";

export function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
