/**
 * Centralised API client for the Vielinea Express backend.
 *
 * Every network call in the app goes through here, so auth headers, the
 * response envelope and error shaping live in exactly one place. No component
 * should call fetch() directly.
 */

const DEFAULT_BASE_URL = "http://localhost:5000/api";

/** Vite inlines import.meta.env at build time; this also works during SSR. */
const CONFIGURED_BASE_URL: string =
  (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;

/**
 * A single-process deploy (storefront and API served by one Node app, see
 * DEPLOYMENT.md) builds with VITE_API_URL=/api. The browser resolves that
 * against the page origin; SSR has no page, so it calls the API over loopback
 * on the port this same process listens on.
 */
function resolveBaseUrl(base: string): string {
  if (!base.startsWith("/") || typeof window !== "undefined") return base;
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env;
  const origin = env?.["INTERNAL_API_ORIGIN"] ?? `http://127.0.0.1:${env?.["PORT"] ?? "5000"}`;
  return `${origin.replace(/\/$/, "")}${base}`;
}

export const API_BASE_URL: string = resolveBaseUrl(CONFIGURED_BASE_URL);

const TOKEN_KEY = "v_token";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

interface ApiFailure {
  success: false;
  message: string;
  errors?: Array<{ path: string; message: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Array<{ path: string; message: string }>;

  constructor(message: string, status: number, fieldErrors: ApiFailure["errors"] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors ?? [];
  }

  /** True when the user needs to sign in (or sign in again). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

// --- token storage ---------------------------------------------------------
// The backend also sets an httpOnly cookie; this mirror lets client-side
// requests attach an Authorization header without waiting for the cookie.

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the cookie still carries auth.
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Query parameters; undefined/null/"" entries are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

interface FullResponse<T> {
  data: T;
  pagination?: PaginationMeta;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<FullResponse<T>> {
  const { method = "GET", body, params, signal } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "Could not reach the Vielinea server. Please check your connection and try again.",
      0,
    );
  }

  if (response.status === 204) return { data: undefined as T };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.ok
        ? "The server returned an unreadable response."
        : `Request failed (${response.status}).`,
      response.status,
    );
  }

  const envelope = payload as ApiSuccess<T> | ApiFailure;

  if (!response.ok || envelope.success === false) {
    const failure = envelope as ApiFailure;
    throw new ApiError(failure.message ?? "Something went wrong", response.status, failure.errors);
  }

  const success = envelope as ApiSuccess<T>;
  return success.pagination
    ? { data: success.data, pagination: success.pagination }
    : { data: success.data };
}

/** Returns just the payload. Use `apiClient.full` when pagination is needed. */
export const apiClient = {
  async get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await request<T>(path, { ...options, method: "GET" })).data;
  },
  async post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method">,
  ): Promise<T> {
    return (await request<T>(path, { ...options, method: "POST", body })).data;
  },
  async put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return (await request<T>(path, { ...options, method: "PUT", body })).data;
  },
  async patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method">,
  ): Promise<T> {
    return (await request<T>(path, { ...options, method: "PATCH", body })).data;
  },
  async delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await request<T>(path, { ...options, method: "DELETE" })).data;
  },
  /** Full envelope, including pagination metadata. */
  full: request,
};

/**
 * Human-readable message for any thrown value, for use in toasts.
 *
 * Validation failures carry a per-field `errors` array; without it the user
 * only sees "Validation failed" and has no way to know which field is wrong.
 * Those details are folded into the message here.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) {
    if (error.fieldErrors.length > 0) {
      const details = error.fieldErrors
        .map((f) => (f.path ? `${f.path}: ${f.message}` : f.message))
        .join("; ");
      return `${error.message} — ${details}`;
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
