import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  getCurrentUser,
  getHacktivity,
  getProgram,
  getProgramCredentials,
  getReport,
  listEmailAliases,
  listProgramCredentials,
  listPrograms,
  listReportComments,
  listReports,
  requestProgramCredentials,
  yesWeHackApiGet,
} from "../../../src/ywhclient";
import { runWithYesWeHackCredentials } from "../../../src/request-auth";
import {
  OAUTH_RESOURCE,
  PROTECTED_RESOURCE_METADATA_URL,
  resolveAccessToken,
} from "../../../src/oauth";

function authChallenge(
  error = "invalid_token",
  description = "Connect your YesWeHack account to continue."
) {
  return (
    'Bearer resource_metadata="' +
    PROTECTED_RESOURCE_METADATA_URL +
    '", scope="yeswehack", error="' +
    error.replace(/"/g, "") +
    '", error_description="' +
    description.replace(/"/g, "") +
    '"'
  );
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const authRequired =
    message.includes("Missing YesWeHack authentication") ||
    message.includes("YesWeHack API 401");

  if (authRequired) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Authentication required: connect your YesWeHack account to continue.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [authChallenge()],
      },
      isError: true,
    };
  }

  return {
    content: [{ type: "text" as const, text: "Error: " + message }],
    isError: true,
  };
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

type ToolShape = Record<string, z.ZodTypeAny>;
type InferToolShape<T extends ToolShape> = {
  [K in keyof T]: z.infer<T[K]>;
};

function registerYwhTool<T extends ToolShape>(
  server: any,
  name: string,
  description: string,
  inputSchema: T,
  handler: (params: InferToolShape<T>) => Promise<unknown>
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema: z.object(inputSchema),
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: ["yeswehack"] }],
      },
    },
    async (params: InferToolShape<T>) => {
      try {
        return textResult(await handler(params));
      } catch (error) {
        return toolError(error);
      }
    }
  );
}

