import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { cn } from '@/app/lib/utils'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { AFFORDANCE, ICON, type Icon } from '@/app/lib/icon-registry'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Progress,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@/app/components/components'
import { AiInsight } from '@/app/components/patterns'
import { SectionHeader, PanelContent } from '@/app/components/templates'
import type { Client } from './clients-mock-data'
import { ClientServiceLines } from './clients-service-lines'
import {
  BILLING_ENTITY_FULL_LABEL,
  CLIENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  formatDiscountPercent,
  NO_ACTION,
  NO_REGISTRO,
  PROFITABILITY_LABEL,
  clientActivityFeed,
  clientGrowth,
  clientInsightDisplay,
  clientInvoices,
  clientLtv,
  clientPayments,
  clientStatusBadge,
  clientTenure,
  formatCurrency,
  formatDateTime,
  formatMonthYear,
  formatRelativeDate,
  initials,
  invoiceBadge,
  paymentDisplay,
  profitabilityStatusOf,
  type ActivityKind,
  type ClientInsightActionKind,
  type InvoiceRecord,
  type PaymentRecord,
} from './clients-format'
import { PreviewSurface, PreviewInfoRow } from './clients-preview'
import { ProfitabilityGauge } from './clients-gauge'
import { ClientKpis } from './clients-kpis'
import { ClientTeamInlineList, TeamMemberHoverCard, TeamMemberInline } from './clients-team-preview'
import { useTeamData } from './team-data'
import { ClientTeamDialogs, type ClientTeamDialogState } from './clients-team-dialogs'
import mpLogo from './mercado-pago.svg'
import { LogProductionItem } from './log-production-item'
import { ClientProductionsModule } from './client-productions-module'
import { ClientServiceBadges } from './client-service-badges'
import { ClientVariableTeamCard } from './client-variable-team'

const NO_VALUE = '-'

export type ClientDetailProps = {
  client: Client | null
  onClose: () => void
  onEdit: (client: Client) => void
  onRegisterPayment: (client: Client) => void
  onIssueInvoice: (client: Client) => void
  onWhatsAppClient: (client: Client) => void
  onContactClient: (client: Client) => void
  onChurn: (client: Client) => void
  onReviewProfitability: (client: Client) => void
  onContractChange?: () => void
}

function LeadingIcon({ icon: Icon }: { icon: Icon }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-subtle">
      <Icon className="size-3.5" aria-hidden />
    </span>
  )
}

const PAYMENT_ICON: Record<string, Icon> = {
  Efectivo: ICON.payment,
  Cheque: ICON.cheque,
  Transferencia: ICON.transfer,
}

function PaymentLeading({ method }: { method: string }) {
  if (method === 'Mercado Pago') {
    return <img src={mpLogo} alt="" aria-hidden className="size-6 shrink-0 rounded-full border border-alpha-subtle" />
  }
  return <LeadingIcon icon={PAYMENT_ICON[method] ?? ICON.transfer} />
}

const ACTIVITY_ICON: Record<ActivityKind, Icon> = {
  payment: ICON.payment,
  meeting: ICON.meeting,
  feedback: ICON.feedback,
  increase: ICON.increase,
  created: ICON.clientCreated,
  delivery: ICON.clientCreated,
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="type-body-2 fg-subtle">{label}</span>
      <span className="type-body-2 text-right fg-default">{value}</span>
    </div>
  )
}

