// Prisma 7 config. In v7 the datasource url + migrations live here, not in
// schema.prisma. We avoid a `dotenv` dependency by using Node's native env-file
// loader; a missing file is fine (CI/containers inject env directly).
//
// We do NOT use the `env()` helper because it throws at config-LOAD time when
// DATABASE_URL is unset, which breaks commands that don't touch the DB
// (e.g. `prisma generate` on a fresh clone). We read it lazily-tolerantly:
// connecting commands still fail loudly against the unreachable placeholder.
import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile();
} catch {
  // No .env file — env provided by the environment. Fine.
}

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
