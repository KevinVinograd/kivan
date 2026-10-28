import type { Page } from '@playwright/test'

import { mockApi, type Seed } from './api-mock'

/**
 * Session helper for the role-driven heuristic walkthrough. The app gates every
 * authenticated surface behind a real session and now fetches from a real backend
 * on every surface, so `applyRole` seeds a synthetic session AND answers every API
 * call (see `fixtures/api-mock.ts`) — otherwise unstubbed calls fail and bounce the
 * walkthrough to `/login`. Call once per test before the first `goto`. Pass `seed`
 * to override the default representative data (e.g. money-flow specs).
 */
export type Role = 'owner' | 'admin' | 'employee'

export async function applyRole(page: Page, role: Role, seed?: Seed): Promise<void> {
  await mockApi(page, role, seed)
}
