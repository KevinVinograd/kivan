import { createContext, useContext } from 'react'

export const PageActionsSlotContext = createContext<HTMLElement | null>(null)

export function usePageActionsSlot(): HTMLElement | null {
  return useContext(PageActionsSlotContext)
}
