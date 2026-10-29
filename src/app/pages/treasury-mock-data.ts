export type CommittedCategory =
  | 'salaries'
  | 'fixed_expense'
  | 'tax'
  | 'platform'
  | 'retainer'
  | 'other'

export type { Currency } from '@hold/shared'
import type { Currency } from '@hold/shared'

export type Partner = 'vicky' | 'flor' | 'more' | 'shared'

export type Money = Partial<Record<Currency, number>>

export type Account = {
  id: string
  name: string
  partner: Partner
  type: 'bank' | 'cash' | 'investment'
  balances: Money
  isReserve?: boolean
  note?: string
  isActive: boolean
  version?: number
}

export type CashAccount = {
  id: string
  name: string
  currency: Currency
  openingBalance: number
  openingBalanceDate: string
  isActive: boolean
}

export type Installment = {
  date: string
  amount: number
  note?: string
}

export type Reimbursement = {
  amount: number
  owedBy?: Partner
  note?: string
}

export type LinkedEntityType = 'client' | 'teamMember' | 'provider' | 'invoiceEmitter'

export function entityTypeFor(
  category: CommittedCategory,
  direction: CommittedItem['direction'],
): LinkedEntityType | undefined {
  if (category === 'retainer' && direction === 'inflow') return 'client'
  if (category === 'salaries' && direction === 'outflow') return 'teamMember'
  if (direction !== 'outflow') return undefined
  if (category === 'tax') return 'invoiceEmitter'
  if (category === 'fixed_expense' || category === 'platform' || category === 'other') {
    return 'provider'
  }
  return undefined
}

export function entityLinkRequired(
  category: CommittedCategory,
  direction: CommittedItem['direction'],
): boolean {
  const type = entityTypeFor(category, direction)
  return type === 'client' || type === 'teamMember'
}

export type CommittedItem = {
  id: string
  description: string
  direction: 'inflow' | 'outflow'
  amount: number
  currency: Currency
  category: CommittedCategory
  recurrence: 'monthly' | 'quarterly' | 'annual' | 'one_time'
  startDate: string
  endDate?: string
  anchorDay: number
  confidence: 'committed' | 'projected'
  source: 'derived' | 'manual'
  linkedEntityType?: LinkedEntityType
  linkedEntityId?: string
  installments?: Installment[]
  reimbursement?: Reimbursement
  observations?: string
  isActive: boolean
  version?: number
}

export const seedCashAccount: CashAccount = {
  id: 'cash-001',
  name: 'Caja principal',
  currency: 'ARS',
  openingBalance: 2_500_000,
  openingBalanceDate: '2026-06-01',
  isActive: true,
}

export const seedAccounts: Account[] = [
  { id: 'acc-001', name: 'Banco Vicky', partner: 'vicky', type: 'bank', balances: { ARS: 820_000, USD: 1_500 }, isActive: true },
  { id: 'acc-002', name: 'Banco Flor', partner: 'flor', type: 'bank', balances: { ARS: 640_000 }, isActive: true },
  { id: 'acc-003', name: 'Banco More', partner: 'more', type: 'bank', balances: { ARS: 410_000 }, isActive: true },
  { id: 'acc-004', name: 'Efectivo VT', partner: 'vicky', type: 'cash', balances: { ARS: 180_000 }, isActive: true },
  { id: 'acc-005', name: 'Efectivo FF', partner: 'flor', type: 'cash', balances: { ARS: 240_000, USD: 300 }, note: 'Incluye dólares de caja chica', isActive: true },
  { id: 'acc-006', name: 'Efectivo PG', partner: 'more', type: 'cash', balances: { ARS: 95_000 }, isActive: true },
  { id: 'acc-007', name: 'FIMA Fondo Común', partner: 'shared', type: 'investment', balances: { ARS: 3_200_000 }, isReserve: true, note: 'Fondo Común de Inversión', isActive: true },
  { id: 'acc-008', name: 'Saldo CA VT', partner: 'vicky', type: 'bank', balances: { USD: 4_200 }, isReserve: true, isActive: true },
  { id: 'acc-009', name: 'Saldo CA FF', partner: 'flor', type: 'bank', balances: { USD: 2_800 }, isReserve: true, isActive: true },
  { id: 'acc-010', name: 'Saldo MF', partner: 'shared', type: 'bank', balances: { ARS: 1_100_000 }, isReserve: true, isActive: true },
]

export const seedCommittedItems: CommittedItem[] = [
  {
    id: 'cmt-001',
    description: 'Aguinaldo (medio SAC)',
    direction: 'outflow',
    amount: 1_300_000,
    currency: 'ARS',
    category: 'salaries',
    recurrence: 'one_time',
    startDate: '2026-06-30',
    anchorDay: 28,
    confidence: 'committed',
    source: 'manual',
    isActive: true,
  },
  {
    id: 'cmt-002',
    description: 'Honorarios cliente externo (USD)',
    direction: 'inflow',
    amount: 2_000,
    currency: 'USD',
    category: 'retainer',
    recurrence: 'one_time',
    startDate: '2026-06-20',
    anchorDay: 20,
    confidence: 'projected',
    source: 'manual',
    observations: 'Transferencia del exterior',
    isActive: true,
  },
  {
    id: 'cmt-003',
    description: 'Suscripción software (USD)',
    direction: 'outflow',
    amount: 450,
    currency: 'USD',
    category: 'platform',
    recurrence: 'one_time',
    startDate: '2026-06-15',
    anchorDay: 15,
    confidence: 'committed',
    source: 'manual',
    isActive: true,
  },
  {
    id: 'cmt-004',
    description: 'Sueldo socias junio (a cuenta)',
    direction: 'outflow',
    amount: 900_000,
    currency: 'ARS',
    category: 'salaries',
    recurrence: 'one_time',
    startDate: '2026-06-23',
    anchorDay: 23,
    confidence: 'committed',
    source: 'manual',
    installments: [
      { date: '2026-06-12', amount: 300_000, note: 'a cuenta' },
      { date: '2026-06-19', amount: 300_000, note: 'a cuenta' },
    ],
    reimbursement: { amount: 50_000, owedBy: 'flor', note: 'Reintegro a realizar' },
    observations: 'Resto a liquidar el 23/6',
    isActive: true,
  },
]
