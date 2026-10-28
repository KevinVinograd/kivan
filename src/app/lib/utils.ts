import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * Canonical helper consumed by shadcn-style components added to this starter.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
