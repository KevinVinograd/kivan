import type { ReactNode } from 'react'

import { PageContent, PageHeader, Panel } from '@/app/components/templates'

function DocSection({
  n,
  eyebrow,
  title,
  children,
}: {
  n: number
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-orange-subtle type-caption fg-accent-orange">
          {n}
        </span>
        <span className="type-caption fg-accent-orange">{eyebrow}</span>
      </div>
      <h2 className="type-heading fg-default">{title}</h2>
      {children}
    </section>
  )
}

function Callout({
  tone = 'accent',
  label,
  children,
}: {
  tone?: 'accent' | 'tip'
  label?: string
  children: ReactNode
}) {
  const surface = tone === 'tip' ? 'bg-success-subtle' : 'bg-accent-orange-subtle'
  const labelColor = tone === 'tip' ? 'fg-success' : 'fg-accent-orange'
  return (
    <div className={`flex flex-col gap-1 rounded-container ${surface} px-4 py-3`}>
      <p className="type-body-2 fg-default">
        {label ? <strong className={labelColor}>{label} </strong> : null}
        {children}
      </p>
    </div>
  )
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-alpha-subtle type-caption fg-default">
            {i + 1}
          </span>
          <span className="type-body-2 fg-default">{item}</span>
        </li>
      ))}
    </ol>
  )
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-orange-emphasis" aria-hidden />
          <span className="type-body-2 fg-default">{item}</span>
        </li>
      ))}
    </ul>
  )
}

function RoleRow({ role, children }: { role: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-container bg-surface-recessed px-4 py-3">
      <h4 className="type-section fg-accent-orange">{role}</h4>
      <p className="type-body-2 fg-subtle">{children}</p>
    </div>
  )
}

