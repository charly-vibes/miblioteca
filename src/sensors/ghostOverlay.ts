import type { Quat } from './imuMath'

// ---------------------------------------------------------------------------
// Quaternion math for absolute-orientation tracking (ghost overlay v2)
// ---------------------------------------------------------------------------

export const STILL_THRESHOLD = 0.05
export const STILL_EMA_ALPHA = 0.95
export const YAW_DEADBAND_RAD = 0.008
export const PITCH_DEADBAND_RAD = 0.008
export const STILL_GAIN = 0.04
export const MOVING_GAIN = 0.08
export const MAX_SHIFT_RATE_RAD_S = 0.4
export const STILLNESS_GATE_THRESHOLD = 0.8
export const GYRO_SENSITIVITY = 1
export const TRANSLATION_SENSITIVITY = 1
// Per-axis beta-tilt guards (deg of deviation from 90° = upright).
// Raw-accel sessions need a stricter window because gravity bleeds into ax/ay;
// hardware-subtracted accel sessions tolerate a wider posture range.
export const TILT_MAX_DEG_RAW = 30
export const TILT_MAX_DEG_SUBTRACTED = 45
// Working distance bounds: 20 cm = minimum arm-reach / macro distance;
// 150 cm = maximum practical shelf depth from phone.
// Default 60 cm ≈ typical arm-length distance for shelf scanning.
export const WORKING_DISTANCE_MIN_CM = 20
export const WORKING_DISTANCE_MAX_CM = 150
export const WORKING_DISTANCE_DEFAULT_CM = 60

export type OrientationTrackingState = {
  readonly qRef: Quat
  readonly stillness: number
  readonly prevYaw: number
  readonly prevPitch: number
  readonly lastT: number
}

/** Converts DeviceOrientationEvent Euler angles (degrees) to a unit quaternion.
 *  Convention: intrinsic Z-X-Y (W3C DeviceOrientation spec). */
export function eulerToQuat(alphaDeg: number, betaDeg: number, gammaDeg: number): Quat {
  const a = (alphaDeg * Math.PI) / 360
  const b = (betaDeg * Math.PI) / 360
  const g = (gammaDeg * Math.PI) / 360
  const ca = Math.cos(a), sa = Math.sin(a)
  const cb = Math.cos(b), sb = Math.sin(b)
  const cg = Math.cos(g), sg = Math.sin(g)
  return {
    w: ca * cb * cg - sa * sb * sg,
    x: ca * sb * cg - sa * cb * sg,
    y: ca * cb * sg + sa * sb * cg,
    z: sa * cb * cg + ca * sb * sg,
  }
}

export function quatConjugate(q: Quat): Quat {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z }
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

export function initialOrientationState(alphaDeg: number, betaDeg: number, gammaDeg: number, nowMs: number): OrientationTrackingState {
  return {
    qRef: eulerToQuat(alphaDeg, betaDeg, gammaDeg),
    stillness: 0,
    prevYaw: 0,
    prevPitch: 0,
    lastT: nowMs,
  }
}

export type OrientationDeltaConfig = {
  stillThreshold?: number
  stillEmaAlpha?: number
  yawDeadbandRad?: number
  pitchDeadbandRad?: number
  stillGain?: number
  movingGain?: number
  maxShiftRateRadS?: number
  stillnessGateThreshold?: number
}

