# YesWeHack MCP Server

Unofficial ChatGPT-compatible remote MCP server for the YesWeHack bug bounty platform.

## Production transport

After deployment, use:

```text
https://YOUR-PROJECT.vercel.app/api/mcp
```

Health:

```text
https://YOUR-PROJECT.vercel.app/api/health
```

## ChatGPT / OpenAI account linking

The hosted server implements OAuth 2.1 authorization-code flow with PKCE.

Discovery endpoints:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
```

When ChatGPT connects to `/api/mcp`, authenticated YesWeHack tools advertise the `yeswehack` OAuth scope. ChatGPT opens this server's authorization page. Paste a YesWeHack Personal Access Token (recommended) or a current YesWeHack bearer token there.

The server verifies the credential directly against `https://api.yeswehack.com/user`. The YesWeHack token is stored server-side in Vercel Runtime Cache for the OAuth grant. ChatGPT receives only opaque MCP access/refresh tokens.

The implementation includes:

- Streamable HTTP MCP transport on `/api/mcp`
- OAuth 2.1 authorization-code flow
- PKCE S256
- ChatGPT client ID metadata support
- ChatGPT connector redirect URI support
- RFC 8707 resource binding
- OAuth access-token expiry
- Refresh-token rotation
- Vercel Runtime Cache for OAuth grants
- Optional `YWH_PAT` / `YWH_TOKEN` deployment credentials
- Direct `X-YWH-Token` / `X-AUTH-TOKEN` support for compatible non-ChatGPT clients

## Tools

- `get_current_user`
- `list_programs`
- `get_program`
- `list_reports`
- `get_report`
- `list_report_comments`
- `list_email_aliases`
- `get_program_credentials`
- `request_program_credentials`
- `yeswehack_api_get`
- `get_hacktivity`

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNightVibes33%2Fyeswehack-mcp&project-name=yeswehack-mcp&repository-name=yeswehack-mcp)

The app uses Next.js + `mcp-handler` and pins functions to `iad1` so the OAuth handlers and MCP transport share the same Vercel Runtime Cache region.

No YesWeHack secret belongs in GitHub.

## Optional private/single-account deployment

Instead of interactive account linking, a private deployment can set one of these encrypted Vercel environment variables:

```text
YWH_PAT=...
YWH_TOKEN=...
```

`YWH_PAT` is preferred for a long-lived YesWeHack Personal Access Token.

## Local development

```bash
npm install
npm run dev
```

For local single-account testing:

```bash
export YWH_PAT="your-token"
npm run dev
```

Then connect an MCP client to:

```text
http://localhost:3000/api/mcp
```

## Security

- YesWeHack credentials are never committed to the repository.
- OAuth authorization codes are short-lived and single-use.
- MCP access tokens and refresh tokens are opaque random values.
- Refresh tokens rotate on use.
- OAuth tokens are bound to the MCP resource and ChatGPT client ID.
- Authorization pages and token responses use `no-store`.
- The arbitrary API escape hatch is GET-only and accepts only relative YesWeHack API paths.

## Legacy

The original fork was a local Python/stdio MCP. This branch replaces that deployment path with a Vercel-first, OpenAI/ChatGPT-compatible remote MCP architecture.
