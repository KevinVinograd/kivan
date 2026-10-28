/**
 * Append-only audit trail writer. Call inside the operation's transaction
 * (runInTx) so the audit row commits atomically with the change it records.
 */
import type { Prisma } from '@hold/db';

interface AuditArgs {
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

export async function appendAudit(
  tx: Prisma.TransactionClient,
  actorUserId: string | null,
  e: AuditArgs,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorUserId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      ...(e.before !== undefined ? { before: e.before as Prisma.InputJsonValue } : {}),
      ...(e.after !== undefined ? { after: e.after as Prisma.InputJsonValue } : {}),
    },
  });
}