export function computeOrientationDelta(
  state: OrientationTrackingState,
  sample: { alphaDeg: number; betaDeg: number; gammaDeg: number; gyroMag: number; nowMs: number },
  config?: OrientationDeltaConfig,
): { yaw: number; pitch: number; state: OrientationTrackingState } {
  const st = config?.stillThreshold ?? STILL_THRESHOLD
  const ema = config?.stillEmaAlpha ?? STILL_EMA_ALPHA
  const ydb = config?.yawDeadbandRad ?? YAW_DEADBAND_RAD
  const pdb = config?.pitchDeadbandRad ?? PITCH_DEADBAND_RAD
  const sg = config?.stillGain ?? STILL_GAIN
  const mg = config?.movingGain ?? MOVING_GAIN
  const msr = config?.maxShiftRateRadS ?? MAX_SHIFT_RATE_RAD_S
  const sgt = config?.stillnessGateThreshold ?? STILLNESS_GATE_THRESHOLD

  const qNow = eulerToQuat(sample.alphaDeg, sample.betaDeg, sample.gammaDeg)
  let qDelta = quatMultiply(quatConjugate(state.qRef), qNow)

  if (qDelta.w < 0) {
    qDelta = { w: -qDelta.w, x: -qDelta.x, y: -qDelta.y, z: -qDelta.z }
  }

  const yawRaw = Math.atan2(
    2 * (qDelta.w * qDelta.y + qDelta.x * qDelta.z),
    1 - 2 * (qDelta.x * qDelta.x + qDelta.y * qDelta.y),
  )
  const pitchRaw = Math.asin(
    Math.max(-1, Math.min(1, 2 * (qDelta.w * qDelta.x - qDelta.y * qDelta.z))),
  )

  const isStill = sample.gyroMag < st ? 1.0 : 0.0
  const stillness = ema * state.stillness + (1 - ema) * isStill

  const yawTarget = Math.abs(yawRaw) < ydb ? 0 : yawRaw
  const pitchTarget = Math.abs(pitchRaw) < pdb ? 0 : pitchRaw
  const gain = stillness > sgt ? sg : mg
  const yawSmoothed = state.prevYaw + gain * (yawTarget - state.prevYaw)
  const pitchSmoothed = state.prevPitch + gain * (pitchTarget - state.prevPitch)

  const dt = Math.min(Math.max((sample.nowMs - state.lastT) / 1000, 0), 0.1)
  const maxStep = msr * dt
  const dyaw = Math.max(-maxStep, Math.min(maxStep, yawSmoothed - state.prevYaw))
  const dpitch = Math.max(-maxStep, Math.min(maxStep, pitchSmoothed - state.prevPitch))
  const yaw = state.prevYaw + dyaw
  const pitch = state.prevPitch + dpitch

  return {
    yaw,
    pitch,
    state: { ...state, stillness, prevYaw: yaw, prevPitch: pitch, lastT: sample.nowMs },
  }
}

// ---------------------------------------------------------------------------
// Legacy gyro-integration types and functions (v1 — retained for motion gate)
// ---------------------------------------------------------------------------

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

// ~40° empirically matches phone-held-at-natural-tilt (~55° forward): cos(55°)≈0.57 projection
// loss on beta means the effective angular capture per pixel ≈ 40° equivalent FOV.
export const DEFAULT_HFOV_DEG = 40
export const ZUPT_THRESHOLD_MS2 = 0.10
export const ZUPT_TAU_S = 0.20

/** Returns the zero-valued initial {@link GhostOverlayState} (all integrals and velocities at 0). */
export function initialGhostState(): GhostOverlayState {
  return { yawIntegral: 0, pitchIntegral: 0, lastT: -Infinity, lastAccelT: -Infinity, omegaMag: 0, velX: 0, velY: 0, dx_m: 0, dy_m: 0 }
}

/**
 * Integrates one gyroscope sample into the accumulated yaw and pitch.
 * @param state   Current overlay state.
 * @param sample  Gyro reading with gx/gy/gz in rad/s and t in ms (DOMHighResTimeStamp).
 * @param scanAxis `'y'` for portrait (device-y / gamma rate); `'x'` for landscape (device-x / beta rate).
 * @returns New state with updated yawIntegral, pitchIntegral, lastT, and omegaMag.
 */
// scanAxis 'y' = portrait (gamma/device-y); 'x' = landscape (beta/device-x). Caller should
// derive from screen.orientation.type: portrait-* → 'y', landscape-* → 'x'.
export type GyroConfig = {
  gyroSensitivity?: number
}

