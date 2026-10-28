import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Time-of-day hero wash — state layer.
 *
 * Publishes the header `greeting` (in consonance with the hour) and whether the
 * wash is active. The wash is a single, always-on 'day' gradient: the night
 * variant and the dev on/off + moment-override pill were removed, so there is no
 * runtime control — the effect simply paints on the dashboard. The visuals are
 * pure CSS (`.bg-gradient-daytime` + `.daytime-hero`). Recipe + design notes:
 * the convention.
 */

/** The single visual variant. Day-only — the night variant was dropped. */
export type Moment = 'day'

/** Neutral greeting used when no provider is mounted (tests). */
const NEUTRAL_GREETING = 'Buenas'

/** Header greeting by hour (kept 3-way so the copy stays natural across the day). */
function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function currentGreeting(): string {
  return greetingForHour(new Date().getHours())
}

export type DaytimeContextValue = {
  /** The moment the wash paints (day-only). */
  moment: Moment
  /** Whether the wash should paint. True under a provider; false otherwise. */
  isActive: boolean
  /** Header greeting in consonance with the hour. */
  greeting: string
}

/** Default value = effect off, so consumers rendered without a provider (tests,
    isolated renders) degrade gracefully instead of painting. */
const DEFAULT_VALUE: DaytimeContextValue = {
  moment: 'day',
  isActive: false,
  greeting: NEUTRAL_GREETING,
}

const DaytimeContext = createContext<DaytimeContextValue>(DEFAULT_VALUE)

export function useDaytime(): DaytimeContextValue {
  return useContext(DaytimeContext)
}

export function DaytimeProvider({ children }: { children: ReactNode }) {
  const [greeting, setGreeting] = useState<string>(currentGreeting)

  // Real-clock tick: refresh the greeting periodically so it tracks the hour of
  // day without a reload. 60s is ample resolution.
  useEffect(() => {
    const id = setInterval(() => setGreeting(currentGreeting()), 60_000)
    return () => clearInterval(id)
  }, [])

  const value = useMemo<DaytimeContextValue>(
    () => ({ moment: 'day', isActive: true, greeting }),
    [greeting],
  )

  return <DaytimeContext.Provider value={value}>{children}</DaytimeContext.Provider>
}