function QuickActions({
  client,
  onEdit,
  onRegisterPayment,
  onIssueInvoice,
  onLogHours,
  onLogProduction,
  onAssign,
  onWhatsAppClient,
  onContactClient,
  onChurn,
}: {
  client: Client
  onEdit: (client: Client) => void
  onRegisterPayment: (client: Client) => void
  onIssueInvoice: (client: Client) => void
  onLogHours: () => void
  onLogProduction: () => void
  onAssign: () => void
  onWhatsAppClient: (client: Client) => void
  onContactClient: (client: Client) => void
  onChurn: (client: Client) => void
}) {
  return (
    <>
      <Button variant="solid" color="primary" size="dense" onClick={() => onRegisterPayment(client)}>
        Registrar pago
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="outlined" color="primary" size="dense" aria-label="Más acciones">
            <AFFORDANCE.overflow className="size-4" aria-hidden />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onIssueInvoice(client)}>
            <ICON.invoice aria-hidden />
            Emitir factura
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLogHours}>
            <ICON.logHours aria-hidden />
            Cargar horas
          </DropdownMenuItem>
          <LogProductionItem onSelect={onLogProduction} />
          <DropdownMenuItem onSelect={onAssign}>
            <ICON.assignPerson aria-hidden />
            Asignar persona
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(client)}>
            <ICON.edit aria-hidden />
            Editar cliente
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onWhatsAppClient(client)}>
            <ICON.whatsapp aria-hidden />
            Enviar WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onContactClient(client)}>
            <ICON.email aria-hidden />
            Enviar mail
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onChurn(client)}>
            <ICON.churn aria-hidden />
            Deshabilitar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function HeroAction({
  icon: ActionIcon,
  label,
  ariaLabel,
  onClick,
}: {
  icon: Icon
  label: string
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <IconButton variant="outlined" color="primary" size="dense" aria-label={ariaLabel} onClick={onClick}>
        <ActionIcon className="size-4" aria-hidden />
      </IconButton>
      <span className="type-body-2 fg-default">{label}</span>
    </div>
  )
}

function HeroActions({
  client,
  onEdit,
  onRegisterPayment,
  onIssueInvoice,
  onLogHours,
  onLogProduction,
  onAssign,
  onWhatsAppClient,
  onContactClient,
  onChurn,
}: {
  client: Client
  onEdit: (client: Client) => void
  onRegisterPayment: (client: Client) => void
  onIssueInvoice: (client: Client) => void
  onLogHours: () => void
  onLogProduction: () => void
  onAssign: () => void
  onWhatsAppClient: (client: Client) => void
  onContactClient: (client: Client) => void
  onChurn: (client: Client) => void
}) {
  return (
    <>
      <HeroAction icon={ICON.payment} label="Pago" ariaLabel="Registrar pago" onClick={() => onRegisterPayment(client)} />
      <HeroAction icon={ICON.invoice} label="Factura" ariaLabel="Emitir factura" onClick={() => onIssueInvoice(client)} />
      <div className="flex flex-col items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outlined" color="primary" size="dense" aria-label="Cargar">
              <ICON.logWork className="size-4" aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={onLogHours}>
              <ICON.logHours aria-hidden />
              Cargar horas
            </DropdownMenuItem>
            <LogProductionItem onSelect={onLogProduction} />
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="type-body-2 fg-default">Cargar</span>
      </div>
      <HeroAction icon={ICON.assignPerson} label="Asignar" ariaLabel="Asignar persona" onClick={onAssign} />
      <div className="flex flex-col items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outlined" color="primary" size="dense" aria-label="Más acciones">
              <AFFORDANCE.overflow className="size-4" aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={() => onEdit(client)}>
              <ICON.edit aria-hidden />
              Editar cliente
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onWhatsAppClient(client)}>
              <ICON.whatsapp aria-hidden />
              Enviar WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onContactClient(client)}>
              <ICON.email aria-hidden />
              Enviar mail
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChurn(client)}>
              <ICON.churn aria-hidden />
              Deshabilitar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="type-body-2 fg-default">Más</span>
      </div>
    </>
  )
}

const recordLinkClass =
  'self-start rounded-control type-body-2 tabular-nums fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus'

function InvoicePreviewContent({ invoice }: { invoice: InvoiceRecord }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const badge = invoiceBadge(invoice.status)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate type-heading fg-default tabular-nums">{invoice.number}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <Separator />
      <div className="flex flex-col gap-2">
        <PreviewInfoRow icon={ICON.invoice}>
          Emitida por {BILLING_ENTITY_FULL_LABEL[invoice.billingEntity]}
        </PreviewInfoRow>
        <PreviewInfoRow icon={ICON.duration}>{formatDateTime(invoice.iso)}</PreviewInfoRow>
      </div>
      {invoice.receivableId && invoice.period ? (
        <Button
          variant="outlined"
          color="primary"
          size="dense"
          onClick={() =>
            navigate(
              buildTrailHref(
                `/cobros?open=${invoice.receivableId}&period=${invoice.period}`,
                { label: 'Clientes', to: '/clients' },
                searchParams,
              ),
            )
          }
        >
          Ver detalle
        </Button>
      ) : null}
    </div>
  )
}

