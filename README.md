# YesWeHack MCP Server

Unofficial ChatGPT-compatible remote MCP server for the YesWeHack bug bounty platform.

## Production

MCP: https://yeswehackmcp.vercel.app/api/mcp

Health: https://yeswehackmcp.vercel.app/api/health

## Real YesWeHack account linking

The ChatGPT connection no longer imitates a YesWeHack email/password form and does not ask the user for a password, TOTP code, passkey, PAT, or raw bearer token.

The browser flow is:

ChatGPT -> this MCP's OAuth authorize route -> official YesWeHack OAuth authorization page -> this MCP's callback -> ChatGPT OAuth callback.

YesWeHack therefore owns the actual account login ceremony, including passkeys and 2FA. The MCP acts as an OAuth broker: ChatGPT receives opaque MCP credentials while the resulting YesWeHack access/refresh credentials remain server-side in Vercel Runtime Cache.

### Required YesWeHack API App configuration

YesWeHack must enable API Apps access for the researcher account. Create a YesWeHack API App and register this redirect URI:

https://yeswehackmcp.vercel.app/oauth/callback

Configure these Vercel environment variables:

- YWH_OAUTH_CLIENT_ID
- YWH_OAUTH_CLIENT_SECRET

Optional overrides:

- YWH_OAUTH_REDIRECT_URI
- YWH_OAUTH_AUTHORIZE_URL
- YWH_OAUTH_TOKEN_URL

If YesWeHack support supplies an additional per-request header/value, configure it as:

- YWH_APPS_HEADER_NAME
- YWH_APPS_HEADER_VALUE

Do not commit any client secret or support-provided value.

Legacy YWH_PAT / YWH_TOKEN and direct X-YWH-Token / X-AUTH-TOKEN modes remain available for compatible private or non-ChatGPT clients. They are not used by normal ChatGPT account linking.

## OAuth discovery

- /.well-known/oauth-protected-resource
- /.well-known/oauth-protected-resource/api/mcp
- /.well-known/oauth-authorization-server

The implementation includes:

- Streamable HTTP MCP transport on /api/mcp
- ChatGPT-facing authorization-code flow with PKCE S256
- RFC 8707 resource binding
- Official YesWeHack authorization-code exchange
- Upstream refresh-token handling
- Short-lived, single-use state and authorization codes
- Opaque MCP access/refresh tokens
- No password/TOTP/passkey collection by this server

## Researcher API routing

For linked API App accounts the MCP uses https://apps.yeswehack.com and researcher-facing endpoints:

- current user: /user
- accessible researcher programs: /v2/hunter/access/programs/{type}
- researcher reports: /v2/hunter/reports
- report detail: /reports/{id}
- report activity/logs: /reports/{id}/logs
- email aliases: /user/email-aliases
- program credentials: /programs/{slug}/hunter/credentials

The MCP does not guess undocumented mutations. The existing credential-request helper is limited to legacy direct-token mode; API App sessions fail closed instead of posting to an invented endpoint.

## MCP tools

- get_current_user
- list_programs
- get_program
- list_reports
- get_report
- list_report_comments
- list_email_aliases
- get_program_credentials
- request_program_credentials (legacy direct-token mode only)
- yeswehack_api_get
- get_hacktivity

## ChatGPT mobile package

Register a ChatGPT App in Developer Mode with:

- Name: YesWeHack
- MCP URL: https://yeswehackmcp.vercel.app/api/mcp
- Authentication: OAuth

Then package the registered app wrapper with:

npm run package:mobile -- asdk_app_YOUR_GENERATED_ID

The mobile package keeps mcp.json and .mcp.json empty and points .app.json at the registered ChatGPT App ID, matching the working registered-App architecture.

## Local development

Install and build:

npm install
npm run build

For a private legacy-token test:

YWH_TOKEN=your-existing-token npm run dev

## Security

- Upstream YesWeHack credentials never pass through the model.
- The MCP never receives a YesWeHack password, TOTP secret/code, or passkey in the normal connection flow.
- PKCE S256 is mandatory for ChatGPT account linking.
- OAuth authorization codes are short-lived and single-use.
- Refresh tokens rotate on use.
- Grants are bound to the MCP resource.
- The arbitrary API escape hatch remains GET-only and accepts only relative API paths.
