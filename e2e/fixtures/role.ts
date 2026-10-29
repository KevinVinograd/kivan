import type { Page } from '@playwright/test'

import { mockApi, type Seed } from './api-mock'

export type Role = 'owner' | 'admin' | 'employee'

export async function applyRole(page: Page, role: Role, seed?: Seed): Promise<void> {
  await mockApi(page, role, seed)
}