export function feedGhostGyro(
  state: GhostOverlayState,
  sample: GyroSample,
  scanAxis: 'x' | 'y' = 'y',
  config?: GyroConfig,
): GhostOverlayState {
  if (!isFinite(sample.gz) || !isFinite(sample.gx) || !isFinite(sample.gy) || !isFinite(sample.t)) return state
  if (sample.t < state.lastT) return state

  const omegaMag = Math.sqrt(sample.gx ** 2 + sample.gy ** 2 + sample.gz ** 2)

  if (!isFinite(state.lastT)) {
    return { ...state, lastT: sample.t, omegaMag }
  }

  const sens = config?.gyroSensitivity ?? GYRO_SENSITIVITY
  const dt = Math.min((sample.t - state.lastT) / 1000, 0.5) // ms → s, clamped to 500ms to guard against stale lastT after long pauses
  // Portrait (scanAxis='y'): horizontal sweep uses gy (beta/Y-axis); pitch uses gx (alpha/X-axis on Firefox).
  // Landscape (scanAxis='x'): horizontal sweep uses gx; pitch uses gy.
  const yawOmega   = scanAxis === 'x' ? sample.gx : sample.gy
  const pitchOmega = scanAxis === 'x' ? sample.gy : sample.gx
  // Yaw: phone sweeps right → yawOmega < 0 → negate → positive yawIntegral → negative shiftX (ghost left = fixed in space)
  // Pitch: phone tilts top away (looks up) → pitchOmega > 0 → positive pitchIntegral → positive shiftY (ghost moves down = fixed in space)
  return {
    ...state,
    yawIntegral:   state.yawIntegral   - yawOmega   * dt * sens,
    pitchIntegral: state.pitchIntegral + pitchOmega * dt * sens,
    lastT: sample.t,
    omegaMag,
  }
}

export type AccelFeedResult = {
  state: GhostOverlayState
  gate: 'pass' | 'zupt' | 'tilt'
}

/**
 * Integrates one linear-acceleration sample into velocity and displacement.
 * @param state   Current overlay state.
 * @param sample  Accel reading with ax/ay in m/s² (gravity-subtracted), betaDeg in degrees,
 *                interval_ms in ms, and t in ms (DOMHighResTimeStamp).
 *                Set `gravitySubtracted: true` when the hardware removed gravity — widens the
 *                beta guard from 30° to 45° around vertical.
 * @returns `{ state, gate }` where gate is `'pass'` (integrated), `'zupt'` (below noise floor,
 *          velocity decayed), or `'tilt'` (phone too flat, gravity would contaminate ax/ay).
 */
// Integrate gravity-subtracted linear acceleration into velocity and displacement.
// Beta-angle guard: if the phone is too far from vertical, gravity leaks into ax/ay.
// Threshold is 30° for raw accel (usingRawAccel=true) and 45° for hardware-subtracted
// accel (gravitySubtracted=true). Camera postures typically land at betaDeg ~55-70°,
// so raw-accel sessions need a strict guard while hardware-subtracted sessions get the
// wider window without risking gravity contamination.
export type AccelConfig = {
  zuptThresholdMs2?: number
  zuptTauS?: number
  tiltMaxDeg?: number
  translationSensitivity?: number
}

export function feedGhostAccel(
  state: GhostOverlayState,
  sample: AccelSample,
  config?: AccelConfig,
): AccelFeedResult {
  if (!isFinite(sample.ax) || !isFinite(sample.ay) || !isFinite(sample.betaDeg) || !isFinite(sample.interval_ms) || !isFinite(sample.t)) return { state, gate: 'tilt' }
  const zuptThresh = config?.zuptThresholdMs2 ?? ZUPT_THRESHOLD_MS2
  const zuptTau = config?.zuptTauS ?? ZUPT_TAU_S
  const sens = config?.translationSensitivity ?? TRANSLATION_SENSITIVITY
  const intervalMs = sample.interval_ms < 1 ? sample.interval_ms * 1000 : sample.interval_ms
  const dt = state.lastAccelT === -Infinity
    ? Math.min(intervalMs / 1000, 0.1)
    : Math.min((sample.t - state.lastAccelT) / 1000, 0.5)
  const maxTiltDeg = config?.tiltMaxDeg ?? (sample.gravitySubtracted ? TILT_MAX_DEG_SUBTRACTED : TILT_MAX_DEG_RAW)
  if (Math.abs(sample.betaDeg - 90) > maxTiltDeg) {
    if (state.velX === 0 && state.velY === 0) return { state, gate: 'tilt' }
    return { state: { ...state, velX: 0, velY: 0, lastAccelT: sample.t }, gate: 'tilt' }
  }
  const accelMag = Math.sqrt(sample.ax ** 2 + sample.ay ** 2)
  if (accelMag < zuptThresh) {
    const decay = Math.exp(-dt / zuptTau)
    return { state: { ...state, velX: state.velX * decay, velY: state.velY * decay, lastAccelT: sample.t }, gate: 'zupt' }
  }
  const ax = sample.ax * sens
  const ay = sample.ay * sens
  const newVelX = state.velX + ax * dt
  const newVelY = state.velY + ay * dt
  return {
    state: {
      ...state,
      velX: newVelX,
      velY: newVelY,
      dx_m: state.dx_m + (state.velX + newVelX) / 2 * dt,
      dy_m: state.dy_m + (state.velY + newVelY) / 2 * dt,
      lastAccelT: sample.t,
    },
    gate: 'pass',
  }
}

