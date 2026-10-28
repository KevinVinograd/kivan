/**
 * Idempotency for money-moving endpoints. Records a key inside the caller's
 * transaction with ON CONFLICT DO NOTHING, returning true if it was newly
 * inserted (first time) or false on a retry — a clean no-op, no thrown error,
 * no aborted transaction. Call inside runInTx so the key commits atomically with the effect it guards.
 */
import type { Prisma } from '@hold/db';

export async function tryRecordIdempotencyKey(
  tx: Prisma.TransactionClient,
  scope: string,
  key: string,
): Promise<boolean> {
  const inserted = await tx.$executeRaw`
    INSERT INTO "IdempotencyKey" ("id", "scope", "key")
    VALUES (gen_random_uuid(), ${scope}, ${key})
    ON CONFLICT ("scope", "key") DO NOTHING`;
  return inserted === 1;
}