const handler = createMcpHandler(
  (server) => {
    registerYwhTool(
      server,
      "get_current_user",
      "Get the connected YesWeHack researcher profile and verify the linked account.",
      {},
      async () => getCurrentUser()
    );

    registerYwhTool(
      server,
      "list_programs",
      "List YesWeHack programs available to the connected account, including private programs when the account has access.",
      {
        all_pages: z.boolean().optional().describe("Fetch every page. Defaults to true."),
        page: z.number().int().min(1).optional().describe("Page when all_pages is false."),
        private_only: z.boolean().optional().describe("Return only private/invite-only programs."),
      },
      async (params) =>
        listPrograms({
          all_pages: params.all_pages ?? true,
          page: params.page,
          private_only: params.private_only,
        })
    );

    registerYwhTool(
      server,
      "get_program",
      "Get full YesWeHack program details including scope, rewards, policy, and program metadata.",
      {
        slug: z.string().min(1).describe("YesWeHack program slug."),
      },
      async ({ slug }) => getProgram(slug)
    );

    registerYwhTool(
      server,
      "list_reports",
      "List vulnerability reports visible to the connected account for a YesWeHack program.",
      {
        program_slug: z.string().min(1).describe("YesWeHack program slug."),
        status: z.string().optional().describe("Optional report status filter."),
        page: z.number().int().min(1).optional().describe("Page number."),
        all_pages: z.boolean().optional().describe("Fetch all pages when true."),
      },
      async (params) => listReports(params)
    );

    registerYwhTool(
      server,
      "get_report",
      "Get full details of a YesWeHack vulnerability report by numeric report ID.",
      {
        report_id: z.number().int().positive().describe("Numeric YesWeHack report ID."),
      },
      async ({ report_id }) => getReport(report_id)
    );

    registerYwhTool(
      server,
      "list_report_comments",
      "List comments, messages, or activity for a YesWeHack report using the API shapes available to the connected account.",
      {
        report_id: z.number().int().positive().describe("Numeric YesWeHack report ID."),
      },
      async ({ report_id }) => listReportComments(report_id)
    );

    registerYwhTool(
      server,
      "list_email_aliases",
      "List YesWeHack email aliases available to the connected account.",
      {},
      async () => listEmailAliases()
    );

    registerYwhTool(
      server,
      "get_program_credentials",
      "List credential pools or credentials exposed by a YesWeHack program to the connected account.",
      {
        program_slug: z.string().min(1).describe("YesWeHack program slug."),
      },
      async ({ program_slug }) => getProgramCredentials(program_slug)
    );

    registerYwhTool(
      server,
      "request_program_credentials",
      "Request credentials from a YesWeHack program credential pool. This changes account/program state.",
      {
        program_slug: z.string().min(1).describe("YesWeHack program slug."),
        pool_id: z.string().optional().describe("Credential pool ID when required."),
        email: z.string().email().optional().describe("Email/alias for email-based pools."),
      },
      async (params) => requestProgramCredentials(params)
    );

    registerYwhTool(
      server,
      "yeswehack_api_get",
      "Read an authenticated YesWeHack API endpoint not yet wrapped as a first-class tool. Only relative API paths are accepted.",
      {
        path: z.string().min(1).describe("Relative YesWeHack API path beginning with '/'."),
        params_json: z
          .string()
          .optional()
          .describe("Optional JSON object containing query parameters."),
      },
      async ({ path, params_json }) => {
        let params: Record<string, string | number | boolean> = {};
        if (params_json?.trim()) {
          const parsed = JSON.parse(params_json);
          if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
            throw new Error("params_json must contain a JSON object.");
          }
          params = parsed;
        }
        return yesWeHackApiGet(path, params);
      }
    );

    server.registerTool(
      "get_hacktivity",
      {
        description: "Browse YesWeHack public Hacktivity/disclosed reports. Authentication is not required.",
        inputSchema: z.object({
          page: z.number().int().min(1).optional().describe("Hacktivity page number."),
        }),
      },
      async ({ page }: { page?: number }) => {
        try {
          return textResult(await getHacktivity(page || 1));
        } catch (error) {
          return toolError(error);
        }
      }
    );
  },
  {
    serverInfo: {
      name: "yeswehack-mcp",
      version: "1.0.0",
    },
  }
);

async function securedMcpHandler(request: Request) {
  return handler(request);
}

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 60;

function directToken(request: Request) {
  return (
    request.headers.get("x-ywh-token") ||
    request.headers.get("x-auth-token") ||
    ""
  ).trim();
}

function oauthResponse(
  error = "invalid_token",
  description = "Connect your YesWeHack account with OAuth to continue."
) {
  return new Response(
    JSON.stringify({
      error: "oauth_required",
      error_description: description,
      resource: OAUTH_RESOURCE,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "www-authenticate": authChallenge(error, description),
      },
    }
  );
}

async function securedHandler(request: Request) {
  const authorization = request.headers.get("authorization") || "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    try {
      const accessToken = authorization.slice(7).trim();
      const credentials = await resolveAccessToken(accessToken);
      return runWithYesWeHackCredentials(credentials, () =>
        securedMcpHandler(request)
      );
    } catch (error: any) {
      return oauthResponse(
        "invalid_token",
        error?.message || "The OAuth access token is invalid or expired."
      );
    }
  }

  const token = directToken(request);
  if (token) {
    return runWithYesWeHackCredentials({ token }, () =>
      securedMcpHandler(request)
    );
  }

  if (process.env.YWH_TOKEN || process.env.YWH_PAT) {
    return securedMcpHandler(request);
  }

  // Keep MCP initialize/tools/list discoverable before account linking.
  // Authenticated tool calls fail closed and return an MCP OAuth challenge.
  return securedMcpHandler(request);
}

export { securedHandler as GET, securedHandler as POST, securedHandler as DELETE };
