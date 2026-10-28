import { PanelContent, SectionHeader } from '@/app/components/templates'
import { useTheme } from '@/app/lib/use-theme'
import { SettingGroup, ToggleRow } from './settings-fields'

/**
 * Apariencia — the theme toggle reads and writes the real `useTheme` hook (persists to
 * localStorage and flips `<html data-theme>`), so switching it here re-themes the whole app
 * live. The Idioma select was removed: there is no i18n layer in the repo, so it changed
 * nothing and reverted on reload (2026-07-27 action-completeness audit, backlog #1). It
 * comes back when a real language layer exists; until then the section shows only what works.
 */
export function SettingsAppearance() {
  const { theme, setTheme } = useTheme()

  return (
    <>
      <SectionHeader title="Apariencia" description="Cómo se ve la app en este dispositivo." />
      <PanelContent layout="stacked">
        <SettingGroup title="Tema" description="La preferencia se guarda en este dispositivo.">
          <ToggleRow
            label="Tema oscuro"
            description="Alterná entre el tema claro y el oscuro."
            checked={theme === 'dark'}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
        </SettingGroup>
      </PanelContent>
    </>
  )
}
