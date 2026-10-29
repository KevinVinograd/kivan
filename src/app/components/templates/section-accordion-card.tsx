import { type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
} from '@/app/components/components'

export type SectionAccordionCardProps = {
  title: string
  summary?: ReactNode
  children: ReactNode
  value?: string
  defaultOpen?: boolean
  contentInset?: boolean
  stackSummaryOnMobile?: boolean
}

export function SectionAccordionCard({
  title,
  summary,
  children,
  value = 'section',
  defaultOpen = false,
  contentInset = true,
  stackSummaryOnMobile = false,
}: SectionAccordionCardProps) {
  return (
    <Card>
      <CardContent>
        <Accordion type="single" collapsible defaultValue={defaultOpen ? value : undefined}>
          <AccordionItem value={value}>
            <AccordionTrigger emphasis="section">
              <span
                className={cn(
                  'flex flex-1 items-center justify-between gap-4',
                  stackSummaryOnMobile &&
                    'flex-col items-start gap-1 md:flex-row md:items-center md:gap-4',
                )}
              >
                <span>{title}</span>
                {summary}
              </span>
            </AccordionTrigger>
            <AccordionContent inset={contentInset}>{children}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
