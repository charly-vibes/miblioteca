export type GyroSample = {
  t: number    // ms (DOMHighResTimeStamp)
  gx: number   // rad/s, pitch rate (x-axis)
  gy: number   // rad/s, rotation around device y-axis (gamma rate); used as scan axis for portrait phones
  gz: number   // rad/s, rotation around device z-axis (alpha rate)
}

export type GhostOverlayState = {
  readonly yawIntegral: number    // accumulated horizontal rotation (rad) since last reset
  readonly pitchIntegral: number  // accumulated vertical tilt (rad) since last reset
  readonly lastT: number          // ms of last sample (-Infinity = no sample yet)
  readonly omegaMag: number       // |ω| = sqrt(gx²+gy²+gz²), rad/s
}

const DEFAULT_HFOV_DEG = 65

export function initialGhostState(): GhostOverlayState {
  return { yawIntegral: 0, pitchIntegral: 0, lastT: -Infinity, omegaMag: 0 }
}

// scanAxis 'y' = portrait (gamma/device-y); 'x' = landscape (beta/device-x). Caller should
// derive from screen.orientation.type: portrait-* → 'y', landscape-* → 'x'.
export function feedGhostGyro(
  state: GhostOverlayState,
  sample: GyroSample,
  scanAxis: 'x' | 'y' = 'y',
): GhostOverlayState {
  if (!isFinite(sample.gz) || !isFinite(sample.gx) || !isFinite(sample.gy) || !isFinite(sample.t)) return state
  if (sample.t < state.lastT) return state

  const omegaMag = Math.sqrt(sample.gx ** 2 + sample.gy ** 2 + sample.gz ** 2)

  if (!isFinite(state.lastT)) {
    return { yawIntegral: state.yawIntegral, pitchIntegral: state.pitchIntegral, lastT: sample.t, omegaMag }
  }

  const dt = Math.min((sample.t - state.lastT) / 1000, 0.5) // ms → s, clamped to 500ms to guard against stale lastT after long pauses
  // Portrait (scanAxis='y'): horizontal sweep uses gy; pitch (tilt up/down) uses gx.
  // Landscape (scanAxis='x'): horizontal sweep uses gx; pitch uses gy.
  const yawOmega   = scanAxis === 'x' ? sample.gx : sample.gy
  const pitchOmega = scanAxis === 'x' ? sample.gy : sample.gx
  // Yaw: phone sweeps right → yawOmega < 0 → negate → positive yawIntegral → negative shiftX (ghost left = fixed in space)
  // Pitch: phone tilts top away (looks up) → pitchOmega > 0 → positive pitchIntegral → positive shiftY (ghost moves down = fixed in space)
  return {
    yawIntegral:   state.yawIntegral   - yawOmega   * dt,
    pitchIntegral: state.pitchIntegral + pitchOmega * dt,
    lastT: sample.t,
    omegaMag,
  }
}

// shiftX = -(displayWidth/2) / tan(hFov/2) * yawIntegral, clamped to ±displayWidth/2.
// displayWidth must be the CSS pixel width of the rendered element (not the bitmap width).
// Camera sweeps right (gy < 0) → yawIntegral > 0 → negative shift (ghost moves left, appears fixed in space).
export function computeShiftPx(yawIntegral: number, displayWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const hFovRad = (hFovDeg * Math.PI) / 180
  const shift = -(displayWidth / 2) / Math.tan(hFovRad / 2) * yawIntegral
  const half = displayWidth / 2
  return Math.max(-half, Math.min(half, shift))
}

// shiftY = focal * pitchIntegral, clamped to ±displayHeight/2.
// Uses the same focal length as computeShiftPx (square-pixel pinhole model).
// Camera tilts top away (looks up) → pitchIntegral > 0 → positive shiftY (ghost moves down, appears fixed in space).
export function computeShiftPy(pitchIntegral: number, displayWidth: number, displayHeight: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const hFovRad = (hFovDeg * Math.PI) / 180
  const focal = (displayWidth / 2) / Math.tan(hFovRad / 2)
  const shift = focal * pitchIntegral
  const half = displayHeight / 2
  return Math.max(-half, Math.min(half, shift))
}
