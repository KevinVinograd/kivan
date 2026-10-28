/**
 * Single shared PrismaClient instance.
 *
 * Prisma 7 (rust-free) requires a DRIVER ADAPTER instead of an embedded query
 * engine — there is no `datasourceUrl` option anymore. We use
 * `@prisma/adapter-pg` (bundles node-postgres) fed the validated DATABASE_URL.
 *
 * The client is generated into `src/generated/prisma` (see schema.prisma
 * `output`), NOT node_modules — so we import it from the generated path.
 *
 * This is an EAGER singleton bound to `env.DATABASE_URL` at import time. Tests
 * that need a different connection must set `process.env.DATABASE_URL` BEFORE
 * importing this module.
 */
import { env } from '@hold/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

/**
 * Target Postgres schema, taken from the `?schema=` param of DATABASE_URL.
 * node-postgres ignores that param, so we must hand it to the adapter explicitly
 * — otherwise Prisma schema-qualifies every query with `public` (regardless of
 * the connection's search_path) and misses a project-scoped schema like `hold`.
 * Absent (dev/test on `public`) → undefined → adapter default.
 */
function schemaFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('schema') ?? undefined;
  } catch {
    return undefined;
  }
}

const schema = schemaFromUrl(env.DATABASE_URL);
/**
 * Every pool number here is DECLARED, because each default this app inherited was wrong for
 * it in a different way. See `@hold/config` for the measurement behind each one.
 *
 * `max` and `connectionTimeoutMillis` were unset, which is not the same as unlimited: it
 * meant node-postgres' own defaults, max 10 and an unbounded wait.
 *
 * `idleTimeoutMillis` is the one that costs the most here and is the least obvious. The
 * driver closes an idle connection after 10 s, which is fine when the database is next door
 * — and not when it is in another region, where a
 * fresh connection costs ~800 ms, and at the driver default the pool goes cold between one
 * click and the next. Five minutes keeps a working session warm without pinning connections
 * open all night on a shared instance.
 *
 * `keepAlive` goes with it: a connection held open for minutes crosses NAT and idle-timeout
 * middleboxes that silently drop quiet TCP sessions. Without it a longer idle timeout can
 * hand out a socket that looks open and is already dead.
 *
 * `keepAliveInitialDelayMillis` is NOT optional decoration, and leaving it out is the trap.
 * node-postgres defaults it to 0, which node passes to `setKeepAlive(true, 0)` meaning "use
 * the system default" — and on this box that is `tcp_keepalive_time` = 7200 s. The first
 * probe would go out two HOURS after the connection went quiet, while the pool closes it at
 * five minutes: `keepAlive: true` alone never sends a single probe inside the window it was
 * added to protect. 60 s sits well under the idle timeout, so the path stays warm for a few
 * bytes a minute.
 */
const adapter = new PrismaPg(
  {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
  },
  schema ? { schema } : undefined,
);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export { Prisma } from './generated/prisma/client.js';
export type { PrismaClient };