/**
 * Resets velX and velY to 0 (secondary ZUPT triggered on motion-gate close).
 * Position accumulators (dx_m, dy_m) are intentionally preserved.
 * @param state  Current overlay state.
 * @returns State with velX and velY set to 0; all other fields unchanged.
 */
// Zero velocity accumulators (secondary ZUPT on motion-gate close).
// Position accumulators (dx_m, dy_m) are retained — the scan is still in progress.
// setSnapshot() resets everything including position via initialGhostState().
export function zeroVelocity(state: GhostOverlayState): GhostOverlayState {
  if (state.velX === 0 && state.velY === 0) return state
  return { ...state, velX: 0, velY: 0 }
}

/**
 * Computes focal length in pixels using the pinhole camera model.
 * @param displayWidth  CSS pixel width of the rendered element (px).
 * @param hFovDeg       Horizontal field of view in degrees (default {@link DEFAULT_HFOV_DEG}).
 * @returns Focal length in pixels: `(displayWidth / 2) / tan(hFovDeg / 2)`.
 */
export function focalLengthPx(displayWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  return (displayWidth / 2) / Math.tan((hFovDeg * Math.PI) / 180 / 2)
}

/**
 * Computes horizontal pixel shift from accumulated yaw.
 * Sign convention: positive yawRad → negative shift (ghost moves left when looking right,
 * appearing fixed in space).
 * @param yawIntegral  Accumulated yaw in radians.
 * @param displayWidth CSS pixel width of the rendered element (px).
 * @param hFovDeg      Horizontal field of view in degrees (default {@link DEFAULT_HFOV_DEG}).
 * @returns Horizontal shift in px, clamped to `±displayWidth/2`.
 */
// shiftX = -focal * yawIntegral, clamped to ±displayWidth/2.
// displayWidth must be the CSS pixel width of the rendered element (not the bitmap width).
// Camera sweeps right (gy < 0) → yawIntegral > 0 → negative shift (ghost moves left, appears fixed in space).
export function computeShiftPx(yawIntegral: number, displayWidth: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const shift = -focalLengthPx(displayWidth, hFovDeg) * yawIntegral
  const half = displayWidth / 2
  return Math.max(-half, Math.min(half, shift))
}

/**
 * Clamps yawIntegral to the range where {@link computeShiftPx} would not further clamp.
 * displayWidth cancels out, so only hFovDeg matters: maxYaw = tan(hFovDeg / 2).
 * Apply in the RAF loop to prevent over-rotation and ghost jumping when panning back from an edge.
 * @param yawIntegral  Accumulated yaw in radians.
 * @param hFovDeg      Horizontal field of view in degrees (default {@link DEFAULT_HFOV_DEG}).
 * @returns yawIntegral clamped to `±tan(hFovDeg / 2)` rad.
 */
// Clamps yawIntegral to the range that computeShiftPx would not further clamp.
// displayWidth cancels out: maxYaw = tan(hFov/2).
// Apply in the RAF loop after rendering so yaw never accumulates past the visible boundary,
// preventing the ghost from jumping when panning back from the edge.
export function clampYawToViewport(yawIntegral: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const maxYaw = Math.tan((hFovDeg * Math.PI / 180) / 2)
  return Math.max(-maxYaw, Math.min(maxYaw, yawIntegral))
}

/**
 * Computes vertical pixel shift from accumulated pitch.
 * Sign convention: positive pitchRad (top away / looking up) → positive shift (ghost moves down,
 * appearing fixed in space).
 * @param pitchIntegral  Accumulated pitch in radians.
 * @param displayWidth   CSS pixel width of the rendered element (px); used to derive focal length.
 * @param displayHeight  CSS pixel height of the rendered element (px).
 * @param hFovDeg        Horizontal field of view in degrees (default {@link DEFAULT_HFOV_DEG}).
 * @returns Vertical shift in px, clamped to `±displayHeight/2`.
 */
