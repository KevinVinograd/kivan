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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

type CashflowCommitmentDialogProps = { onClose: () => void } & (
  | {
      item: CommittedItem
      onSave: (next: CommittedItem) => Promise<void>
      onCreate?: never
    }
  | {
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
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [recurrence, setRecurrence] = useState<Recurrence>(item?.recurrence ?? 'monthly')
  const [startDate, setStartDate] = useState(item?.startDate ?? todayIso())
  const [endDate, setEndDate] = useState(item?.endDate ?? '')
  const [anchorDay, setAnchorDay] = useState(
    item ? String(item.anchorDay) : String(Math.min(Number(todayIso().slice(8, 10)), 28)),
  )
  const [confidence, setConfidence] = useState<Confidence>(item?.confidence ?? 'committed')
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? 'ARS')
  const [observations, setObservations] = useState(item?.observations ?? '')
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [submitting, setSubmitting] = useState(false)
  const { keepOpen, setKeepOpen, fieldsRef, focusFirstField } = useKeepOpen()

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

  function resetForm() {
    setDescription('')
    setAmount('')
    setObservations('')
    setEndDate('')
    focusFirstField('Descripción')
  }

  const amountN = Number(amount)
  const anchorDayN = Number(anchorDay)

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
      ...(entityType && entityId
        ? { linkedEntityType: entityType, linkedEntityId: entityId }
        : { linkedEntityType: undefined, linkedEntityId: undefined }),
      observations: observations.trim() || undefined,
      isActive,
    }
    setSubmitting(true)
    try {
      if (props.item) {
        await props.onSave({ ...props.item, ...base })
        toast.success('Compromiso actualizado')
      } else {
        await props.onCreate(base)
        toast.success('Compromiso agregado')
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