export function DocsPage() {
  return (
    <>
      <PageHeader title="Guía" />
      <PageContent>
        <Panel type="medium">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="type-headline fg-default">Guía de uso</h1>
              <p className="type-body fg-subtle">
                Todo lo que se puede hacer en la app, de punta a punta: cómo entrás, cómo
                seguís tus clientes y tu equipo, cómo cerrás el mes y cómo mirás la plata.
                Corto y al grano.
              </p>
            </div>

            <Callout label="Antes de arrancar.">
              Entrás con tu email y contraseña. Lo que ves depende de tu rol: el{' '}
              <strong>Dueño</strong> y el <strong>Admin</strong> ven la operación completa y la
              plata; el <strong>Equipo</strong> ve solo su propio trabajo y sus clientes
              asignados, nunca montos. Si algo no te aparece, suele ser un tema de permisos —
              avisá.
            </Callout>

            <DocSection n={1} eyebrow="Entrar" title="Cómo entrar">
              <Steps
                items={[
                  <>
                    Abrí la dirección de la app en el navegador.
                  </>,
                  <>
                    Poné tu <strong>email</strong> y tu <strong>contraseña</strong>.
                  </>,
                  <>
                    Ya estás adentro. A la izquierda tenés el menú con los módulos; abajo del
                    todo, <strong>Guía</strong> (esta página) y <strong>Configuración</strong>.
                    Al pie está tu <strong>avatar</strong>: tocalo para abrir{' '}
                    <strong>Mi perfil</strong> o <strong>Cerrar sesión</strong>.
                  </>,
                ]}
              />
              <Callout tone="tip" label="¿Primera vez?">
                Si te dieron de alta como miembro, te llega un <strong>mail de invitación</strong>{' '}
                con un link para elegir tu contraseña. Seguí el link, poné tu clave y entrás
                normal por <span className="type-mono">/login</span>.
              </Callout>
              <Callout tone="tip" label="¿Olvidaste la clave?">
                Desde la pantalla de ingreso, tocá “¿Olvidaste tu contraseña?” y pedí el link de
                recuperación a tu correo. Y desde <strong>Configuración → Apariencia</strong>{' '}
                cambiás entre modo claro y oscuro cuando quieras.
              </Callout>
              <Callout tone="accent" label="¿Se traba la app o te aparece “Algo salió mal”?">
                Fijate si tenés alguna <strong>extensión del navegador que traduzca páginas</strong>{' '}
                activada. Al traducir, reescribe la pantalla por debajo y la app deja de responder:
                se traba, un botón queda pegado en “Guardando” o salta un cartel de error. Desactivala
                para la dirección de la app y recargá. La app está en
                español, así que no perdés nada.
              </Callout>
            </DocSection>

            <DocSection n={2} eyebrow="Inicio" title="El Dashboard">
              <p className="type-body-2 fg-default">
                Es la pantalla de inicio y cambia según tu rol: te muestra los números y
                pendientes del <strong>mes actual</strong> que te tocan a vos, con accesos
                directos a donde hay que actuar.
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Dueño</strong>: riesgo de clientes, ingresos, margen, estado de la
                    operación del mes y sobrecarga del equipo.
                  </>,
                  <>
                    <strong>Admin</strong>: el centro de control del cierre — qué falta para
                    cerrar el mes, datos, pagos y facturación.
                  </>,
                  <>
                    <strong>Equipo</strong>: tus pendientes, tus clientes, tus objetivos y tus
                    horas cargadas.
                  </>,
                ]}
              />
              <p className="type-body-2 fg-default">
                Tocá cualquier tarjeta y te lleva al módulo que la origina, ya filtrado. El
                Dashboard <strong>no se edita</strong>: es un resumen — se carga y se opera en
                cada módulo.
              </p>
            </DocSection>

            <DocSection n={3} eyebrow="Clientes" title="Cargar y seguir clientes">
              <p className="type-body-2 fg-default">
                <strong>Clientes</strong> es tu cartera: cada cliente con su estado, su abono
                mensual, si está al día con pagos y facturas, su riesgo y (para Dueño/Admin) su
                rentabilidad. Desde <strong>Nuevo cliente</strong> lo das de alta.
              </p>
              <Bullets
                items={[
                  <>
                    Registrar <strong>pagos recibidos</strong> y emitir <strong>facturas</strong>{' '}
                    (una o varias juntas).
                  </>,
                  <>
                    Cambiar el <strong>estado</strong>, cargar <strong>trabajo extra</strong>,
                    enviar el <strong>resumen de cuenta</strong> y <strong>asignar</strong>{' '}
                    personas del equipo.
                  </>,
                  <>
                    Entrar al <strong>detalle</strong> de un cliente (clic en la fila): Resumen
                    (con seguimiento y actividad), Facturación (pagos + datos + facturas) y
                    Equipo asignado.
                  </>,
                ]}
              />
              <Callout label="Si sos del Equipo.">
                Ves solo tus <strong>clientes asignados</strong>, sin montos ni rentabilidad, y
                cada fila tiene un botón <strong>Cargar</strong> para registrar tus horas,
                producción o trabajo extra sobre ese cliente.
              </Callout>
            </DocSection>

            <DocSection n={4} eyebrow="Equipo" title="Gestionar el equipo">
              <p className="type-body-2 fg-default">
                <strong>Equipo</strong> es el maestro de tu gente: la carga de trabajo del mes,
                el pago estimado y su liquidación, las asignaciones a clientes, la productividad
                y los datos personales/bancarios.
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Agregar persona</strong>, editarla o darla de baja.
                  </>,
                  <>
                    <strong>Darle acceso a la app</strong>, en el mismo momento de agregarla:
                    tildá <em>Darle acceso a la app</em> en el alta, elegí el rol (Equipo o
                    Admin) y le llega el mail solo. Si la persona ya estaba cargada, entrá a su
                    ficha → <strong>Más → Invitar a la app</strong>. No hace falta pasar por
                    Configuración ni volver a tipear su nombre y su mail.
                  </>,
                  <>
                    Cuando la persona abre ese mail elige su contraseña y{' '}
                    <strong>completa sus propios datos</strong>: teléfono y CUIT (obligatorios) y
                    sus datos bancarios (opcionales, los puede cargar después). Son justo los
                    que hacen falta para pagarle y los que antes había que pedir por WhatsApp.
                    Igual los podés cargar vos a mano desde la ficha.
                  </>,
                  <>
                    Cargar trabajo: <strong>horas</strong>, <strong>producción</strong>,{' '}
                    <strong>viáticos</strong> y <strong>trabajos extra</strong> — los cuatro
                    quedan guardados, así que siguen ahí cuando volvés. Y{' '}
                    <strong>aprobar</strong> los extras pendientes de una persona.
                  </>,
                  <>
                    Manejar el <strong>pago</strong> de cada persona: aprobar → despachar →
                    confirmar la liquidación del mes.
                  </>,
                  <>
                    <strong>Asignar</strong> a clientes y ver su carga y objetivos.
                  </>,
                ]}
              />
              <Callout label="Privacidad de la plata.">
                La pestaña Pagos, el pago estimado y los datos bancarios son solo para
                Dueño/Admin. Una persona del Equipo entra a <strong>su propio perfil</strong> y
                solo registra su propio trabajo — nunca ve montos del estudio ni de otros.
              </Callout>
            </DocSection>

            <DocSection n={5} eyebrow="El mes" title="Operación mensual (cerrar el mes)">
              <p className="type-body-2 fg-default">
                Es el <strong>corazón</strong> de la app: una sola pantalla que junta todo lo de
                un mes para poder cerrarlo. Solo Dueño/Admin. Arriba, un resumen con lo{' '}
                <strong>pendiente de cobro</strong> y la lista de alertas; abajo, dos secciones
                que abrís y cerrás:
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Clientes y cobros</strong> — lo que hay que cobrar y facturar del mes.
                  </>,
                  <>
                    <strong>Equipo y pagos</strong> — los pagos al equipo, más producciones y
                    gastos fijos (los cargás desde acá).
                  </>,
                ]}
              />
              <p className="type-body-2 fg-default">
                También te muestra el uso de los <strong>monotributos</strong> (cuánto margen de
                facturación queda) y las <strong>alertas</strong> prioritarias que hay que
                resolver antes de cerrar.
              </p>
              <Callout label="Cerrar / Reabrir el mes.">
                Cuando está todo, <strong>Cerrar mes</strong> deja el período congelado con sus
                números de cierre (rentabilidad incluida, para quien la ve). Si necesitás
                corregir algo, <strong>Reabrir mes</strong> lo vuelve a habilitar.
              </Callout>
            </DocSection>

            <DocSection n={6} eyebrow="Finanzas" title="Cobros y Pagos">
              <p className="type-body-2 fg-default">
                En el grupo <strong>Finanzas</strong> del menú tenés las dos caras de la plata,
                cada una con su período (elegís el mes arriba):
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Cobros</strong> — lo que entra: los cobros por cliente. Buscás,
                    filtrás, <strong>registrás el cobro</strong>, editás o cancelás, y arrancás la
                    factura.
                  </>,
                  <>
                    <strong>Pagos</strong> — lo que sale: a colaboradores, empleados fijos,
                    proveedores, gastos fijos, monotributos y plataformas. <strong>Aprobás</strong>
                    , <strong>registrás</strong> (marcás pagado), editás o cancelás.
                  </>,
                ]}
              />
              <Callout tone="tip" label="Tip.">
                Un cobro o un pago que creás desde <strong>Cashflow</strong> queda con el mes
                actual, así aparece acá donde corresponde. Todo se refleja solo — no hay que
                recargar.
              </Callout>

              <h3 className="type-section fg-default">Generar los cobros del mes</h3>
              <p className="type-body-2 fg-default">
                En <strong>Cobros</strong>, el botón{' '}
                <strong>Generar cobros del mes</strong> arma de una sola vez un cobro por cada
                cliente que tenga <strong>fee mensual</strong> cargado en su ficha. Antes de
                escribir nada te muestra la lista: a quién le va a cobrar, cuánto, y quiénes
                quedan afuera con el motivo. Si lo apretás dos veces no se duplica nada: los que
                ya están se saltean solos.
              </p>
              <Callout label="Clientes en dólares.">
                Si algún cliente tiene el abono en <strong>USD</strong>, el mismo diálogo te pide
                la <strong>cotización del dólar</strong> del mes. Con eso el cobro se genera{' '}
                <strong>en pesos</strong> y queda guardado a qué cotización se hizo (lo ves en el
                detalle del cobro). Mientras no la cargues, esos clientes quedan afuera y te lo
                dice por nombre. Si después cambiás la cotización, los cobros ya generados{' '}
                <strong>no se tocan</strong>.
              </Callout>

              <h3 className="type-section fg-default">Cuando el mes no es el fee de siempre</h3>
              <p className="type-body-2 fg-default">
                Generá el mes completo igual, y después abrí los dos o tres cobros que hayan
                tenido novedad:
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Trabajos extra o servicios que no se dieron</strong>: en{' '}
                    <strong>Editar cobro</strong> tenés <strong>Monto original</strong>,{' '}
                    <strong>Extras</strong> y <strong>Descuentos</strong>. El total se recalcula
                    solo (original + extras − descuentos).
                  </>,
                  <>
                    <strong>Adelanto del 50%</strong> (o cualquier pago parcial): dejá el cobro
                    por el total y en <strong>Registrar cobro</strong> poné solo el monto que
                    entró. El cobro queda con su <strong>Saldo</strong> pendiente y el resto lo
                    registrás después.
                  </>,
                ]}
              />

              <h3 className="type-section fg-default">Medio de pago y cajas de efectivo</h3>
              <p className="type-body-2 fg-default">
                Al registrar un cobro elegís el <strong>medio de pago</strong>: la cuenta a la que
                entró la plata. Esa cuenta <strong>sube su saldo</strong> en el mismo momento, y
                por eso el Cashflow queda al día sin cargar nada aparte.
              </p>
              <Callout tone="tip" label="Efectivo.">
                Las cajas de efectivo son cuentas como cualquier otra. Creá una por caja en{' '}
                <strong>Configuración → Cashflow</strong> con tipo <strong>Efectivo</strong> (por
                ejemplo &quot;Efectivo VT&quot;) y aparecen en la lista al instante, acá y en
                Pagos.
              </Callout>

              <h3 className="type-section fg-default">Cargar los costos (importante)</h3>
              <p className="type-body-2 fg-default">
                Al <strong>editar un cobro</strong> vas a ver <strong>Costos por área</strong>:
                diseño, comunicación, producción, viáticos, pauta y fijos asignados. Es lo que ese
                trabajo le costó al estudio.
              </p>
              <Callout label="Sin costos no hay rentabilidad.">
                La <strong>rentabilidad</strong> es lo facturado menos esos costos. Si no los
                cargás, el sistema no tiene con qué restar y el margen te va a dar igual a los
                ingresos — es decir, no te dice nada. Cargarlos es lo que hace que Reportes,
                Clientes y la evolución del margen digan la verdad. El total que se le factura al
                cliente <strong>no cambia</strong>: los costos son la otra cara.
              </Callout>
            </DocSection>

            <DocSection n={7} eyebrow="Facturación" title="Facturar (ARCA / monotributo)">
              <p className="type-body-2 fg-default">
                <strong>Facturación</strong> mira los mismos cobros pero desde la lente fiscal:
                el estado de cada factura, qué <strong>monotributo emisor</strong> la emite y los
                datos del comprobante.
              </p>
              <Steps
                items={[
                  <>
                    <strong>Generá</strong> la factura de un cobro, o <strong>asociá</strong> una
                    que ya emitiste por fuera.
                  </>,
                  <>
                    <strong>Enviala</strong> al cliente y, si hace falta, <strong>corregí</strong>{' '}
                    los datos fiscales.
                  </>,
                  <>
                    Mirá el uso de los <strong>tres monotributos</strong> del estudio (cuánto
                    facturó cada uno) para no pasarte del tope.
                  </>,
                ]}
              />
              <Callout label="Ojo.">
                Cobros y Facturación comparten los mismos datos: una factura que generás en un
                lado aparece en el otro. Es la misma información vista de dos maneras.
              </Callout>
            </DocSection>

            <DocSection n={8} eyebrow="Saldos" title="Cuentas corrientes">
              <p className="type-body-2 fg-default">
                El <strong>debe / haber / saldo</strong> de cada cuenta a lo largo del tiempo.
                Elegís la lente arriba: <strong>Clientes</strong>, <strong>Colaboradoras</strong>{' '}
                o <strong>Proveedores</strong>, y ves el saldo período por período.
              </p>
              <Bullets
                items={[
                  <>
                    Entrás a una cuenta y ves el <strong>resumen</strong> y el detalle de cada
                    movimiento, con su saldo acumulado.
                  </>,
                  <>
                    <strong>Exportás</strong> a CSV y podés <strong>enviar</strong> el resumen.
                  </>,
                  <>
                    Cada movimiento <strong>linkea</strong> al cobro o pago que lo originó.
                  </>,
                ]}
              />
              <Callout label="De dónde sale.">
                Cuentas corrientes no carga datos propios: se arma solo a partir de Cobros, Pagos
                y Equipo. Es una vista de <strong>saldos</strong>, de solo lectura.
              </Callout>
            </DocSection>

            <DocSection n={9} eyebrow="Tesorería" title="Cashflow (posición y proyección)">
              <p className="type-body-2 fg-default">
                <strong>Cashflow</strong> es la caja: dónde estás parado hoy y cómo venís para
                adelante. Tiene cuatro solapas:
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Posición</strong> — cuánto tenés ahora: saldos por cuenta y por moneda
                    (ARS / USD), lo pendiente, la posición neta y la reserva.
                  </>,
                  <>
                    <strong>Proyección</strong> — cuánta caja vas a tener en las próximas{' '}
                    <strong>13 semanas</strong>: apertura, cierre proyectado, la semana más baja y
                    el aviso si hay riesgo de quedarte corto.
                  </>,
                  <>
                    <strong>Conciliación</strong> — lo proyectado contra lo que realmente pasó,
                    semana por semana.
                  </>,
                  <>
                    <strong>Compromisos</strong> — el registro de gastos/ingresos futuros que
                    alimentan la proyección (los agregás, editás y borrás).
                  </>,
                ]}
              />
              <Callout tone="tip" label="Agregar rápido.">
                El botón <strong>Agregar</strong> del encabezado abre, sin salir de la pantalla,
                el alta de <strong>Compromiso</strong>, <strong>Cobro</strong>,{' '}
                <strong>Pago</strong> o <strong>Cuenta</strong>. Las cuentas existentes se
                administran desde <strong>Configuración → Cashflow</strong>.
              </Callout>
            </DocSection>

            <DocSection n={10} eyebrow="Análisis" title="Reportes">
              <p className="type-body-2 fg-default">
                <strong>Reportes</strong> es la lectura, de solo lectura: consolida los números
                del período elegido y los compara con el anterior. Solo Dueño/Admin. Solapas:
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Resumen</strong>, <strong>Productividad</strong>,{' '}
                    <strong>Rentabilidad</strong>, <strong>Carga de equipo</strong> y{' '}
                    <strong>Finanzas operativas</strong>.
                  </>,
                  <>
                    Clic en una persona, un cliente o un registro y se abre un{' '}
                    <strong>panel de detalle</strong> con su comparación contra el resto.
                  </>,
                ]}
              />
              <p className="type-body-2 fg-default">
                Reportes <strong>no modifica nada</strong> — para actuar sobre un cobro o un pago
                te manda a su módulo con el botón “Ver en Cobros / Pagos”.
              </p>
              <Callout tone="tip" label="Exportar.">
                El botón <strong>Exportar</strong> del encabezado baja a CSV la tabla de la{' '}
                <strong>pestaña que estés viendo</strong> (productividad, rentabilidad, carga o
                cobros), para abrirla en una planilla.
              </Callout>
              <Callout label="De dónde salen los números.">
                <strong>Productividad</strong> sale de las <strong>horas cargadas</strong> — si
                nadie carga horas, esa pestaña está vacía con razón.{' '}
                <strong>Rentabilidad</strong> y la evolución del margen salen de los{' '}
                <strong>costos por área</strong> que cargás en cada cobro (ver Cobros).
              </Callout>
            </DocSection>

            <DocSection n={11} eyebrow="Configuración" title="Configuración y roles">
              <p className="type-body-2 fg-default">
                En <strong>Configuración</strong> (footer) manejás el espacio de trabajo y tus
                preferencias:
              </p>
              <Bullets
                items={[
                  <>
                    <strong>Miembros y roles</strong> — los usuarios que entran a la app: les
                    cambiás el rol y los das de baja. Para <strong>invitar a alguien del
                    equipo</strong> no hace falta venir acá: se hace desde{' '}
                    <strong>Equipo</strong> (ver abajo). Este lugar es para las cuentas que{' '}
                    <em>no</em> son del equipo — un contador, un admin externo.
                  </>,
                  <>
                    <strong>Roles y permisos</strong> (solo Dueño) — creás roles a medida que{' '}
                    <strong>recortan</strong> lo que una persona ve y hace (nunca dan de más). El
                    sistema los aplica de verdad, no solo los muestra.
                  </>,
                  <>
                    <strong>Espacio de trabajo</strong> — el nombre del estudio, la zona horaria y
                    la moneda.
                  </>,
                  <>
                    <strong>Operación mensual</strong> — el día de cierre, el día de pago al
                    equipo y, sobre todo, <strong>tus categorías de gasto y tipos de
                    producción</strong>: lo que cargues acá es lo que después vas a poder elegir
                    al cargar un gasto o una producción.
                  </>,
                  <>
                    <strong>Notificaciones</strong> — qué movimientos querés que te avisen. Es{' '}
                    <strong>por persona</strong>: lo que elijas vale para vos, no para todos.
                  </>,
                  <>
                    <strong>Cashflow</strong> — administrás las cuentas de tesorería y la fecha de
                    la posición.
                  </>,
                  <>
                    <strong>Apariencia</strong> (claro/oscuro) y <strong>Mi perfil</strong>{' '}
                    (tus datos y tu contraseña) — para todos los roles.
                  </>,
                ]}
              />
              <Callout label="Transferir la propiedad.">
                El <strong>Dueño</strong> puede pasarle ese lugar a otra persona desde{' '}
                <strong>Miembros y roles</strong>. Es un cambio real y en un solo paso: el otro
                queda como Dueño y vos pasás a Admin. No hay dos dueños ni ninguno.
              </Callout>
            </DocSection>

            <DocSection n={12} eyebrow="Avisos" title="Las notificaciones de la app">
              <p className="type-body-2 fg-default">
                En <strong>Avisos</strong> (abajo en el menú) te enteramos de lo que pasó en la
                operación mientras no estabas. El numerito al lado indica cuántos no leíste.
              </p>
              <Bullets
                items={[
                  <>Se cerró el mes.</>,
                  <>Se aprobó un pago.</>,
                  <>Se marcó como enviado el estado de cuenta de un cliente.</>,
                ]}
              />
              <p className="type-body-2 fg-default">
                Marcás uno como leído, o todos de una desde el botón del encabezado.
              </p>
              <Callout label="Ojo.">
                Son avisos <strong>dentro de la app</strong> — no llegan por mail ni por WhatsApp.
                Y nunca te avisamos de algo que hiciste vos. Si no querés alguno, lo apagás en{' '}
                <strong>Configuración → Notificaciones</strong>.
              </Callout>
            </DocSection>

            <section className="flex flex-col gap-3">
              <span className="type-caption fg-accent-orange">Quién ve qué</span>
              <h2 className="type-heading fg-default">Roles</h2>
              <p className="type-body-2 fg-subtle">
                Hay tres roles base. La diferencia grande es la plata: Dueño y Admin la ven, el
                Equipo no. Encima, se pueden crear roles a medida que recortan aún más.
              </p>
              <div className="grid gap-3">
                <RoleRow role="Dueño">
                  Ve y hace todo, incluida la rentabilidad y la caja. Es el único que puede quitar
                  o dar de baja a un Admin. Manda la identidad del estudio.
                </RoleRow>
                <RoleRow role="Admin">
                  Corre la operación y el cierre del mes con la misma visibilidad de la plata que
                  el Dueño. Puede manejar al Equipo, pero no a otros Admin ni al Dueño.
                </RoleRow>
                <RoleRow role="Equipo">
                  Hace el trabajo con los clientes y carga sus propias horas. Ve solo su perfil y
                  sus clientes asignados, sin ningún monto.
                </RoleRow>
              </div>
            </section>

            <Callout label="¿Dudas?">
              Arrancá por tus clientes y tu equipo reales, y usá Operación mensual para cerrar el
              mes. Cualquier cosa que no cierre o falte, anotala y la vemos — esto está para
              ayudarte.
            </Callout>
          </div>
        </Panel>
      </PageContent>
    </>
  )
}
