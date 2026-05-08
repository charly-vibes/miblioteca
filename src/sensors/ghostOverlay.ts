export type GyroSample = {
  t: number    // ms (DOMHighResTimeStamp)
  gx: number   // rad/s, pitch rate (x-axis)
  gy: number   // rad/s, rotation around device y-axis (gamma rate); used as scan axis for portrait phones
  gz: number   // rad/s, rotation around device z-axis (alpha rate)
}

export type AccelSample = {
  ax: number          // m/s², gravity-subtracted lateral acceleration (DeviceMotionEvent.acceleration.x)
  ay: number          // m/s², gravity-subtracted vertical acceleration
  interval_ms: number // from DeviceMotionEvent.interval (ms); used only for the first sample (no prior timestamp)
  betaDeg: number     // DeviceOrientationEvent.beta (0=flat, 90=upright facing wall)
  t: number           // DOMHighResTimeStamp; used for elapsed-time guard on subsequent samples
  gravitySubtracted?: boolean  // true when hardware removed gravity (DeviceMotionEvent.acceleration); widens the beta guard to 45°
}

export type GhostOverlayState = {
  readonly yawIntegral: number    // accumulated horizontal rotation (rad) since last reset
  readonly pitchIntegral: number  // accumulated vertical tilt (rad) since last reset
  readonly lastT: number          // ms of last gyro sample (-Infinity = no sample yet)
  readonly lastAccelT: number     // ms of last accel sample (-Infinity = no sample yet); used for wallclock-elapsed dt guard
  readonly omegaMag: number       // |ω| = sqrt(gx²+gy²+gz²), rad/s
  readonly velX: number           // m/s, lateral velocity since last reset (device x-axis)
  readonly velY: number           // m/s, vertical velocity since last reset (device y-axis)
  readonly dx_m: number           // m, lateral displacement since last reset
  readonly dy_m: number           // m, vertical displacement since last reset
}

const DEFAULT_HFOV_DEG = 65

export function initialGhostState(): GhostOverlayState {
  return { yawIntegral: 0, pitchIntegral: 0, lastT: -Infinity, lastAccelT: -Infinity, omegaMag: 0, velX: 0, velY: 0, dx_m: 0, dy_m: 0 }
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
    return { ...state, lastT: sample.t, omegaMag }
  }

  const dt = Math.min((sample.t - state.lastT) / 1000, 0.5) // ms → s, clamped to 500ms to guard against stale lastT after long pauses
  // Portrait (scanAxis='y'): horizontal sweep uses gy; pitch (tilt up/down) uses gx.
  // Landscape (scanAxis='x'): horizontal sweep uses gx; pitch uses gy.
  const yawOmega   = scanAxis === 'x' ? sample.gx : sample.gy
  const pitchOmega = scanAxis === 'x' ? sample.gy : sample.gx
  // Yaw: phone sweeps right → yawOmega < 0 → negate → positive yawIntegral → negative shiftX (ghost left = fixed in space)
  // Pitch: phone tilts top away (looks up) → pitchOmega > 0 → positive pitchIntegral → positive shiftY (ghost moves down = fixed in space)
  return {
    ...state,
    yawIntegral:   state.yawIntegral   - yawOmega   * dt,
    pitchIntegral: state.pitchIntegral + pitchOmega * dt,
    lastT: sample.t,
    omegaMag,
  }
}

