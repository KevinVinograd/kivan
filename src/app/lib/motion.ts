export type MotionPreset =
  | 'none'
  | 'standard'
  | 'press'
  | 'soft-magnetic'
  | 'panel-enter'
  | 'panel-exit'
  | 'content-dissolve'
  | 'md-content-out'
  | 'md-content-in'
  | 'md-list-in'
  | 'md-detail-in'
  | 'md-list-out'
  | 'md-detail-out'

const PRESET_CLASS: Record<MotionPreset, string> = {
  none: '',
  standard: 'motion-standard',
  press: 'motion-press',
  'soft-magnetic': 'motion-soft-magnetic',
  'panel-enter': 'motion-panel-enter',
  'panel-exit': 'motion-panel-exit',
  'content-dissolve': 'motion-content-dissolve',
  'md-content-out': 'motion-md-content-out',
  'md-content-in': 'motion-md-content-in',
  'md-list-in': 'motion-md-list-in',
  'md-detail-in': 'motion-md-detail-in',
  'md-list-out': 'motion-md-list-out',
  'md-detail-out': 'motion-md-detail-out',
}

export function motionClass(preset: MotionPreset = 'none'): string {
  return PRESET_CLASS[preset]
}

export const MOTION_MAGNETIC_CARD = 'motion-magnetic-card'

export const MOTION_NAV_ICON = 'motion-nav-icon'

export interface MotionProps {
  motion?: MotionPreset
  interactive?: boolean
}
