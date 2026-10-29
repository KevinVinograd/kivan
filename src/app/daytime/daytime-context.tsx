import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Moment = 'day'

const NEUTRAL_GREETING = 'Buenas'

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function currentGreeting(): string {
  return greetingForHour(new Date().getHours())
}

export type DaytimeContextValue = {
  moment: Moment
  isActive: boolean
  greeting: string
}

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
