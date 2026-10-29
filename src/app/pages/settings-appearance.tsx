import { PanelContent, SectionHeader } from '@/app/components/templates'
import { useTheme } from '@/app/lib/use-theme'
import { SettingGroup, ToggleRow } from './settings-fields'

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
