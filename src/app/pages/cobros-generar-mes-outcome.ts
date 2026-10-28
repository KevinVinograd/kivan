import { ApiError } from '@/api/client'

/**
 * What the operator is told when a generation run does not come back clean.
 *
 * Two fields because an error toast owes two different things: WHAT happened, and what to
 * do next (, §6.3). A bare "No se pudieron generar los cobros" is
 * neither, and it is what shipped.
 */
export interface GenerationFailure {
  title: string
  description: string
  /**
   * True ONLY when the batch is proven not to have been written. It is what licenses the
   * phrase "no se generó ningún cobro", and it is also what re-arms the dialog's button:
   * inviting a retry is honest exactly when a retry is known to be safe.
   */
  nothingWritten: boolean
}

/**
 * The statuses that PROVE the batch did not land.
 *
 * Each one is a typed `AppError` (or a Zod rejection) raised by the route or the service
 * before or inside the transaction, so the response is built along a path where Postgres has
 * already rolled the transaction back. None of them can be produced after a commit.
 *
 * 500 is deliberately NOT here, and the omission is the whole point. It is the error
 * handler's CATCH-ALL, reached precisely when the server does not know what happened: a
 * `reply.send()` that throws fires after the transaction already committed, and a failure at
 * COMMIT time is indeterminate by nature. Reading a 500 as "nothing was written" is the
 * same unearned claim this module exists to refuse, so it takes the same answer as a
 * gateway status (502/503/504), which is written by whatever sits in FRONT of the API and
 * cannot know whether the request behind it completed either.
 *
 * The exceptions are the two 503s carrying this API's OWN envelope, handled below by
 * `isOurRolledBackTimeout` (`TIMEOUT`: the transaction expired before COMMIT) and
 * `isOurDatabaseUnavailable` (`UNAVAILABLE`: the transaction never started, because the
 * database could not be used). In both the rollback is proven rather than assumed. They are
 * kept out of this set on purpose, because membership here is decided by status alone and
 * those 503s have to be told apart from a proxy's.
 */
const ROLLED_BACK = new Set([400, 401, 403, 404, 409, 413, 422, 429])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A 503 this API minted itself, for a transaction that STARTED and then expired.
 *
 * The status alone cannot say this: 502/503/504 are the statuses a proxy writes when it
 * knows nothing about what happened behind it, and reading one of those as a rollback is
 * the unearned claim this module exists to refuse. The ENVELOPE is what separates them.
 * Only the API produces `{ error: { code, message } }`, and only it uses `TIMEOUT` -- for
 * Prisma's P2028 and P2024, where the COMMIT provably never ran (apps/api/src/plugins/
 * error-handler.ts). A gateway's 503 carries an HTML page or nothing at all, so it falls
 * through to the honest "we cannot tell" below.
 */
function isOurRolledBackTimeout(error: ApiError): boolean {
  return ourEnvelopeCode(error) === 'TIMEOUT'
}

/**
 * The other 503 this API mints, for a database it could not use at all.
 *
 * Same reasoning as the timeout above and a different cause: the transaction never STARTED,
 * because the connection could not be acquired or the server was unreachable. It arrived on
 * 2026-09-04, when the shared cluster ran out of connection slots. Kept apart from `TIMEOUT`
 * on purpose -- both prove the rollback, but the action they point to is not the same. A
 * timeout says "the work was too big for one transaction, split it"; this one says "the
 * database was saturated, it clears by itself, press again in a moment". Telling an operator
 * to split a batch that failed for lack of a connection sends them to do work that changes
 * nothing.
 */
function isOurDatabaseUnavailable(error: ApiError): boolean {
  return ourEnvelopeCode(error) === 'UNAVAILABLE'
}

/**
 * The code inside a 503 that carries THIS API's envelope, or null for anyone else's.
 *
 * A gateway's 503 carries an HTML page or nothing at all, and reading one of those as a
 * rollback is the unearned claim this module refuses. Only the API produces
 * `{ error: { code, message } }`.
 */
function ourEnvelopeCode(error: ApiError): string | null {
  if (error.status !== 503) return null
  const body = error.body
  if (!isRecord(body) || !isRecord(body.error)) return null
  return typeof body.error.code === 'string' ? body.error.code : null
}

/** The server's own words, plus the code, so a production failure can be read off a screenshot. */
function detail(error: ApiError): string {
  return `Detalle: ${error.message} (HTTP ${error.status})`
}

