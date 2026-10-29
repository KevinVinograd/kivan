import { describe, expect, it } from 'vitest'

import { resolveDevAutoLogin, type DevAutoLoginSource } from './dev-auto-login'

function source(overrides: Partial<DevAutoLoginSource> = {}): DevAutoLoginSource {
  return {
    dev: true,
    flag: '1',
    email: 'owner@studio.test',
    password: 'owner1234',
    automated: false,
    ...overrides,
  }
}

describe('resolveDevAutoLogin', () => {
  it('returns the credentials when every condition holds', () => {
    expect(resolveDevAutoLogin(source())).toEqual({
      email: 'owner@studio.test',
      password: 'owner1234',
    })
  })

  it('is off in a production build even with the flag and credentials set', () => {
    expect(resolveDevAutoLogin(source({ dev: false }))).toBeNull()
  })

  it('is off unless the flag is exactly "1" (opt-in, never a default)', () => {
    expect(resolveDevAutoLogin(source({ flag: undefined }))).toBeNull()
    expect(resolveDevAutoLogin(source({ flag: '' }))).toBeNull()
    expect(resolveDevAutoLogin(source({ flag: '0' }))).toBeNull()
    expect(resolveDevAutoLogin(source({ flag: 'true' }))).toBeNull()
  })

  it('is off under browser automation, so it can never leak into the mocked e2e suite', () => {
    expect(resolveDevAutoLogin(source({ automated: true }))).toBeNull()
  })

  it('is off when either credential is missing or blank', () => {
    expect(resolveDevAutoLogin(source({ email: undefined }))).toBeNull()
    expect(resolveDevAutoLogin(source({ password: undefined }))).toBeNull()
    expect(resolveDevAutoLogin(source({ email: '   ' }))).toBeNull()
    expect(resolveDevAutoLogin(source({ password: '' }))).toBeNull()
  })

  it('trims surrounding whitespace off the credentials and the flag', () => {
    expect(resolveDevAutoLogin(source({ flag: ' 1 ', email: ' a@b.test ', password: ' pw ' }))).toEqual(
      { email: 'a@b.test', password: 'pw' },
    )
  })
})