// shiftY = focal * pitchIntegral, clamped to ±displayHeight/2.
// Camera tilts top away (looks up) → pitchIntegral > 0 → positive shiftY (ghost moves down, appears fixed in space).
export function computeShiftPy(pitchIntegral: number, displayWidth: number, displayHeight: number, hFovDeg = DEFAULT_HFOV_DEG): number {
  const shift = focalLengthPx(displayWidth, hFovDeg) * pitchIntegral
  const half = displayHeight / 2
  return Math.max(-half, Math.min(half, shift))
}

/**
 * Computes horizontal pixel shift from lateral camera displacement (unclamped).
 * Sign: phone moves right (+dx_m) → ghost shifts left (negative px) to appear fixed in space.
 * @param dx_m             Lateral displacement in meters (device x-axis, rightward positive).
 * @param workingDistanceM Distance from camera to subject in meters.
 * @param displayWidth     CSS pixel width of the rendered element (px).
 * @param hFovDeg          Horizontal field of view in degrees (default {@link DEFAULT_HFOV_DEG}).
 * @returns Horizontal translation shift in px; returns 0 if workingDistanceM ≤ 0.
 */
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

/**
 * Computes vertical pixel shift from vertical camera displacement (unclamped).
 * Sign: phone moves up (+dy_m) → ghost shifts down (positive px) to appear fixed in space.
 * @param dy_m             Vertical displacement in meters (device y-axis, upward positive).
 * @param workingDistanceM Distance from camera to subject in meters.
 * @param displayWidth     CSS pixel width of the rendered element (px); used to derive focal length.
 * @param hFovDeg          Horizontal field of view in degrees (default {@link DEFAULT_HFOV_DEG}).
 * @returns Vertical translation shift in px; returns 0 if workingDistanceM ≤ 0.
 */
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

export const MOTION_GATE_SHOW_RAD_S = 0.40
export const MOTION_GATE_HIDE_RAD_S = 0.55

/**
 * Determines ghost overlay visibility using hysteresis on angular velocity magnitude.
 * When currently hidden: visible if omegaMag ≤ showThreshold.
 * When currently visible: visible if omegaMag ≤ hideThreshold.
 * @param omegaMag       Current |ω| in rad/s.
 * @param currentlyHidden Whether the overlay is currently hidden.
 * @param showThreshold  |ω| below which to show (default {@link MOTION_GATE_SHOW_RAD_S}).
 * @param hideThreshold  |ω| above which to hide (default {@link MOTION_GATE_HIDE_RAD_S}).
 * @returns `true` if the overlay should be visible.
 */
export function motionGateVisible(
  omegaMag: number,
  currentlyHidden: boolean,
  showThreshold = MOTION_GATE_SHOW_RAD_S,
  hideThreshold = MOTION_GATE_HIDE_RAD_S,
): boolean {
  return currentlyHidden
    ? omegaMag <= showThreshold
    : omegaMag <= hideThreshold
}

/**
 * Clamps a shift so the image does not scroll beyond the viewport edge.
 * @param clientDim   Proposed shift in px (content dimension or offset).
 * @param viewportDim Viewport dimension in px (width or height).
 * @returns `Math.min(clientDim, viewportDim)`, or clientDim unchanged when viewportDim ≤ 0.
 */
export function capToViewport(clientDim: number, viewportDim: number): number {
  return viewportDim > 0 ? Math.min(clientDim, viewportDim) : clientDim
}

export type GyroLike = {
  onreading: (() => void) | null
  onerror: ((e: Event) => void) | null
  x: number | null
  y: number | null
  z: number | null
  timestamp: DOMHighResTimeStamp | null
  start(): void
  stop(): void
}

export type MotionLike = {
  onreading: (() => void) | null
  x: number | null
  y: number | null
  interval: number
  gravitySubtracted?: boolean
  start(): void
  stop(): void
}

export type OrientationLike = {
  onreading: (() => void) | null
  alpha: number | null
  beta: number | null
  gamma: number | null
  start(): void
  stop(): void
}

export type GhostFrame = {
  t: DOMHighResTimeStamp
  yawRad: number
  pitchRad: number
  shiftPx: number
  pitchShiftPx: number
  dx_m: number
  dy_m: number
  gateOpen: boolean
}
