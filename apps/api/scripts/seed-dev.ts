/**
 * Dev seed — creates the studio settings row + an owner user so you can log in
 * locally. Connects as the privileged (owner) role. Idempotent (won't duplicate
 * the settings row or the user).
 *
 * Run:  SEED_DATABASE_URL=postgresql://owner:owner@localhost:5477/hold \
 *       pnpm --filter api exec tsx scripts/seed-dev.ts
 */
import { Client } from 'pg';
import { hashPassword } from '../src/lib/password.js';

const url = process.env.SEED_DATABASE_URL;
if (!url) {
  console.error('SEED_DATABASE_URL is required (the owner/superuser connection)');
  process.exit(1);
}
const email = process.env.SEED_EMAIL ?? 'owner@studio.test';
const password = process.env.SEED_PASSWORD ?? 'owner1234';
const workspaceName = process.env.SEED_WORKSPACE ?? 'Studio Hakuna';

const client = new Client({ connectionString: url });
await client.connect();

const existing = await client.query('SELECT id FROM "Workspace" LIMIT 1');
if (existing.rowCount === 0) {
  await client.query('INSERT INTO "Workspace" (id, name) VALUES (gen_random_uuid(), $1)', [
    workspaceName,
  ]);
}

const passwordHash = await hashPassword(password);
await client.query(
  `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
   VALUES (gen_random_uuid(), $1, $2, 'Vicky', 'Owner', 'owner', now())
   ON CONFLICT (email) DO NOTHING`,
  [email, passwordHash],
);

console.log(`✓ Seeded owner user: ${email} / ${password}  (workspace: ${workspaceName})`);
await client.end();
