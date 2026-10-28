/**
 * Zod-validated environment for the backend. `loadEnv(raw)` is pure and THROWS a
 * readable, secret-free error when a required variable is missing/invalid; the
 * lazy `env` singleton triggers that validation on first access so the API
 * FAILS FAST at boot instead of crashing later on first use.
 *
 * Never read `process.env` directly elsewhere — import `env` from here so every
 * value is typed and validated. This is the ONLY module allowed to read env.
 */
import { z } from 'zod';

// Best-effort load of a local `.env` from the process cwd (e.g. apps/api/.env in
// dev). A missing file is fine — in CI/containers env is injected directly.
try {
  process.loadEnvFile();
} catch {
  // no .env file present
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Postgres connection string consumed by Prisma (@hold/db). Include
  // `?schema=` if the app uses a non-public schema.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT signing secret. Enforce a real length so a placeholder can't ship.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Max request body size in bytes (1 MiB default).
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),

  // General API rate limit.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // Tighter, dedicated rate limit for the public auth surface (login/refresh) —
  // brute-force / credential-stuffing protection, per real client IP.
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AUTH_WINDOW: z.string().default('1 minute'),

  // Exact number of proxy hops to trust when resolving the real client IP.
  // 0 = trust none (direct). Behind one Caddy hop, set to 1.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // Timeout (ms) for outbound HTTP calls.
  OUTBOUND_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

  /**
   * Maximum connections the API keeps open (node-postgres defaults to 10).
   *
   * Logging in fires ~20 concurrent GETs in one burst, so a cap much lower than this makes
   * requests queue past Prisma's 2000 ms `maxWait` and answer 503. If the database is shared
   * with other apps, keep this below the role's / server's connection limit.
   */
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(12),

  /**
   * How long a request may wait for a free connection before failing (ms).
   *
   * node-postgres waits FOREVER by default. Under a starved pool that turns a fast, legible
   * "the database is busy" into a pile of requests hanging until something else times out,
   * which is the shape the incident took: the readiness check itself blocked. A bounded wait
   * fails a request in seconds and lets the health check answer honestly.
   */
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

  /**
   * How long an idle connection stays open before the pool closes it (ms).
   *
   * node-postgres closes it after 10 SECONDS. When the database is far from the API (another
   * region), opening a connection costs hundreds of ms, so that default makes the pool go
   * cold between clicks.
   *
   * With the driver default the pool goes cold between clicks (measured: it survives 8 s of
   * idle and is gone by 12), so a user browsing the app pays that ~800 ms again and again.
   * `/health/ready`, which is one `SELECT 1`, took ~800 ms on 92% of its calls.
   *
   * Five minutes keeps a working session warm and still lets the connections go when the
   * app is genuinely idle, which is what stops it from holding slots on a shared instance
   * all night. Note this is deliberately NOT `min > 0`: pinning connections open forever is
   * the opposite of what `DB_POOL_MAX` exists to do.
   *
   * The half-hour ceiling enforces that last sentence. `positive()` alone rejects 0 — which
   * in node-postgres means "never close an idle connection" — but would happily accept a
   * mistyped 3_000_000, which reaches the same never-close outcome by a longer road. A bound
   * that only catches one of the two spellings of the same mistake is not a bound.
   */
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().max(1_800_000).default(300_000),

  // Refresh-token lifetime (days).
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Access-token lifetime (string accepted by @fastify/jwt, e.g. "15m").
  ACCESS_TTL: z.string().default('15m'),

  // ── Transactional mail (member invitations / set-password) ──
  // OFF by default: with MAIL_ENABLED=false the invite flow still works — the
  // one-time set-password link is returned to the admin on-screen to pass along
  // by hand (how it worked before mail existed). Turning it ON emails the link.
  MAIL_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Envelope sender — must be an address your SMTP provider is allowed to send from.
  MAIL_FROM: z.string().default('no-reply@example.com'),
  MAIL_FROM_NAME: z.string().default('Kivan'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // STARTTLS on 587 (false) vs implicit TLS on 465 (true).
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Public base URL of the web app — used to build the set-password link.
  APP_URL: z.string().default('http://localhost:5173'),
  // Invitation / set-password link lifetime (hours).
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parse + validate an env bag. Throws a readable, secret-free Error on failure. */
export function loadEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Memoized validated env. First access validates `process.env` (fail-fast). */
export function getEnv(): Env {
  return (cached ??= loadEnv(process.env));
}

/**
 * Ergonomic validated-env accessor. Lazy: importing this module does not
 * validate; the FIRST property read does (so the API fails fast at boot while
 * tests can import `loadEnv` without a fully-populated environment).
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
