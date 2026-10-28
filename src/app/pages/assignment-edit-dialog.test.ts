import { describe, expect, it } from 'vitest'

import { assignmentPatch } from './assignment-edit-dialog'

const stored = { roleOnClient: 'Diseño', estimatedMonthlyHours: 10, monthlyCost: 150000 }
const same = { area: 'Diseño' as const, hours: 10, costInput: '150.000' }

describe('assignmentPatch', () => {
  it('sends nothing when nothing changed', () => {
    expect(assignmentPatch(stored, same, true)).toEqual({})
  })

  it('sends only the fields that changed', () => {
    expect(assignmentPatch(stored, { ...same, hours: 12 }, true)).toEqual({ estimatedMonthlyHours: 12 })
    expect(assignmentPatch(stored, { ...same, area: 'Producción' }, true)).toEqual({
      roleOnClient: 'Producción',
    })
  })

  it('reads the amount as es-AR money', () => {
    expect(assignmentPatch(stored, { ...same, costInput: '200.000' }, true)).toEqual({ monthlyCost: 200000 })
  })

  it('erases a stored amount the operator cleared, with null', () => {
    expect(assignmentPatch(stored, { ...same, costInput: '' }, true)).toEqual({ monthlyCost: null })
  })

  it('sends a typed 0 as an agreed amount, not as an erase', () => {
    expect(assignmentPatch(stored, { ...same, costInput: '0' }, true)).toEqual({ monthlyCost: 0 })
  })

  it('leaves an unentered amount alone while the field stays empty', () => {
    const unpriced = { ...stored, monthlyCost: undefined }
    expect(assignmentPatch(unpriced, { ...same, costInput: '' }, true)).toEqual({})
  })

  it('never touches the amount for a viewer without teamCost', () => {
    // The row they received has no amount, so an empty field must not erase the real one.
    const hidden = { ...stored, monthlyCost: undefined }
    expect(assignmentPatch(hidden, { ...same, costInput: '' }, false)).toEqual({})
  })

  it('does not send a legacy free-text area until a listed one is picked', () => {
    const legacy = { ...stored, roleOnClient: 'Diseñadora senior' }
    expect(assignmentPatch(legacy, { ...same, area: '' }, true)).toEqual({})
    expect(assignmentPatch(legacy, { ...same, area: 'Diseño' }, true)).toEqual({ roleOnClient: 'Diseño' })
  })
})
