import type { Prisma } from './generated/prisma/client.js';
import { prisma } from './client.js';

export interface TransactionOptions {
  /** How long the transaction may run, in ms. Prisma's default is 5000. */
  timeout?: number;
  /** How long to wait for a connection before giving up, in ms. Prisma's default is 2000. */
  maxWait?: number;
}

/**
 * Run `fn` inside one interactive transaction.
 */
export async function runInTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  /**
   * Left off, Prisma's 5000 ms budget applies, which is right for a request that touches a
   * handful of rows. A BULK endpoint must pass its own: work grows with the batch while
   * the budget does not, and crossing it raises P2028 -- the whole batch discarded, and
   * (before the mapping in plugins/error-handler.ts) reported as `Internal server error`.
   * Raise it where the size of the work is known, never globally: the default is also what
   * stops one wedged request from holding a pool connection all day.
   */
  options?: TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, options);
}