/**
 * Turn whatever `onGenerate` threw into something an operator can act on.
 *
 * WHY THIS EXISTS. The dialog used to catch this with a bare `catch {`, discarding an
 * `ApiError` that carries the HTTP status AND the server's message, and rendering one flat
 * sentence for every cause. A rejected payload, an expired session, a missing permission, a
 * conflict, a rate limit, a 500 and a dropped connection were indistinguishable — to the
 * operator on the screen and to whoever they reported it to. A production failure of a bulk
 * money action then had no evidence attached to it at all.
 *
 * THE SECOND JOB is the one that is easy to miss: not every failure means nothing was
 * written. The run reaches this function through three different doors, and only one of them
 * proves the batch did not land:
 *
 *   1. An `ApiError` this API minted itself  → the transaction rolled back. Nothing was
 *      created, and the operator can safely fix the cause and press the button again.
 *      Usually recognised by its status (`ROLLED_BACK`); for the timeout, whose status a
 *      proxy also writes, by its envelope (`isOurRolledBackTimeout`).
 *   2. An `ApiError` with status 0, or a gateway status → the request may have been served
 *      and lost on the way back. We do not know, so we do not claim.
 *   3. Anything else → the server already ANSWERED (the throw is from our own code after
 *      the response), so the cobros most likely exist. Telling the operator they do not is
 *      the mirror of the phantom-write bug the convention exists to prevent, and it costs
 *      more: they press "Generar" again on a month that is already billed.
 *
 * Doors 2 and 3 both end at "recargá y fijate", because that is the only honest instruction
 * when the app cannot tell whether a write landed.
 */
export function failureFor(error: unknown): GenerationFailure {
  if (!(error instanceof ApiError)) {
    return {
      title: 'Los cobros pueden haberse generado',
      description:
        'El servidor respondió y algo falló después, al mostrar el resultado. Recargá la página y fijate si están antes de volver a intentar',
      nothingWritten: false,
    }
  }

  // Checked before the status band, because it is the one 503 that proves what a 503
  // normally cannot. The action it names is the real workaround: the run is idempotent, so
  // a second press bills nobody twice, and splitting the roster halves the work per
  // transaction.
  if (isOurRolledBackTimeout(error)) {
    return {
      title: 'El servidor no llegó a terminar a tiempo',
      description: `No se generó ningún cobro. Probá de nuevo, o generá el mes en dos tandas. ${detail(error)}`,
      nothingWritten: true,
    }
  }

  // The other 503 this API mints: the database could not be used, so the transaction never
  // started. It clears on its own, which is why the instruction is to wait and retry rather
  // than to split the month -- splitting changes nothing when the problem is a connection.
  if (isOurDatabaseUnavailable(error)) {
    return {
      title: 'La base de datos estaba sobrecargada',
      description: `No se generó ningún cobro. Esperá unos segundos y probá de nuevo. ${detail(error)}`,
      nothingWritten: true,
    }
  }

  if (!ROLLED_BACK.has(error.status)) {
    return error.status === 500
      ? {
          title: 'El servidor no pudo generar los cobros',
          description: `No podemos saber si alguno quedó creado. Recargá la página y fijate antes de volver a intentar. ${detail(error)}`,
          nothingWritten: false,
        }
      : {
          title: 'No sabemos si los cobros se generaron',
          description: `Recargá la página y fijate si están antes de volver a intentar. ${detail(error)}`,
          nothingWritten: false,
        }
  }

  // From here the batch did NOT land, so every message can say so and point somewhere.
  switch (error.status) {
    case 401:
      return {
        title: 'Tu sesión venció',
        description: 'No se generó ningún cobro. Volvé a iniciar sesión y probá de nuevo',
        nothingWritten: true,
      }
    case 403:
      return {
        title: 'No tenés permiso para generar los cobros',
        description: 'No se generó ningún cobro. Pedile a un dueño que lo genere o que te habilite el permiso',
        nothingWritten: true,
      }
    case 429:
      return {
        title: 'Demasiadas peticiones seguidas',
        description: 'No se generó ningún cobro. Esperá un momento y volvé a intentar',
        nothingWritten: true,
      }
    case 409:
      return {
        title: 'Los cobros chocan con algo ya cargado',
        description: `No se generó ningún cobro. Revisá el mes y volvé a intentar. ${detail(error)}`,
        nothingWritten: true,
      }
    case 404:
      return {
        title: 'Un cliente del lote ya no está',
        description: `No se generó ningún cobro. Recargá la lista y volvé a intentar. ${detail(error)}`,
        nothingWritten: true,
      }
    default:
      return {
        title: 'El servidor rechazó el pedido',
        description: `No se generó ningún cobro. ${detail(error)}`,
        nothingWritten: true,
      }
  }
}
