import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Walks up from this module until it finds the directory holding package.json.
 * This resolves to backend/ whether running from src/ via tsx or from
 * dist/src/ after a build, so .env and supabase/ are always found.
 */
function findBackendRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to the process working directory rather than guessing.
  return process.cwd();
}

const backendRoot = findBackendRoot();

loadDotenv({ path: path.join(backendRoot, ".env") });

/** Treats an empty or whitespace-only variable as "not set". */
const optionalSecret = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  /** Interface to bind. Defaults to 0.0.0.0 in production (container hosts). */
  HOST: optionalSecret,

  FRONTEND_URL: z.string().default("http://localhost:8080"),

  /**
   * Single-process deploys only (see DEPLOYMENT.md): the storefront's Nitro
   * `node-middleware` build output (frontend/.output). When set, this server
   * also serves the storefront. Unset in development, where Vite serves it.
   */
  FRONTEND_OUTPUT_DIR: optionalSecret,

  /**
   * Which card-payment adapter to use. "unconfigured" refuses card payment,
   * which is the truthful default while VIELINEA has no processor account.
   * "sandbox" is the local stand-in for development and tests and is rejected
   * in production. A real provider is added as a new value here.
   */
  PAYMENT_PROVIDER: z.enum(["unconfigured", "sandbox"]).default("unconfigured"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,

  // Discrete connection fields are preferred: they avoid percent-encoding
  // pitfalls entirely, so a password containing $ @ : / # % & just works.
  // DATABASE_URL remains supported as a fallback.
  DB_HOST: optionalSecret,
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: optionalSecret,
  DB_PASSWORD: optionalSecret,
  DB_NAME: z.string().default("postgres"),

  DATABASE_URL: optionalSecret,
  DATABASE_POOL_URL: optionalSecret,

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  DEMO_USER_EMAIL: z.string().email().default("demo@vielinea.com"),
  DEMO_USER_PASSWORD: z.string().min(6).default("123456"),
  // No defaults for the admin pair: a fallback here is a credential committed
  // to the repo, and it would ship as the live admin password on any instance
  // whose .env is incomplete. Missing values now fail validation at boot with a
  // named error instead. Both are set in .env and .env.example.
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),

  // --- Transactional email ---------------------------------------------
  // Used only for server-side notifications (currently: telling the admin a
  // new order came in). No email value is ever sent to the browser.
  //
  // The provider is chosen by presence: set EMAIL_API_KEY and Resend is used;
  // leave it unset and notifications are skipped with a log line, which keeps
  // checkout working normally on an instance with no mail account.
  EMAIL_API_KEY: optionalSecret,
  /** Verified sender. Resend's shared onboarding domain works without setup. */
  EMAIL_FROM: z.string().min(1).default("VIELINEA <onboarding@resend.dev>"),
  /** Where new-order alerts go. Falls back to ADMIN_EMAIL when unset. */
  ORDER_NOTIFICATION_EMAIL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(
    `\nInvalid backend environment configuration.\n\n${issues}\n\n` +
      `Copy backend/.env.example to backend/.env and fill in the real values,\n` +
      `or, on a hosting provider, set them in its environment settings.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Builds the connection settings from the discrete DB_* variables, falling back
 * to parsing DATABASE_URL.
 *
 * Discrete fields are preferred because a URL forces the password through
 * percent-encoding, and not every connection-string parser decodes it back —
 * a password containing `$` or `%` silently authenticates as the wrong string.
 * Passing it as a plain field removes that class of bug.
 */
function buildDbConfig(): DbConfig {
  if (raw.DB_HOST && raw.DB_USER && raw.DB_PASSWORD) {
    return {
      host: raw.DB_HOST,
      port: raw.DB_PORT,
      user: raw.DB_USER,
      password: raw.DB_PASSWORD,
      database: raw.DB_NAME,
    };
  }

  if (raw.DATABASE_URL) {
    const url = new URL(raw.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, "") || "postgres",
    };
  }

  // eslint-disable-next-line no-console
  console.error(
    "\nInvalid backend environment configuration.\n\n" +
      "  - Database connection missing: set DB_HOST, DB_USER and DB_PASSWORD\n" +
      "    (or DATABASE_URL) in backend/.env or the host's environment settings\n",
  );
  process.exit(1);
}

const dbConfig = buildDbConfig();

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === "production",
  isDevelopment: raw.NODE_ENV === "development",
  /** Origins allowed by CORS. FRONTEND_URL may be a comma-separated list. */
  allowedOrigins: raw.FRONTEND_URL.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  /** Connection settings for migrations, seeds and the runtime pool. */
  db: dbConfig,
  /** Host:port only — safe to print in logs, never includes the password. */
  dbDisplayHost: `${dbConfig.host}:${dbConfig.port}`,
  /** Recipient of new-order notifications — the override, else the admin. */
  orderNotificationEmail: raw.ORDER_NOTIFICATION_EMAIL ?? raw.ADMIN_EMAIL,
  /** True when a transactional-email provider is configured. */
  isEmailConfigured: Boolean(raw.EMAIL_API_KEY),
  backendRoot,
} as const;

export type Env = typeof env;
