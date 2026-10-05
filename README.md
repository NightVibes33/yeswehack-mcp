# YesWeHack MCP Server

Unofficial ChatGPT-compatible remote MCP server for the YesWeHack bug bounty platform.

## Production

The deployed server is:

```text
https://yeswehackmcp.vercel.app
```

MCP transport:

```text
https://yeswehackmcp.vercel.app/api/mcp
```

Health:

```text
https://yeswehackmcp.vercel.app/api/health
```

## ChatGPT / OpenAI account linking

The hosted server implements OAuth 2.1 authorization-code flow with PKCE and is designed to be registered as a ChatGPT App.

Discovery endpoints:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
```

For a normal YesWeHack hunter account, no YesWeHack Personal Access Token is required. During the connection flow, the hosted authorization page accepts the researcher's normal YesWeHack email/password and optional current 2FA/TOTP code, sends those credentials to YesWeHack's `/login` API only for the login exchange, and keeps only the resulting YesWeHack session token server-side for the OAuth grant. The password and one-time code are not stored and are not returned to ChatGPT.

ChatGPT receives opaque MCP OAuth access/refresh tokens.

The implementation includes:

- Streamable HTTP MCP transport on `/api/mcp`
- OAuth 2.1 authorization-code flow
- PKCE S256
- ChatGPT OAuth discovery metadata
- ChatGPT client ID / redirect handling
- RFC 8707 resource binding
- OAuth access-token expiry
- Refresh-token rotation
- Vercel Runtime Cache for OAuth grants
- Hunter login + optional 2FA exchange
- Optional `YWH_PAT` / `YWH_TOKEN` for private/server-managed deployments
- Direct `X-YWH-Token` / `X-AUTH-TOKEN` support for compatible non-ChatGPT clients

## Current MCP tools

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

Only API operations whose YesWeHack request shape has been verified are exposed. The server does not invent write endpoints.

## Mobile ChatGPT architecture

The mobile package intentionally follows the same architecture used by the working HackerOne mobile plugin:

```text
ChatGPT mobile plugin
        |
        v
.app.json -> registered ChatGPT App (asdk_app_...)
        |
        v
https://yeswehackmcp.vercel.app/api/mcp
        |
        v
YesWeHack API
```

The final mobile plugin **does not embed the MCP URL in `mcp.json`**. Its `mcp.json` and `.mcp.json` are empty and `.app.json` requires the registered ChatGPT App ID. This is what gives the plugin the native registered-app connection layer instead of behaving like a raw desktop MCP wrapper.

### Register the ChatGPT App

In ChatGPT Developer Mode, create an app using:

```text
Name: YesWeHack
MCP URL: https://yeswehackmcp.vercel.app/api/mcp
Authentication: OAuth
```

Scan the MCP tools, complete the YesWeHack account-link flow, then create the app. ChatGPT will generate an ID beginning with `asdk_app_`.

The raw `asdk_app_...` value is the value used inside `.app.json`. Do not put a `plugin_` prefix inside the manifest.

### Build the exact mobile wrapper

Once the registered app ID exists:

```bash
npm run package:mobile -- asdk_app_YOUR_GENERATED_ID
```

This creates:

```text
dist/yeswehack-app-mobile/
  .app.json
  .mcp.json
  mcp.json
  plugin.json
  .codex-plugin/plugin.json
  skills/yeswehack-workflow/SKILL.md
```

The package is App-SDK-only and mirrors the working HackerOne mobile wrapper layout.

A GitHub Actions workflow named **Package Mobile Plugin** is also included. Run it manually with the generated `asdk_app_...` ID to receive `yeswehack-app-mobile.zip` as an artifact.

## Local development

```bash
npm install
npm run dev
```

For a private single-account test deployment:

```bash
export YWH_TOKEN="your-existing-token"
npm run dev
```

Then connect an MCP client to:

```text
http://localhost:3000/api/mcp
```

## Security

- YesWeHack passwords and 2FA codes are not committed or persisted by the login flow.
- YesWeHack session credentials are never committed to the repository.
- OAuth authorization codes are short-lived and single-use.
- MCP access and refresh tokens are opaque random values.
- Refresh tokens rotate on use.
- OAuth grants are resource-bound.
- Authorization pages and token responses use `no-store`.
- The arbitrary API escape hatch remains GET-only and accepts only relative YesWeHack API paths.
