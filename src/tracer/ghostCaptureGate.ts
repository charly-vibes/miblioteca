export type GhostCaptureState = {
  shiftPx: number
  shiftPy: number
  visible: boolean
  workingDistanceCm: number
}

export type GhostCaptureDecision = {
  allowed: boolean
  reason: 'hidden' | 'large-horizontal-error' | 'large-total-error' | 'oscillation' | null
  message: string | null
  magPx: number | null
  recentSignFlips: number
}

export const GHOST_CAPTURE_MAX_SHIFT_X_PX = 40
export const GHOST_CAPTURE_MAX_MAG_PX = 45
export const GHOST_CAPTURE_OSCILLATION_MIN_ABS_PX = 20
export const GHOST_CAPTURE_OSCILLATION_WINDOW = 4
export const GHOST_CAPTURE_OSCILLATION_MIN_FLIPS = 3

function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

export function countSignFlips(values: readonly number[]): number {
  let flips = 0
  let prev = 0
  for (const value of values) {
    const next = sign(value)
    if (next === 0) continue
    if (prev !== 0 && next !== prev) flips++
    prev = next
  }
  return flips
}

export function hasOscillation(values: readonly number[]): boolean {
  if (values.length < GHOST_CAPTURE_OSCILLATION_WINDOW) return false
  const window = values.slice(-GHOST_CAPTURE_OSCILLATION_WINDOW)
  if (window.some((value) => Math.abs(value) < GHOST_CAPTURE_OSCILLATION_MIN_ABS_PX)) return false
  return countSignFlips(window) >= GHOST_CAPTURE_OSCILLATION_MIN_FLIPS
}

export function evaluateGhostCapture(params: {
  captureIndex: number
  ghost: GhostCaptureState | null
  recentShiftXs: readonly number[]
}): GhostCaptureDecision {
  const { captureIndex, ghost, recentShiftXs } = params
  if (ghost == null || captureIndex === 0) {
    return { allowed: true, reason: null, message: null, magPx: ghost ? Math.hypot(ghost.shiftPx, ghost.shiftPy) : null, recentSignFlips: countSignFlips(recentShiftXs) }
  }

  const magPx = Math.hypot(ghost.shiftPx, ghost.shiftPy)
  const recentSignFlips = countSignFlips([...recentShiftXs, ghost.shiftPx].slice(-GHOST_CAPTURE_OSCILLATION_WINDOW))
  if (!ghost.visible) {
    return { allowed: false, reason: 'hidden', message: 'Wait for the ghost overlay to reappear before taking the next photo.', magPx, recentSignFlips }
  }
  if (hasOscillation([...recentShiftXs, ghost.shiftPx])) {
    return { allowed: false, reason: 'oscillation', message: 'Advance steadily in one direction instead of swinging back and forth.', magPx, recentSignFlips }
  }
  if (Math.abs(ghost.shiftPx) > GHOST_CAPTURE_MAX_SHIFT_X_PX) {
    return { allowed: false, reason: 'large-horizontal-error', message: 'Recenter the ghost overlay before taking the next photo.', magPx, recentSignFlips }
  }
  if (magPx > GHOST_CAPTURE_MAX_MAG_PX) {
    return { allowed: false, reason: 'large-total-error', message: 'Hold the phone closer to the ghost overlay before taking the next photo.', magPx, recentSignFlips }
  }
  return { allowed: true, reason: null, message: null, magPx, recentSignFlips }
}
