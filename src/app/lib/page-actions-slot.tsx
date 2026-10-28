import { createContext, useContext } from 'react'

/**
 * The mobile page-actions slot: the DOM node, owned by the AppShell mobile nav
 * line, into which a page's PageHeader portals its primary action + overflow menu
 * on mobile. `null` on desktop (the slot is `md:hidden`) and until the node mounts.
 *
 * This is the cross-cutting wiring that lets PageHeader (rendered deep inside
 * MainContent) place its mobile CTAs on the same line as the nav pill without the
 * shell knowing what those actions are. A context is used (not a hard import) so
 * the shell stays presentational and PageHeader stays the single owner of the
 * action descriptors.
 */
export const PageActionsSlotContext = createContext<HTMLElement | null>(null)

/** Read the mobile page-actions slot node (null on desktop / before mount). */
export function usePageActionsSlot(): HTMLElement | null {
  return useContext(PageActionsSlotContext)
}
