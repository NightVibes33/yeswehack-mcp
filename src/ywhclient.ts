import { getYesWeHackCredentials } from "./request-auth";

const API_BASE = "https://api.yeswehack.com";

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

export function currentToken() {
  const requestToken = getYesWeHackCredentials()?.token?.trim();
  const token = requestToken || envToken();
  if (!token) {
    throw new Error("Missing YesWeHack authentication. Connect your YesWeHack account to continue.");
  }
  return token;
}

function authHeaders(token: string) {
  const clean = token.trim().replace(/^Bearer\s+/i, "");
  const looksJwt = clean.startsWith("eyJ") || clean.split(".").length === 3;
  return looksJwt
    ? { Authorization: "Bearer " + clean }
    : { "X-AUTH-TOKEN": clean };
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
  } = {}
): Promise<any> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    throw new Error("YesWeHack API path must be a relative path beginning with '/'.");
  }

  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.authenticated !== false) {
    Object.assign(headers, authHeaders(options.token || currentToken()));
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const body = await parseResponse(response);

  if (!response.ok) {
    const detail =
      body && typeof body === "object"
        ? (body.message || body.detail || body.error || JSON.stringify(body))
        : String(body || response.statusText);
    throw new YesWeHackApiError(
      response.status,
      "YesWeHack API " + response.status + " for " + path + ": " + detail,
      body
    );
  }
  return body;
}

export async function verifyYesWeHackToken(token: string) {
  const user = await apiRequest("GET", "/user", { token });
  return {
    username: user?.username || user?.name || null,
    email: user?.email || null,
  };
}

async function allPages(path: string, extra: Record<string, string> = {}) {
  const items: any[] = [];
  let page = 1;
  while (true) {
    const data = await apiRequest("GET", path, { params: { ...extra, page } });
    const current = Array.isArray(data) ? data : data?.items || [];
    items.push(...current);
    const pages = Number(data?.pagination?.nb_pages || 1);
    if (page >= pages || current.length === 0) break;
    page += 1;
  }
  return items;
}

export async function getCurrentUser() {
  return apiRequest("GET", "/user");
}

export async function listPrograms(input: {
  all_pages?: boolean;
  page?: number;
  private_only?: boolean;
} = {}) {
  const programs = input.all_pages === false
    ? ((await apiRequest("GET", "/programs", { params: { page: input.page || 1 } }))?.items || [])
    : await allPages("/programs");
  return input.private_only
    ? programs.filter((p: any) => p?.public === false)
    : programs;
}

export async function getProgram(slug: string) {
  try {
    return await apiRequest("GET", "/programs/" + encodeURIComponent(slug));
  } catch (error) {
    if (!(error instanceof YesWeHackApiError) || ![403, 404].includes(error.status)) throw error;
    const programs = await allPages("/programs");
    const found = programs.find((p: any) => p?.slug === slug);
    if (!found) throw error;
    return found;
  }
}

export async function listReports(input: {
  program_slug: string;
  status?: string;
  page?: number;
  all_pages?: boolean;
}) {
  const path = "/programs/" + encodeURIComponent(input.program_slug) + "/reports";
  const extra = input.status ? { status: input.status } : {};
  if (input.all_pages) return allPages(path, extra);
  const data = await apiRequest("GET", path, {
    params: { ...extra, page: input.page || 1 },
  });
  return data?.items || data;
}

export async function getReport(reportId: number) {
  return apiRequest("GET", "/reports/" + reportId);
}

async function getFallback(paths: string[]) {
  let last: unknown;
  for (const path of paths) {
    try {
      return { path, data: await apiRequest("GET", path) };
    } catch (error) {
      last = error;
      if (!(error instanceof YesWeHackApiError) || ![403, 404].includes(error.status)) throw error;
    }
  }
  throw last instanceof Error ? last : new Error("No YesWeHack endpoint matched.");
}

async function postFallback(paths: string[], body: Record<string, unknown>) {
  let last: unknown;
  for (const path of paths) {
    try {
      return { path, data: await apiRequest("POST", path, { body }) };
    } catch (error) {
      last = error;
      if (!(error instanceof YesWeHackApiError) || ![400, 403, 404, 409].includes(error.status)) throw error;
    }
  }
  throw last instanceof Error ? last : new Error("No YesWeHack endpoint matched.");
}

export async function listReportComments(reportId: number) {
  return getFallback([
    "/reports/" + reportId + "/comments",
    "/reports/" + reportId + "/messages",
    "/reports/" + reportId + "/activities",
  ]);
}

export async function listEmailAliases() {
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
  return getFallback([
    "/programs/" + slug + "/credentials",
    "/programs/" + slug + "/credential-pools",
    "/programs/" + slug + "/credentials-pools",
    "/programs/" + slug + "/credentials/requests",
  ]);
}

export async function requestProgramCredentials(input: {
  program_slug: string;
  pool_id?: string;
  email?: string;
}) {
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
  });
}
