import { ApiError } from '@/api/client'

export interface GenerationFailure {
  title: string
  description: string
  nothingWritten: boolean
}

const ROLLED_BACK = new Set([400, 401, 403, 404, 409, 413, 422, 429])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOurRolledBackTimeout(error: ApiError): boolean {
  return ourEnvelopeCode(error) === 'TIMEOUT'
}

function isOurDatabaseUnavailable(error: ApiError): boolean {
  return ourEnvelopeCode(error) === 'UNAVAILABLE'
}

function ourEnvelopeCode(error: ApiError): string | null {
  if (error.status !== 503) return null
  const body = error.body
  if (!isRecord(body) || !isRecord(body.error)) return null
  return typeof body.error.code === 'string' ? body.error.code : null
}

function detail(error: ApiError): string {
  return `Detalle: ${error.message} (HTTP ${error.status})`
}

export function failureFor(error: unknown): GenerationFailure {
  if (!(error instanceof ApiError)) {
    return {
      title: 'Los cobros pueden haberse generado',
      description:
        'El servidor respondió y algo falló después, al mostrar el resultado. Recargá la página y fijate si están antes de volver a intentar',
      nothingWritten: false,
    }
  }

  if (isOurRolledBackTimeout(error)) {
    return {
      title: 'El servidor no llegó a terminar a tiempo',
      description: `No se generó ningún cobro. Probá de nuevo, o generá el mes en dos tandas. ${detail(error)}`,
      nothingWritten: true,
    }
  }

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