// Integrate gravity-subtracted linear acceleration into velocity and displacement.
// Beta-angle guard: if the phone is too far from vertical, gravity leaks into ax/ay.
// Threshold is 30° for raw accel (usingRawAccel=true) and 45° for hardware-subtracted
// accel (gravitySubtracted=true). Camera postures typically land at betaDeg ~55-70°,
// so raw-accel sessions need a strict guard while hardware-subtracted sessions get the
// wider window without risking gravity contamination.
export function feedGhostAccel(
  state: GhostOverlayState,
  sample: AccelSample,
): GhostOverlayState {
  if (!isFinite(sample.ax) || !isFinite(sample.ay) || !isFinite(sample.betaDeg) || !isFinite(sample.interval_ms) || !isFinite(sample.t)) return state
  const maxTiltDeg = sample.gravitySubtracted ? 45 : 30
  if (Math.abs(sample.betaDeg - 90) > maxTiltDeg) {
    // Phone near-horizontal: gravity leaks into ax/ay. Zero velocity but don't update position.
    // Early return when already zeroed (avoids allocation).
    if (state.velX === 0 && state.velY === 0) return state
    return { ...state, velX: 0, velY: 0, lastAccelT: sample.t }
  }
  // Use wallclock elapsed time to avoid scale errors from device-reported nominal interval.
  // First sample falls back to interval_ms (capped at 100ms). Subsequent samples cap at 500ms
  // to guard against phantom drift after the app is backgrounded — matching feedGhostGyro's lastT guard.
  const dt = state.lastAccelT === -Infinity
    ? Math.min(sample.interval_ms / 1000, 0.1)
    : Math.min((sample.t - state.lastAccelT) / 1000, 0.5)
  const newVelX = state.velX + sample.ax * dt
  const newVelY = state.velY + sample.ay * dt
  return {
    ...state,
    velX: newVelX,
    velY: newVelY,
    dx_m: state.dx_m + (state.velX + newVelX) / 2 * dt,
    dy_m: state.dy_m + (state.velY + newVelY) / 2 * dt,
    lastAccelT: sample.t,
  }
}

// Zero velocity accumulators (secondary ZUPT on motion-gate close).
// Position accumulators (dx_m, dy_m) are retained — the scan is still in progress.
// setSnapshot() resets everything including position via initialGhostState().
export function zeroVelocity(state: GhostOverlayState): GhostOverlayState {
  if (state.velX === 0 && state.velY === 0) return state
  return { ...state, velX: 0, velY: 0 }
}

function focalLengthPx(displayWidth: number, hFovDeg: number): number {
  return (displayWidth / 2) / Math.tan((hFovDeg * Math.PI) / 180 / 2)
}

// shiftX = -focal * yawIntegral, clamped to ±displayWidth/2.
// displayWidth must be the CSS pixel width of the rendered element (not the bitmap width).
// Camera sweeps right (gy < 0) → yawIntegral > 0 → negative shift (ghost moves left, appears fixed in space).
export function computeShiftPx(yawIntegral: number, displayWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const shift = -focalLengthPx(displayWidth, hFovDeg) * yawIntegral
  const half = displayWidth / 2
  return Math.max(-half, Math.min(half, shift))
}

// shiftY = focal * pitchIntegral, clamped to ±displayHeight/2.
// Camera tilts top away (looks up) → pitchIntegral > 0 → positive shiftY (ghost moves down, appears fixed in space).
export function computeShiftPy(pitchIntegral: number, displayWidth: number, displayHeight: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const shift = focalLengthPx(displayWidth, hFovDeg) * pitchIntegral
  const half = displayHeight / 2
  return Math.max(-half, Math.min(half, shift))
}

// Lateral translation shift from DeviceMotion integration (unclamped; canvas applies final clamp on combined total).
// Camera moves right (+dx_m) → shelf appears to shift left → negative shiftPx (ghost moves left = fixed in space).
// The minus sign is the AR correctness requirement: phone right → ghost left.
export function computeTranslationShiftPx(
  dx_m: number,
  workingDistanceM: number,
  displayWidth: number,
  hFovDeg = DEFAULT_HFOV_DEG,
): number {
  if (workingDistanceM <= 0) return 0
  return -(dx_m / workingDistanceM) * focalLengthPx(displayWidth, hFovDeg)
}

// Vertical translation shift (unclamped; canvas applies final clamp on combined total).
// Camera moves up (+dy_m) → shelf appears to shift down → positive shiftPy (ghost moves down = fixed in space).
// Positive (no negation): contrast with Px — phone up (+dy_m) → ghost down, not left/right.
export function computeTranslationShiftPy(
  dy_m: number,
  workingDistanceM: number,
  displayWidth: number,
  hFovDeg = DEFAULT_HFOV_DEG,
): number {
  if (workingDistanceM <= 0) return 0
  return (dy_m / workingDistanceM) * focalLengthPx(displayWidth, hFovDeg)
}
