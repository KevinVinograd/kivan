# @hold/db

Prisma 7 (rust-free) data layer for Hold. Owns the schema, the generated client,
the migrations and the `runInTx()` transaction helper.

```ts
import { runInTx } from '@hold/db';
const members = await runInTx((tx) => tx.teamMember.findMany());
```

## Database roles

- **Migration / owner role**: runs `pnpm prisma:deploy` (`prisma migrate deploy`)
  and owns the schema and tables.
- **Application role `hold_app`**: the role in the runtime `DATABASE_URL`.
  Provision it with `LOGIN`, `CONNECT`, `USAGE ON SCHEMA public`, and
  `SELECT/INSERT/UPDATE/DELETE` on the tables, granted after migrating
  (`scripts/dev-up.sh` does this locally).

## Prisma 7 notes

- The `prisma-client` generator emits to `src/generated/prisma` (git-ignored).
  Run `pnpm generate` after install and in CI/Docker before build.
- No `url` in `schema.prisma`; the connection lives in `prisma.config.ts`.
- The runtime client uses the `@prisma/adapter-pg` driver adapter (see
  `src/client.ts`).

## Scripts

| Script | Does |
| --- | --- |
| `pnpm generate` | generate the Prisma client |
| `pnpm prisma:migrate` | `prisma migrate dev` (local dev) |
| `pnpm prisma:deploy` | `prisma migrate deploy` (CI/prod, owner role) |
