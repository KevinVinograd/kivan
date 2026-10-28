import {
  // — Semantic: navigation —
  SquaresFour,
  Briefcase,
  CalendarDots,
  ChartBar,
  CurrencyCircleDollar,
  Gear,
  User,
  Users,
  BookOpen,
  // — Semantic: settings sections —
  Bell,
  Buildings,
  Palette,
  ShieldCheck,
  // — Semantic: billing & money —
  ArrowsLeftRight,
  Calculator,
  Handshake,
  Repeat,
  Money,
  Receipt,
  Scroll,
  // — Semantic: relationship & lifecycle —
  CalendarCheck,
  ChatCenteredText,
  Clock,
  TrendUp,
  UserPlus,
  // — Semantic: contact channels —
  Envelope,
  WhatsappLogo,
  // — Semantic: row actions —
  Eye,
  FilePlus,
  PaperPlaneTilt,
  PauseCircle,
  PencilSimple,
  Trash,
  UserMinus,
  // — Semantic: status / feedback —
  CheckCircle,
  Info,
  Warning,
  WarningOctagon,
  // — Semantic: team module —
  Bank,
  ClipboardText,
  FilmSlate,
  HandCoins,
  IdentificationBadge,
  PlusCircle,
  SealCheck,
  Timer,
  UserCirclePlus,
  EnvelopeOpen,
  // — Semantic: session & identity —
  SignOut,
  UserCircle,
  // — Semantic: monthly operation —
  CalendarPlus,
  Lock,
  LockOpen,
  // — Structural: affordances —
  ArrowDown,
  ArrowsDownUp,
  ArrowUp,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  Columns,
  DotsThree,
  DownloadSimple,
  EyeSlash,
  FunnelSimple,
  List,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  Sparkle,
  X,
  type Icon,
} from '@phosphor-icons/react'

/**
 * Icon registry — the single source of truth for every Phosphor icon used in the
 * product.
 *
 * Two tiers:
 *
 * - `ICON` — SEMANTIC icons. One meaning = one icon (the map is *injective*:
 *   two distinct meanings MUST NOT share an icon). A meaning may be referenced
 *   by many call-sites — that is consistency, not collision (e.g. `invoice` is
 *   the same meaning whether it labels the "Facturación" nav item or the "Emitir
 *   factura" row action, so both use `ICON.invoice`). Every product-author icon
 *   choice (nav items, dropdown/menu actions, entity/activity/payment markers)
 *   MUST come from here.
 *
 * - `AFFORDANCE` — STRUCTURAL icons: universal UI verbs that legitimately recur
 *   (close, expand/collapse, sort, search, overflow, filter, …) and component
 *   chrome baked into primitives. Exempt from the one-meaning rule, but still
 *   inventoried here so nothing escapes the registry. Primitives keep importing
 *   these directly from `@phosphor-icons/react`; this map exists to account for
 *   them.
 *
 * Weight / fill: every entry is a Phosphor component that accepts a `weight`
 * prop (`"regular"` default). Outline is the resting state; `weight="fill"` is
 * reserved for the active / selected state (e.g. the active SideNav item). Pick
 * the weight at the call-site — never bake a non-regular default into the map.
 *
 * Adding a new icon: register it here FIRST (semantic → a new `ICON` key with a
 * distinct meaning and a not-yet-used glyph; structural → an `AFFORDANCE` key),
 * then consume it. Keep one meaning per glyph and do not import `lucide-react`.
 */
