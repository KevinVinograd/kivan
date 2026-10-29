import { csvCell, downloadCsv, today } from '@/app/lib/csv'
import type { TeamMember } from './clients-mock-data'
import type { MonthlyTeamStatement, TeamPaymentStatus } from './team-mock-data'

export type TeamExportRow = {
  member: TeamMember
  estimatedPay: number | undefined
  paymentStatus: TeamPaymentStatus | ''
}

type RosterColumn = {
  header: string
  value: (row: TeamExportRow) => string | number
}

const ROSTER_COLUMNS: RosterColumn[] = [
  { header: 'Nombre', value: (r) => r.member.name },
  { header: 'Rol', value: (r) => r.member.role },
  { header: 'Estado', value: (r) => r.member.status },
  { header: 'Tipo de contratación', value: (r) => r.member.employmentType },
  { header: 'Tipo de pago', value: (r) => r.member.compensation.model },
  { header: 'Pago estimado', value: (r) => r.estimatedPay ?? '' },
  { header: 'Estado de pago', value: (r) => r.paymentStatus },
  { header: 'Email', value: (r) => r.member.email ?? '' },
  { header: 'Teléfono', value: (r) => r.member.phone ?? '' },
  { header: 'CUIT', value: (r) => r.member.taxId ?? '' },
  { header: 'Banco', value: (r) => r.member.bank?.bankName ?? '' },
  { header: 'Alias / CBU', value: (r) => r.member.bank?.alias ?? r.member.bank?.cbuOrCvu ?? '' },
]

export function exportTeamCsv(rows: TeamExportRow[]): void {
  const header = ROSTER_COLUMNS.map((col) => csvCell(col.header)).join(',')
  const body = rows.map((row) => ROSTER_COLUMNS.map((col) => csvCell(col.value(row))).join(','))
  downloadCsv(header, body, `equipo-${today()}.csv`)
}

export type TeamStatementExportRow = {
  memberName: string
  statement: MonthlyTeamStatement | undefined
}

type StatementColumn = {
  header: string
  value: (row: TeamStatementExportRow) => string | number
}

const STATEMENT_COLUMNS: StatementColumn[] = [
  { header: 'Nombre', value: (r) => r.memberName },
  { header: 'Mes', value: (r) => r.statement?.month ?? '' },
  { header: 'Base', value: (r) => r.statement?.baseAmount ?? 0 },
  { header: 'Horas', value: (r) => r.statement?.hoursAmount ?? 0 },
  { header: 'Producción', value: (r) => r.statement?.productionsAmount ?? 0 },
  { header: 'Extras', value: (r) => r.statement?.extrasAmount ?? 0 },
  { header: 'Viáticos', value: (r) => r.statement?.expensesAmount ?? 0 },
  { header: 'Ajustes', value: (r) => r.statement?.adjustmentsAmount ?? 0 },
  { header: 'Deducciones', value: (r) => r.statement?.deductionsAmount ?? 0 },
  { header: 'Total', value: (r) => r.statement?.totalAmount ?? 0 },
  { header: 'Estado de pago', value: (r) => r.statement?.status ?? '' },
]

export function exportTeamStatementsCsv(rows: TeamStatementExportRow[]): void {
  const header = STATEMENT_COLUMNS.map((col) => csvCell(col.header)).join(',')
  const body = rows.map((row) => STATEMENT_COLUMNS.map((col) => csvCell(col.value(row))).join(','))
  downloadCsv(header, body, `cuentas-corrientes-equipo-${today()}.csv`)
}
