import { useState } from 'react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { todayIso } from '@/app/lib/iso-date'
import { KeepOpenToggle, useKeepOpen } from './dialog-keep-open'
import {
  CommitmentEntityPicker,
  ENTITY_TYPE_LABEL,
  entityLinkSatisfied,
  useEntityOptions,
} from './cashflow-commitment-entity-picker'
import type { CommittedCategory, CommittedItem, Currency } from './treasury-mock-data'
import { entityLinkRequired, entityTypeFor } from './treasury-mock-data'
import {
  COMMITTED_CATEGORY_LABEL,
  CONFIDENCE_LABEL,
  DIRECTION_LABEL,
  RECURRENCE_LABEL,
} from './treasury-view'
import { LANE_LABEL } from './treasury-position-view'

type Direction = CommittedItem['direction']
type Recurrence = CommittedItem['recurrence']
type Confidence = CommittedItem['confidence']

const CATEGORY_OPTIONS = Object.keys(COMMITTED_CATEGORY_LABEL) as CommittedCategory[]
const DIRECTION_OPTIONS: Direction[] = ['inflow', 'outflow']
const RECURRENCE_OPTIONS: Recurrence[] = ['monthly', 'quarterly', 'annual', 'one_time']
const CONFIDENCE_OPTIONS: Confidence[] = ['committed', 'projected']
const CURRENCY_OPTIONS: Currency[] = ['ARS', 'USD']

/** Caption label stacked over a control, matching the finance dialog idiom. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/**
 * Add / edit a committed item. `item` present → edit (preserves provenance, returns the
 * full `CommittedItem` via `onSave`); absent → create a manual item (returns
 * `Omit<CommittedItem, 'id'>` via `onCreate`, the store mints the id). The currency lane
 * (ARS / USD) is selectable; only the ARS lane feeds the 13-week projection, while
 * USD items surface in the Posición. Installments and reintegro are preserved on
 * edit (no entry form yet).
 *
 * The COUNTERPARTY field is what lets the projection supersede this commitment by
 * identity instead of by a (week, category) guess. It renders only for the three
 * categories whose money records carry a matching id, and it is required on a new one.
 */
/**
 * The two modes are mutually exclusive, and the type says so.
 *
 * Both handlers used to be required, so every call site passed both and each one carried a
 * handler that could never fire: `submit` reaches `onCreate` only when `item` is absent and
 * `onSave` only when it is present. That dead wiring is how the register kept a live
 * subscription to `addCommitment` long after it stopped creating anything. Discriminating on
 * `item` makes the compiler ask for exactly the handler the mode can actually reach.
 */
type CashflowCommitmentDialogProps = { onClose: () => void } & (
  | {
      /** Edit an existing item: preserves provenance and `linkedEntityId`. */
      item: CommittedItem
      onSave: (next: CommittedItem) => Promise<void>
      onCreate?: never
    }
  | {
      /** Create a manual item: the store mints the id. */
      item?: undefined
      onCreate: (next: Omit<CommittedItem, 'id'>) => Promise<void>
      onSave?: never
    }
)

