import { getYesWeHackCredentials } from "./request-auth";
import { YWH_APPS_API_BASE } from "./ywh-oauth";

const LEGACY_API_BASE = "https://api.yeswehack.com";

export class YesWeHackApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "YesWeHackApiError";
    this.status = status;
    this.body = body;
  }
}

function envToken() {
  return (process.env.YWH_TOKEN || process.env.YWH_PAT || "").trim();
}

type RequestCredentials = {
  token: string;
  apiBase: string;
  authMode: "bearer" | "legacy";
};

function currentCredentials(): RequestCredentials {
  const request = getYesWeHackCredentials();
  if (request?.token?.trim()) {
    return {
      token: request.token.trim(),
      apiBase: (request.apiBase || YWH_APPS_API_BASE).replace(/\/$/, ""),
      authMode: request.authMode || "bearer",
    };
  }

  const token = envToken();
  if (!token) {
    throw new Error(
      "Missing YesWeHack authentication. Connect your YesWeHack account to continue."
    );
  }

  return {
    token,
    apiBase: LEGACY_API_BASE,
    authMode: "legacy",
  };
}

function extraAppsHeader() {
  const name = process.env.YWH_APPS_HEADER_NAME?.trim();
  const value = process.env.YWH_APPS_HEADER_VALUE?.trim();
  if (!name || !value) return {};
  if (!/^[A-Za-z0-9-]+$/.test(name)) {
    throw new Error("YWH_APPS_HEADER_NAME contains invalid HTTP header characters.");
  }
  return { [name]: value };
}

function authHeaders(
  token: string,
  mode: "bearer" | "legacy",
  apiBase: string
) {
  const clean = token.trim().replace(/^Bearer\s+/i, "");
  const headers: Record<string, string> =
    mode === "bearer"
      ? { Authorization: "Bearer " + clean }
      : clean.startsWith("eyJ") || clean.split(".").length === 3
        ? { Authorization: "Bearer " + clean }
        : { "X-AUTH-TOKEN": clean };

  if (apiBase.replace(/\/$/, "") === YWH_APPS_API_BASE) {
    Object.assign(headers, extraAppsHeader());
  }
  return headers;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest(
  method: string,
  path: string,
  options: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    token?: string;
    authenticated?: boolean;
    apiBase?: string;
    authMode?: "bearer" | "legacy";
  } = {}
): Promise<any> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    throw new Error(
      "YesWeHack API path must be a relative path beginning with '/'."
    );
  }

  let credentials: RequestCredentials | null = null;
  if (options.authenticated !== false) {
    credentials = options.token
      ? {
          token: options.token,
          apiBase: (options.apiBase || LEGACY_API_BASE).replace(/\/$/, ""),
          authMode: options.authMode || "legacy",
        }
      : currentCredentials();
  }

  const apiBase = (
    options.apiBase ||
    credentials?.apiBase ||
    LEGACY_API_BASE
  ).replace(/\/$/, "");
  const url = new URL(path, apiBase + "/");

  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (credentials) {
    Object.assign(
      headers,
      authHeaders(credentials.token, credentials.authMode, apiBase)
    );
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const body = await parseResponse(response);

  if (!response.ok) {
    const detail =
      body && typeof body === "object"
        ? body.message ||
          body.detail ||
          body.error_description ||
          body.error ||
          JSON.stringify(body)
        : String(body || response.statusText);
    throw new YesWeHackApiError(
      response.status,
      "YesWeHack API " + response.status + " for " + path + ": " + detail,
      body
    );
  }
  return body;
}

export async function verifyYesWeHackOAuthToken(token: string) {
  const user = await apiRequest("GET", "/user", {
    token,
    apiBase: YWH_APPS_API_BASE,
    authMode: "bearer",
  });
  return {
    username: user?.username || user?.name || null,
    email: user?.email || null,
  };
}

export async function verifyYesWeHackToken(token: string) {
  const user = await apiRequest("GET", "/user", {
    token,
    apiBase: LEGACY_API_BASE,
    authMode: "legacy",
  });
  return {
    username: user?.username || user?.name || null,
    email: user?.email || null,
  };
}

function responseItems(data: any) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
}

function responsePages(data: any) {
  return Number(
    data?.pagination?.nb_pages ??
      data?.nb_pages ??
      (responseItems(data).length ? 1 : 0)
  );
}

async function allPages(
  path: string,
  extra: Record<string, string | number | boolean> = {}
) {
  const items: any[] = [];
  let page = 1;
  while (true) {
    const data = await apiRequest("GET", path, {
      params: { ...extra, page, resultsPerPage: 100 },
    });
    const current = responseItems(data);
    items.push(...current);
    const pages = responsePages(data);
    if (page >= pages || current.length === 0) break;
    page += 1;
  }
  return items;
}

function isAppsOAuth() {
  const request = getYesWeHackCredentials();
  return (
    request?.authMode === "bearer" &&
    (request.apiBase || YWH_APPS_API_BASE).replace(/\/$/, "") ===
      YWH_APPS_API_BASE
  );
}

export async function getCurrentUser() {
  return apiRequest("GET", "/user");
}

