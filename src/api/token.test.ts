import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearTokens,
  getAccessToken,
  hasAccessToken,
  setTokens,
  subscribeToTokens,
} from './token'

afterEach(() => {
  clearTokens()
})

describe('token store — snapshot', () => {
  it('reports whether a session token is held', () => {
    expect(hasAccessToken()).toBe(false)
    setTokens('access-1', 'refresh-1')
    expect(hasAccessToken()).toBe(true)
    expect(getAccessToken()).toBe('access-1')
    clearTokens()
    expect(hasAccessToken()).toBe(false)
  })

  it('stays identity-stable across a rotation, so consumers do not re-render for nothing', () => {
    setTokens('access-1', 'refresh-1')
    const before = hasAccessToken()
    setTokens('access-2', 'refresh-2')
    expect(hasAccessToken()).toBe(before)
  })
})

describe('token store — subscriptions', () => {
  it('notifies subscribers when a token is written', () => {
    const listener = vi.fn()
    subscribeToTokens(listener)

    setTokens('access-1', 'refresh-1')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers when tokens are cleared', () => {
    setTokens('access-1', 'refresh-1')
    const listener = vi.fn()
    subscribeToTokens(listener)

    clearTokens()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTokens(listener)
    unsubscribe()

    setTokens('access-1', 'refresh-1')

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies every subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubFirst = subscribeToTokens(first)
    const unsubSecond = subscribeToTokens(second)

    setTokens('access-1', 'refresh-1')

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    unsubFirst()
    unsubSecond()
  })
})

describe('token store — the regression this store exists to prevent', () => {
  it('notifies on a write made from OUTSIDE React, which is the only kind there is', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTokens(listener)

    setTokens('access-1', 'refresh-1')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(hasAccessToken()).toBe(true)

    setTokens('access-2', 'refresh-2')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(hasAccessToken()).toBe(true)

    clearTokens()
    expect(listener).toHaveBeenCalledTimes(3)
    expect(hasAccessToken()).toBe(false)

    unsubscribe()
  })
})