export function CashflowCommitmentDialog(props: CashflowCommitmentDialogProps) {
  const { item, onClose } = props
  const [description, setDescription] = useState(item?.description ?? '')
  const [direction, setDirection] = useState<Direction>(item?.direction ?? 'outflow')
  const [category, setCategory] = useState<CommittedCategory>(item?.category ?? 'fixed_expense')
  // Empty, not '0': a zero reads as an answered field, so the submit stayed disabled
  // over a form that looked complete. Same reason `startDate` opens on today rather
  // than blank, matching `cobros-registrar-cobro-dialog.tsx` — the dialog the feedback
  // rule cites as canonical, which opens already valid.
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [recurrence, setRecurrence] = useState<Recurrence>(item?.recurrence ?? 'monthly')
  const [startDate, setStartDate] = useState(item?.startDate ?? todayIso())
  const [endDate, setEndDate] = useState(item?.endDate ?? '')
  // Today's day-of-month, not 1, so the two date defaults agree. `expandCommitment`
  // resolves an occurrence as `onAnchor(startDate, anchorDay)` — it keeps the start MONTH
  // and forces the DAY — so `startDate = today` paired with `anchorDay = 1` places a
  // one_time commitment on the 1st of the current month, which is already behind
  // `windowStart` and gets dropped from the projection entirely. The user would have
  // filled the form, saved it, and watched it not appear. Capped at 28, the field's own
  // limit, because months are not all the same length.
  const [anchorDay, setAnchorDay] = useState(
    item ? String(item.anchorDay) : String(Math.min(Number(todayIso().slice(8, 10)), 28)),
  )
  const [confidence, setConfidence] = useState<Confidence>(item?.confidence ?? 'committed')
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? 'ARS')
  const [observations, setObservations] = useState(item?.observations ?? '')
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [submitting, setSubmitting] = useState(false)
  const { keepOpen, setKeepOpen, fieldsRef, focusFirstField } = useKeepOpen()

  // Which counterparty kind this commitment can name, from the CATEGORY AND THE DIRECTION
  // together. Either one changing can change the kind, so both handlers clear the id: a
  // client id left on a row that is now an outflow names a row the netting pool can never
  // reach, and the register would show it as linked while it silently netted nothing.
  const entityType = entityTypeFor(category, direction)
  const [entityId, setEntityId] = useState(item?.linkedEntityId ?? '')
  const entityOptions = useEntityOptions(entityType)

  function handleCategoryChange(next: CommittedCategory) {
    setCategory(next)
    if (entityTypeFor(next, direction) !== entityType) setEntityId('')
  }

  function handleDirectionChange(next: Direction) {
    setDirection(next)
    if (entityTypeFor(category, next) !== entityType) setEntityId('')
  }

  /** Back to a blank create form, keeping the toggle itself ticked. The counterparty is
   *  KEPT, like the client in `cobros-create-cobro-dialog.tsx`: loading several
   *  commitments for the same client or member in a row is the reason to stay open. */
  function resetForm() {
    setDescription('')
    setAmount('')
    setObservations('')
    setEndDate('')
    focusFirstField('Descripción')
  }

  const amountN = Number(amount)
  const anchorDayN = Number(anchorDay)

  // What is still blocking the submit, named. The button was disabled with nothing
  // explaining why, which is indistinguishable from a broken button: this dialog was
  // reported as "Agregar compromiso does not work" when the write path was fine and
  // the form was simply two fields short of valid.
  // The link is required on a NEW commitment whose category names a counterparty, and
  // only there. An EXISTING row keeps its own answer: every commitment created before
  // this field existed has none, and blocking an unrelated edit behind a migration of
  // old data would make the register read-only for exactly the rows most worth fixing.
  const entityMissing =
    !item && entityLinkRequired(category, direction) && !entityLinkSatisfied(entityOptions, entityId)
  const missing = [
    description.trim().length === 0 ? 'descripción' : null,
    Number.isFinite(amountN) && amountN > 0 ? null : 'monto',
    Number.isInteger(anchorDayN) && anchorDayN >= 1 && anchorDayN <= 28 ? null : 'día del mes',
    startDate.length === 0 ? 'fecha de inicio' : null,
    entityMissing && entityType ? ENTITY_TYPE_LABEL[entityType].toLowerCase() : null,
  ].filter((field): field is string => field !== null)
  const endBeforeStart = endDate !== '' && endDate < startDate
  const valid = missing.length === 0 && !endBeforeStart

  async function handleSubmit() {
    if (!valid || submitting) return
    const base = {
      description: description.trim(),
      direction,
      amount: amountN,
      currency,
      category,
      recurrence,
      startDate,
      endDate: endDate || undefined,
      anchorDay: anchorDayN,
      confidence,
      source: item?.source ?? ('manual' as const),
      // Both halves or neither, always derived from the CURRENT category. Moving a row to
      // a category that names nothing clears the link rather than leaving a stale one.
      ...(entityType && entityId
        ? { linkedEntityType: entityType, linkedEntityId: entityId }
        : { linkedEntityType: undefined, linkedEntityId: undefined }),
      observations: observations.trim() || undefined,
      isActive,
    }
    setSubmitting(true)
    try {
      // Narrowed on `props`, not on the destructured `item`: the discriminated union lives on
      // the props object, so this is what proves to TS that the handler for this mode exists.
      if (props.item) {
        await props.onSave({ ...props.item, ...base })
        toast.success('Compromiso actualizado')
      } else {
        await props.onCreate(base)
        toast.success('Compromiso agregado')
        // Only after the write landed. Staying open is a convenience; it never buys
        // the toast the right to fire early.
        if (keepOpen) {
          resetForm()
          setSubmitting(false)
          return
        }
      }
      onClose()
    } catch {
      toast.error('No se pudo guardar el compromiso')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Editar compromiso' : 'Nuevo compromiso'}</DialogTitle>
          <DialogDescription>
            Movimiento futuro que la proyección de caja tiene en cuenta.
          </DialogDescription>
        </DialogHeader>

        <div ref={fieldsRef} className="flex flex-col gap-3">
          <Field label="Descripción">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="Descripción"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Tipo">
              <Select
                value={direction}
                onValueChange={(value) => handleDirectionChange(value as Direction)}
                disabled={Boolean(item)}
              >
                <SelectTrigger className="w-full" aria-label="Tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DIRECTION_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Monto">
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Monto"
              />
            </Field>
            <Field label="Moneda">
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value as Currency)}
                disabled={Boolean(item)}
              >
                <SelectTrigger className="w-full" aria-label="Moneda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {LANE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Categoría">
              <Select
                value={category}
                onValueChange={(value) => handleCategoryChange(value as CommittedCategory)}
              >
                <SelectTrigger className="w-full" aria-label="Categoría">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {COMMITTED_CATEGORY_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Frecuencia">
              <Select value={recurrence} onValueChange={(value) => setRecurrence(value as Recurrence)}>
                <SelectTrigger className="w-full" aria-label="Frecuencia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {RECURRENCE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Only the three categories whose money records carry a matching id. A gasto
              fijo, a monotributo cuota and a plataforma have no counterparty record, so
              there is nothing to point at and no field to show. */}
          {entityType ? (
            <CommitmentEntityPicker
              type={entityType}
              value={entityId}
              onChange={setEntityId}
              state={entityOptions}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Desde">
              <DatePicker value={startDate} onChange={setStartDate} required aria-label="Fecha de inicio" />
            </Field>
            <Field label="Hasta (opcional)">
              <DatePicker value={endDate} onChange={setEndDate} aria-label="Fecha de fin" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Día del mes (1-28)">
              <Input
                type="number"
                min={1}
                max={28}
                value={anchorDay}
                onChange={(event) => setAnchorDay(event.target.value)}
                aria-label="Día del mes"
              />
            </Field>
            <Field label="Confianza">
              <Select value={confidence} onValueChange={(value) => setConfidence(value as Confidence)}>
                <SelectTrigger className="w-full" aria-label="Confianza">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {CONFIDENCE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Observaciones (opcional)">
            <Textarea
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
              aria-label="Observaciones"
              rows={2}
            />
          </Field>

          <label className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="type-body-2 fg-default">Activo</span>
              <span className="type-caption fg-subtle">Incluir este compromiso en la proyección.</span>
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} className="shrink-0" />
          </label>
        </div>

        {/* Two different things, so two different tokens. A contradiction the user typed is
            an error state (`fg-danger`); a field they have not reached
            yet is not their mistake, so it takes `fg-default` — which still separates it from
            the `fg-subtle` field labels it would otherwise be indistinguishable from. */}
        {endBeforeStart ? (
          <p className="type-caption fg-danger" role="alert">
            La fecha de fin no puede ser anterior a la de inicio
          </p>
        ) : missing.length > 0 ? (
          <p className="type-caption fg-default" role="status">
            Falta completar: {missing.join(', ')}
          </p>
        ) : null}

        <DialogFooter>
          {/* Create only: "seguir agregando" has no meaning when you are editing one row. */}
          {item ? null : <KeepOpenToggle checked={keepOpen} onCheckedChange={setKeepOpen} />}
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            disabled={!valid || submitting}
            onClick={handleSubmit}
          >
            {item ? 'Guardar cambios' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