export async function listPrograms(
  input: {
    all_pages?: boolean;
    page?: number;
    private_only?: boolean;
  } = {}
) {
  if (isAppsOAuth()) {
    const types = ["bug-bounty", "vdp", "pentest", "vdp-in-app"];
    const collected: any[] = [];
    for (const type of types) {
      try {
        const data = await apiRequest(
          "GET",
          "/v2/hunter/access/programs/" + type
        );
        collected.push(...responseItems(data));
      } catch (error) {
        if (
          !(error instanceof YesWeHackApiError) ||
          ![403, 404].includes(error.status)
        ) {
          throw error;
        }
      }
    }
    const unique = Array.from(
      new Map(
        collected.map((program: any) => [
          program?.slug || program?.pid || JSON.stringify(program),
          program,
        ])
      ).values()
    );
    return input.private_only
      ? unique.filter((program: any) => program?.public === false)
      : unique;
  }

  const programs =
    input.all_pages === false
      ? responseItems(
          await apiRequest("GET", "/programs", {
            params: { page: input.page || 1 },
          })
        )
      : await allPages("/programs");
  return input.private_only
    ? programs.filter((program: any) => program?.public === false)
    : programs;
}

export async function getProgram(slug: string) {
  return apiRequest("GET", "/programs/" + encodeURIComponent(slug));
}

export async function listReports(input: {
  program_slug: string;
  status?: string;
  page?: number;
  all_pages?: boolean;
}) {
  if (isAppsOAuth()) {
    const filters: Record<string, string> = {
      "filter[programSlugs][]": input.program_slug,
      "filter[sortBy]": "changedAt",
      "filter[order]": "DESC",
    };
    if (input.status) filters["filter[status][]"] = input.status;

    if (input.all_pages) {
      return allPages("/v2/hunter/reports", filters);
    }

    const data = await apiRequest("GET", "/v2/hunter/reports", {
      params: {
        ...filters,
        page: input.page || 1,
        resultsPerPage: 100,
      },
    });
    return responseItems(data);
  }

  const path =
    "/programs/" + encodeURIComponent(input.program_slug) + "/reports";
  const extra: Record<string, string> = input.status
    ? { status: input.status }
    : {};
  if (input.all_pages) return allPages(path, extra);
  const data = await apiRequest("GET", path, {
    params: { ...extra, page: input.page || 1 },
  });
  return responseItems(data).length ? responseItems(data) : data;
}

export async function getReport(reportId: number) {
  return apiRequest("GET", "/reports/" + reportId);
}

export async function listReportComments(reportId: number) {
  if (isAppsOAuth()) {
    return apiRequest("GET", "/reports/" + reportId + "/logs");
  }
  return getFallback([
    "/reports/" + reportId + "/comments",
    "/reports/" + reportId + "/messages",
    "/reports/" + reportId + "/activities",
  ]);
}

export async function listEmailAliases() {
  if (isAppsOAuth()) {
    return apiRequest("GET", "/user/email-aliases");
  }
  return getFallback([
    "/user/email-aliases",
    "/users/me/email-aliases",
    "/me/email-aliases",
    "/email-aliases",
    "/email-alias",
  ]);
}

export async function getProgramCredentials(programSlug: string) {
  const slug = encodeURIComponent(programSlug);
  if (isAppsOAuth()) {
    return apiRequest("GET", "/programs/" + slug + "/hunter/credentials");
  }
  return getFallback([
    "/programs/" + slug + "/credentials",
    "/programs/" + slug + "/credential-pools",
    "/programs/" + slug + "/credentials-pools",
    "/programs/" + slug + "/credentials/requests",
  ]);
}

async function getFallback(paths: string[]) {
  let last: unknown;
  for (const path of paths) {
    try {
      return { path, data: await apiRequest("GET", path) };
    } catch (error) {
      last = error;
      if (
        !(error instanceof YesWeHackApiError) ||
        ![403, 404].includes(error.status)
      ) {
        throw error;
      }
    }
  }
  throw last instanceof Error
    ? last
    : new Error("No YesWeHack endpoint matched.");
}

async function postFallback(
  paths: string[],
  body: Record<string, unknown>
) {
  let last: unknown;
  for (const path of paths) {
    try {
      return { path, data: await apiRequest("POST", path, { body }) };
    } catch (error) {
      last = error;
      if (
        !(error instanceof YesWeHackApiError) ||
        ![400, 403, 404, 409].includes(error.status)
      ) {
        throw error;
      }
    }
  }
  throw last instanceof Error
    ? last
    : new Error("No YesWeHack endpoint matched.");
}

export async function requestProgramCredentials(input: {
  program_slug: string;
  pool_id?: string;
  email?: string;
}) {
  if (isAppsOAuth()) {
    throw new Error(
      "The official YesWeHack API Apps documentation does not expose a verified researcher credential-request write endpoint. This MCP will not guess a mutation route."
    );
  }

  const slug = encodeURIComponent(input.program_slug);
  const id = input.pool_id ? encodeURIComponent(input.pool_id) : "";
  const paths = id
    ? [
        "/programs/" + slug + "/credentials/" + id + "/request",
        "/programs/" + slug + "/credential-pools/" + id + "/request",
        "/programs/" + slug + "/credentials-pools/" + id + "/request",
        "/programs/" + slug + "/credentials/" + id,
      ]
    : [
        "/programs/" + slug + "/credentials/request",
        "/programs/" + slug + "/credentials",
      ];
  return postFallback(paths, input.email ? { email: input.email } : {});
}

export async function yesWeHackApiGet(
  path: string,
  params: Record<string, string | number | boolean> = {}
) {
  return apiRequest("GET", path, { params });
}

export async function getHacktivity(page = 1) {
  return apiRequest("GET", "/hacktivity", {
    params: { page },
    authenticated: false,
    apiBase: LEGACY_API_BASE,
  });
}