export const ICON = {
  // Navigation destinations
  dashboard: SquaresFour,
  clients: Briefcase,
  team: Users,
  myWork: User, // employee's "Mi trabajo" — the /team rail relabeled to the person's own profile (a single user, not the roster)
  monthlyOperation: CalendarDots,
  finance: CurrencyCircleDollar, // finance / cobros y pagos — a $ coin reads as money, distinct from reports' bar chart
  reports: ChartBar,
  settings: Gear,
  docs: BookOpen, // documentation / guía — a static help surface, distinct from every operative destination

  // Settings sections — leading marks for the Configuración rail
  workspace: Buildings, // studio identity / workspace defaults
  notifications: Bell,
  appearance: Palette,
  roles: ShieldCheck, // what a role may see and do — the permission definition, distinct from `team` (the people) and `assignPerson` (granting one)

  // Billing & money — shared meanings across nav, actions, and detail
  invoice: Receipt,
  payment: Money,
  commitment: Handshake, // a committed future movement in the cashflow register — money AGREED but not yet moved, distinct from `payment` (money that moved) and `invoice` (money billed)
  // "Generar cobros del mes" — turn each client's recurring monthly retainer into this
  // period's cobros. A recurrence glyph, not a create one: `AFFORDANCE.create` is the
  // universal "add one thing" verb, and this is the month's standing agreement coming
  // round again. Distinct from `commitment` (money agreed once, not yet moved).
  recurringBilling: Repeat,
  transfer: ArrowsLeftRight,
  cheque: Scroll,
  compensation: Calculator,

  // Relationship & lifecycle
  meeting: CalendarCheck,
  feedback: ChatCenteredText,
  increase: TrendUp,
  clientCreated: UserPlus,
  duration: Clock,

  // Contact channels — shared by detail quick actions and the contact modal
  whatsapp: WhatsappLogo,
  email: Envelope,

  // Row / menu actions
  view: Eye,
  edit: PencilSimple,
  delete: Trash,
  sendStatement: PaperPlaneTilt,
  addExtraWork: FilePlus,
  pause: PauseCircle,
  churn: UserMinus,

  // Status / feedback marks — alerts, toasts, inline status (one glyph per tone)
  statusInfo: Info,
  statusSuccess: CheckCircle,
  statusWarning: Warning,
  statusDanger: WarningOctagon,

  // Team module — roster, load, pay and activity records
  teamMemberCreated: IdentificationBadge, // "Nuevo miembro del equipo" — create a roster entry
  logHours: Timer,
  production: FilmSlate,
  logWork: PlusCircle, // "Cargar" — opens the hours/production logging menu
  assignPerson: UserCirclePlus, // assign a team member to a client
  invitePerson: EnvelopeOpen, // send a roster person the link that gives them a login — distinct from `email` (writing to them) and `assignPerson` (giving them a client)
  expense: HandCoins,
  approvePayment: SealCheck,
  bankDetails: Bank,
  statement: ClipboardText, // "Generar cuentas (corrientes)" — produce a team member's running-account statement

  // Session & identity — the shell user menu
  myProfile: UserCircle, // "Mi perfil" — the signed-in person's own account. A distinct glyph from `myWork` (User), which is an employee's WORK surface, not their account.
  signOut: SignOut, // ending the session. Not an AFFORDANCE: signing out is a product action with one meaning, not a universal UI verb like close or expand.

  // Monthly operation — close/lock the period (padlock: closing locks the month's calculations)
  effectiveDate: CalendarPlus, // "Definir fecha efectiva" — record a new/churned client's alta/baja date (unblocks the monthly close)
  closeMonth: Lock,
  reopenMonth: LockOpen, // open padlock: reopening unlocks the closed month
} satisfies Record<string, Icon>

export const AFFORDANCE = {
  // Dismiss
  close: X,
  closeNav: X, // same glyph; nav close button (recurrence allowed in this tier)
  // Disclosure / navigation between values
  expand: CaretDown,
  expandValue: CaretDown, // alias used by calendar / select chrome
  collapseValue: CaretUp,
  prev: CaretLeft,
  next: CaretRight,
  datePicker: CalendarBlank, // DatePicker trigger chrome — control that opens a date calendar (parallels expandValue for Select)
  // Table & list controls
  sort: ArrowsDownUp,
  sortAscending: ArrowUp,
  sortDescending: ArrowDown,
  selected: Check,
  search: MagnifyingGlass,
  overflow: DotsThree,
  filter: FunnelSimple,
  columns: Columns,
  // App chrome
  mobileNav: List,
  railCollapse: SidebarSimple,
  railExpand: SidebarSimple,
  create: Plus,
  // Field chrome — the show/hide verb for a masked value. Structural, not
  // semantic: `Eye` is already the glyph for the meaning `view` (ICON.view), and
  // a semantic key may not reuse another's glyph. Revealing a password is a
  // universal UI verb, not a product meaning, so it belongs in this tier — where
  // recurrence is allowed and the bijection check does not apply.
  revealPassword: Eye,
  hidePassword: EyeSlash,
  // Record export (universal download verb; recurs across invoices/reports/statements)
  download: DownloadSimple,
  // Provenance marks
  ai: Sparkle,
} satisfies Record<string, Icon>

export type IconKey = keyof typeof ICON
export type AffordanceKey = keyof typeof AFFORDANCE

export type { Icon, IconWeight } from '@phosphor-icons/react'