function RecordPreview({ label, content }: { label: string; content: ReactNode }) {
  return (
    <PreviewSurface
      title={label}
      trigger={
        <button type="button" className={recordLinkClass}>
          {label}
        </button>
      }
      content={content}
    />
  )
}

function downloadRecord(ref: string): void {
  toast(`La descarga de ${ref} estará disponible al conectar el backend.`)
}

function InvoicesCard({ client }: { client: Client }) {
  const invoices = clientInvoices(client)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Últimas facturas</h3>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {invoices.length > 0 ? (
            invoices.map((invoice) => {
              const badge = invoiceBadge(invoice.status)
              return (
                <div key={invoice.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <LeadingIcon icon={ICON.invoice} />
                    <div className="flex min-w-0 flex-col">
                      <RecordPreview
                        label={invoice.number}
                        content={<InvoicePreviewContent invoice={invoice} />}
                      />
                      <span className="type-caption fg-subtle">{formatMonthYear(invoice.iso)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <span className="type-body-2 fg-default tabular-nums">{formatCurrency(invoice.amount)}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <IconButton
                      variant="transparent"
                      size="dense"
                      aria-label={`Descargar factura ${invoice.number}`}
                      onClick={() => downloadRecord(`factura ${invoice.number}`)}
                    >
                      <AFFORDANCE.download className="size-4" aria-hidden />
                    </IconButton>
                  </div>
                </div>
              )
            })
          ) : (
            <span className="type-body-2 fg-subtle">{NO_REGISTRO}</span>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function PaymentPreviewContent({ payment }: { payment: PaymentRecord }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate type-heading fg-default">{payment.method}</span>
        <span className="type-body-2 fg-default tabular-nums">{formatCurrency(payment.amount)}</span>
      </div>
      <Separator />
      <div className="flex flex-col gap-2">
        <PreviewInfoRow icon={ICON.invoice}>
          Cobrado por {BILLING_ENTITY_FULL_LABEL[payment.billingEntity]}
        </PreviewInfoRow>
        <PreviewInfoRow icon={ICON.duration}>{formatDateTime(payment.iso)}</PreviewInfoRow>
      </div>
    </div>
  )
}

function PaymentsCard({ client }: { client: Client }) {
  const payments = clientPayments(client)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Últimos pagos</h3>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {payments.length > 0 ? (
            payments.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PaymentLeading method={item.method} />
                  <div className="flex min-w-0 flex-col">
                    <RecordPreview
                      label={item.method}
                      content={<PaymentPreviewContent payment={item} />}
                    />
                    <span className="type-caption fg-subtle">{formatMonthYear(item.iso)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="type-body-2 fg-default tabular-nums">{formatCurrency(item.amount)}</span>
                  <IconButton
                    variant="transparent"
                    size="dense"
                    aria-label={`Descargar comprobante ${item.method} ${formatMonthYear(item.iso)}`}
                    onClick={() => downloadRecord(item.id)}
                  >
                    <AFFORDANCE.download className="size-4" aria-hidden />
                  </IconButton>
                </div>
              </div>
            ))
          ) : (
            <span className="type-body-2 fg-subtle">{NO_REGISTRO}</span>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function PaymentStatusCard({ client }: { client: Client }) {
  const payment = paymentDisplay(client)
  if (!payment) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Estado de pago</h3>
        <Card>
          <CardContent className="flex flex-col gap-1.5">
            <span className="type-body-2 fg-subtle">Sin cobro cargado este mes.</span>
            <DetailRow label="Último pago" value={formatRelativeDate(client.lastPaymentDate)} />
          </CardContent>
        </Card>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Estado de pago</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <DetailRow label="Estado" value={<Badge variant={payment.variant}>{payment.label}</Badge>} />
          {payment.detail ? (
            <DetailRow label="Monto" value={<span className="tabular-nums">{payment.detail}</span>} />
          ) : null}
          <DetailRow label="Próximo pago" value={formatRelativeDate(client.expectedPaymentDate)} />
          <DetailRow label="Último pago" value={formatRelativeDate(client.lastPaymentDate)} />
        </CardContent>
      </Card>
    </section>
  )
}

function ActivityModule({ client }: { client: Client }) {
  const items = clientActivityFeed(client)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Actividad</h3>
      <Card>
        <CardContent className="flex flex-col gap-0">
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <div key={`${item.iso}-${index}`} className="flex gap-3">
                <div className="flex flex-col items-center gap-1">
                  {item.member ? (
                    <Avatar size="sm">
                      {item.member.avatarUrl ? (
                        <AvatarImage src={item.member.avatarUrl} alt={item.member.name} />
                      ) : null}
                      <AvatarFallback>{initials(item.member.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <LeadingIcon icon={ACTIVITY_ICON[item.kind]} />
                  )}
                  {!isLast ? <span aria-hidden className="flex-1 border-l border-alpha-subtle" /> : null}
                </div>
                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-start justify-between gap-3',
                    !isLast && 'pb-4',
                  )}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="type-body-2 fg-default">{item.label}</span>
                    {item.member ? <span className="type-caption fg-subtle">{item.member.name}</span> : null}
                  </div>
                  <span className="whitespace-nowrap type-caption fg-subtle">{formatRelativeDate(item.iso)}</span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </section>
  )
}

function SeguimientoModule({ client }: { client: Client }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Seguimiento</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <DetailRow label="Última reunión" value={formatRelativeDate(client.lastMeetingDate)} />
          <DetailRow label="Último feedback" value={formatRelativeDate(client.lastFeedbackDate)} />
          <DetailRow label="Último aumento" value={formatRelativeDate(client.lastIncreaseDate)} />
          <DetailRow label="Próxima acción" value={client.nextAction ?? NO_ACTION} />
          <DetailRow label="Notas" value={client.notes ?? 'Sin notas'} />
        </CardContent>
      </Card>
    </section>
  )
}

function BillingInfo({ client }: { client: Client }) {
  const invoice = invoiceBadge(client.invoiceStatus)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Facturación</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <DetailRow
            label="Monotributo"
            value={
              client.billingEntity ? BILLING_ENTITY_FULL_LABEL[client.billingEntity] : 'Sin asignar'
            }
          />
          <DetailRow
            label="Estado de factura"
            value={<Badge variant={invoice.variant}>{invoice.label}</Badge>}
          />
          {client.taxId ? <DetailRow label="CUIT" value={client.taxId} /> : null}
          {client.businessName ? <DetailRow label="Razón social" value={client.businessName} /> : null}
          {client.address ? <DetailRow label="Domicilio" value={client.address} /> : null}
          {client.paymentMethod ? (
            <DetailRow label="Medio de pago" value={PAYMENT_METHOD_LABEL[client.paymentMethod]} />
          ) : null}
          {client.discountPercentBp ? (
            <DetailRow
              label="Descuento"
              value={
                <span className="tabular-nums">
                  {formatDiscountPercent(client.discountPercentBp)}
                </span>
              }
            />
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function EquipoModule({
  client,
  onAssign,
  onEdit,
  onEnd,
}: {
  client: Client
  onAssign: () => void
  onEdit: (assignmentId: string, memberName: string) => void
  onEnd: (assignmentId: string, memberName: string) => void
}) {
  const td = useTeamData()
  const load = td.clientMonthlyLoad(client.id)
  const { capabilities, role } = useRole()
  const canEditAssignment = role !== 'employee'
  const showCost = hasCapability(capabilities, 'teamCost')

  if (td.isError || td.isAssignmentsError) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Equipo</h3>
        <Card>
          <CardContent className="flex flex-col items-start gap-2">
            <span className="type-body-2 fg-subtle">
              No pudimos cargar el equipo. Las horas y el costo de este cliente no son cero: no
              los tenemos.
            </span>
            <Button variant="outlined" color="primary" size="dense" onClick={td.refetch}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-caption fg-subtle">Equipo fijo</h3>
        <Button variant="transparent" color="primary" size="dense" onClick={onAssign}>
          <ICON.assignPerson className="size-4" aria-hidden />
          Asignar persona
        </Button>
      </div>
      <Card>
        <CardContent>
          <div className="flex items-end justify-between gap-3">
            {showCost ? (
              <div className="flex flex-col">
                <span className="type-caption fg-subtle">Le pagamos por mes</span>
                <span className="type-section fg-default tabular-nums">
                  {load.rows.length > load.missingCost ? formatCurrency(load.totalCost) : NO_VALUE}
                </span>
                {load.missingCost > 0 && load.rows.length > 0 ? (
                  <span className="type-caption fg-subtle">
                    {load.missingCost === 1
                      ? '1 persona sin monto cargado'
                      : `${load.missingCost} personas sin monto cargado`}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="type-caption fg-subtle">Horas del mes</span>
                <span className="type-section fg-default tabular-nums">{load.totalHours} h</span>
              </div>
            )}
            {showCost && load.totalHours > 0 ? (
              <div className="flex flex-col items-end">
                <span className="type-caption fg-subtle">Horas del mes</span>
                <span className="type-mono-2 fg-default tabular-nums">{load.totalHours} h</span>
              </div>
            ) : null}
          </div>
          {load.rows.length > 0 ? (
            <div className="flex flex-col gap-6">
              {load.rows.map((row) => {
                const share =
                  load.totalHours > 0 ? Math.round((row.tracked / load.totalHours) * 100) : 0
                return (
                  <div key={row.assignmentId} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        {row.member.avatarUrl ? (
                          <AvatarImage src={row.member.avatarUrl} alt={row.member.name} />
                        ) : null}
                        <AvatarFallback>{initials(row.member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <TeamMemberHoverCard
                          memberId={row.member.id}
                          clientId={client.id}
                          trigger={<TeamMemberInline name={row.member.name} />}
                        />
                        <span className="type-caption fg-subtle">{row.roleOnClient}</span>
                      </div>
                      <div className="ml-auto flex flex-col items-end">
                        {showCost ? (
                          <span className="type-body-2 fg-default tabular-nums">
                            {row.monthlyCost != null ? formatCurrency(row.monthlyCost) : 'Sin cargar'}
                          </span>
                        ) : null}
                        {!showCost || row.tracked > 0 || row.expected > 0 ? (
                          <span
                            className={
                              showCost
                                ? 'type-caption fg-subtle tabular-nums'
                                : 'type-body-2 fg-default tabular-nums'
                            }
                          >
                            {row.tracked} h{row.expected > 0 ? ` / ${row.expected} h` : ''}
                          </span>
                        ) : null}
                      </div>
                      {canEditAssignment ? (
                        <IconButton
                          variant="transparent"
                          size="dense"
                          aria-label={`Editar la asignación de ${row.member.name}`}
                          onClick={() => onEdit(row.assignmentId, row.member.name)}
                        >
                          <ICON.edit className="size-4" aria-hidden />
                        </IconButton>
                      ) : null}
                      <IconButton
                        variant="transparent"
                        size="dense"
                        aria-label={`Quitar a ${row.member.name} del cliente`}
                        onClick={() => onEnd(row.assignmentId, row.member.name)}
                      >
                        <AFFORDANCE.close className="size-4" aria-hidden />
                      </IconButton>
                    </div>
                    {load.totalHours > 0 ? (
                      <Progress value={share} aria-label={`Carga de ${row.member.name} en ${client.name}`} />
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <span className="type-body-2 fg-subtle">{NO_REGISTRO}</span>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function OverviewSummary({ client }: { client: Client }) {
  const { capabilities } = useRole()
  const td = useTeamData()
  const tier = profitabilityStatusOf(client)
  const hasGauge = client.profitabilityPercent != null && tier != null
  const status = clientStatusBadge(client.status)
  const tenure = clientTenure(client)
  const growth = clientGrowth(client)
  const ltv = clientLtv(client)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Resumen</h3>
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4">
            {hasCapability(capabilities, 'profitability') && (
              <div className="flex justify-center">
                {hasGauge ? (
                  <ProfitabilityGauge
                    percent={client.profitabilityPercent as number}
                    status={tier}
                    label={`Rentabilidad ${PROFITABILITY_LABEL[tier].toLowerCase()}`}
                  />
                ) : (
                  <span className="py-6 type-body-2 fg-subtle">{NO_REGISTRO}</span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <DetailRow label="Valor acumulado" value={<span className="tabular-nums">{ltv.value}</span>} />
              <DetailRow
                label="Crecimiento"
                value={<span className="tabular-nums fg-default">{growth.value}</span>}
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <DetailRow label="Estado" value={<Badge variant={status.variant}>{status.label}</Badge>} />
            {client.clientType ? <DetailRow label="Tipo" value={client.clientType} /> : null}
            <DetailRow label="Antigüedad" value={tenure.value} />
            <DetailRow label="Servicios" value={<ClientServiceBadges client={client} />} />
            <DetailRow
              label="Equipo fijo"
              value={
                td.isError || td.isAssignmentsError ? (
                  <span className="type-body-2 fg-subtle">No pudimos cargar el equipo</span>
                ) : (
                  <ClientTeamInlineList
                    clientId={client.id}
                    members={td.membersForClient(client.id)}
                    maxVisible={3}
                  />
                )
              }
            />
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function DetailHero({
  client,
  heroRef,
  onClose,
  onEdit,
  onRegisterPayment,
  onIssueInvoice,
  onLogHours,
  onLogProduction,
  onAssign,
  onWhatsAppClient,
  onContactClient,
  onChurn,
}: {
  client: Client
  heroRef: Ref<HTMLDivElement>
  onClose: () => void
  onEdit: (client: Client) => void
  onRegisterPayment: (client: Client) => void
  onIssueInvoice: (client: Client) => void
  onLogHours: () => void
  onLogProduction: () => void
  onAssign: () => void
  onWhatsAppClient: (client: Client) => void
  onContactClient: (client: Client) => void
  onChurn: (client: Client) => void
}) {
  return (
    <div ref={heroRef} className="relative flex flex-col items-center gap-4 text-center">
      <IconButton
        className="absolute top-0 right-0"
        variant="transparent"
        color="primary"
        aria-label="Cerrar detalle"
        onClick={onClose}
      >
        <AFFORDANCE.close className="size-5" aria-hidden />
      </IconButton>
      <Avatar size="xxl" active>
        <AvatarFallback>{initials(client.name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <h2 className="type-section fg-default">{client.name}</h2>
        <p className="type-body-2 fg-subtle">{client.businessName ?? CLIENT_STATUS_LABEL[client.status]}</p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-6">
        <HeroActions
          client={client}
          onEdit={onEdit}
          onRegisterPayment={onRegisterPayment}
          onIssueInvoice={onIssueInvoice}
          onLogHours={onLogHours}
          onLogProduction={onLogProduction}
          onAssign={onAssign}
          onWhatsAppClient={onWhatsAppClient}
          onContactClient={onContactClient}
          onChurn={onChurn}
        />
      </div>
    </div>
  )
}

export function ClientDetail({
  client,
  onClose,
  onEdit,
  onRegisterPayment,
  onIssueInvoice,
  onWhatsAppClient,
  onContactClient,
  onChurn,
  onReviewProfitability,
  onContractChange,
}: ClientDetailProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [teamDialog, setTeamDialog] = useState<ClientTeamDialogState>({ kind: 'none' })
  const { role } = useRole()
  const clientId = client?.id

  useEffect(() => {
    setScrolled(false)
    const root = scrollRef.current
    const hero = heroRef.current
    if (!root || !hero) return
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root, rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [clientId])

  if (!client) return null

  const insight = clientInsightDisplay(client)
  const insightHandlers: Record<ClientInsightActionKind, (client: Client) => void> = {
    registerPayment: onRegisterPayment,
    edit: onEdit,
    contact: onContactClient,
    reviewProfitability: onReviewProfitability,
  }

  const openLogHours = () => setTeamDialog({ kind: 'hours', client })
  const openLogProduction = () => setTeamDialog({ kind: 'production', client })
  const openAssign = () => setTeamDialog({ kind: 'assign', client })

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 bg-page transition-opacity duration-[var(--motion-duration-quick)]',
          scrolled ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <SectionHeader
          title={client.name}
          actionsInline={false}
          description={client.businessName ?? CLIENT_STATUS_LABEL[client.status]}
          leading={
            <Avatar size="lg" active>
              <AvatarFallback>{initials(client.name)}</AvatarFallback>
            </Avatar>
          }
          actions={
            <>
              <QuickActions
                client={client}
                onEdit={onEdit}
                onRegisterPayment={onRegisterPayment}
                onIssueInvoice={onIssueInvoice}
                onLogHours={openLogHours}
                onLogProduction={openLogProduction}
                onAssign={openAssign}
                onWhatsAppClient={onWhatsAppClient}
                onContactClient={onContactClient}
                onChurn={onChurn}
              />
              <Separator orientation="vertical" className="h-6 self-center" />
              <IconButton
                variant="transparent"
                color="primary"
                aria-label="Cerrar detalle"
                onClick={onClose}
              >
                <AFFORDANCE.close className="size-5" aria-hidden />
              </IconButton>
            </>
          }
        />
      </div>

      <PanelContent ref={scrollRef} layout="stacked">
        <DetailHero
          client={client}
          heroRef={heroRef}
          onClose={onClose}
          onEdit={onEdit}
          onRegisterPayment={onRegisterPayment}
          onIssueInvoice={onIssueInvoice}
          onLogHours={openLogHours}
          onLogProduction={openLogProduction}
          onAssign={openAssign}
          onWhatsAppClient={onWhatsAppClient}
          onContactClient={onContactClient}
          onChurn={onChurn}
        />

        <Tabs defaultValue="resumen" className="mt-4 gap-6">
          <TabsList className="self-center">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="facturacion">Facturación</TabsTrigger>
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen">
            <div className="flex flex-col gap-4 md:gap-6">
              <AiInsight
                variant="prominent"
                headline={insight.headline}
                ctaLabel={insight.action.label}
                onCta={() => insightHandlers[insight.action.kind](client)}
              />
              <ClientKpis client={client} />
              <OverviewSummary client={client} />
              <ClientVariableTeamCard client={client} />
              <SeguimientoModule client={client} />
              <ActivityModule client={client} />
            </div>
          </TabsContent>

          <TabsContent value="facturacion">
            <div className="flex flex-col gap-4 md:gap-6">
              <PaymentStatusCard client={client} />
              <PaymentsCard client={client} />
              <ClientServiceLines
                clientId={client.id}
                monthlyFee={client.monthlyFee}
                currency={client.currency}
                discountPercentBp={client.discountPercentBp}
                canEdit={role !== 'employee'}
                onChange={onContractChange}
              />
              <BillingInfo client={client} />
              <InvoicesCard client={client} />
            </div>
          </TabsContent>

          <TabsContent value="equipo">
            <div className="flex flex-col gap-4 md:gap-6">
              <EquipoModule
                client={client}
                onAssign={openAssign}
                onEdit={(assignmentId, memberName) =>
                  setTeamDialog({ kind: 'editAssignment', client, assignmentId, memberName })
                }
                onEnd={(assignmentId, memberName) =>
                  setTeamDialog({ kind: 'end', client, assignmentId, memberName })
                }
              />
              <ClientProductionsModule client={client} onLogProduction={openLogProduction} />
            </div>
          </TabsContent>
        </Tabs>
      </PanelContent>

      <ClientTeamDialogs state={teamDialog} onClose={() => setTeamDialog({ kind: 'none' })} />
    </div>
  )
}
