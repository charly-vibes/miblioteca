import {
  STILL_THRESHOLD, STILL_EMA_ALPHA,
  YAW_DEADBAND_RAD, PITCH_DEADBAND_RAD,
  STILL_GAIN, MOVING_GAIN, MAX_SHIFT_RATE_RAD_S,
  STILLNESS_GATE_THRESHOLD,
  DEFAULT_HFOV_DEG, ZUPT_THRESHOLD_MS2, ZUPT_TAU_S,
  MOTION_GATE_SHOW_RAD_S, MOTION_GATE_HIDE_RAD_S,
  GYRO_SENSITIVITY, TRANSLATION_SENSITIVITY,
  TILT_MAX_DEG_SUBTRACTED, WORKING_DISTANCE_DEFAULT_CM,
} from '../sensors/ghostOverlay'
import {
  GHOST_CAPTURE_MAX_SHIFT_X_PX, GHOST_CAPTURE_MAX_MAG_PX,
} from '../tracer/ghostCaptureGate'

export type OrientationModel = 'gyro' | 'absolute'

export type TuningConfig = {
  orientationModel: OrientationModel
  stillThreshold: number
  stillEmaAlpha: number
  yawDeadbandRad: number
  pitchDeadbandRad: number
  stillGain: number
  movingGain: number
  maxShiftRateRadS: number
  stillnessGateThreshold: number
  maxShiftXPx: number
  maxMagPx: number
  hFovDeg: number
  zuptThresholdMs2: number
  zuptTauS: number
  motionGateShowRadS: number
  motionGateHideRadS: number
  gyroSensitivity: number
  translationSensitivity: number
  tiltMaxDeg: number
  workingDistanceCm: number
}

export function defaultTuningConfig(): TuningConfig {
  return {
    orientationModel: 'gyro',
    stillThreshold: STILL_THRESHOLD,
    stillEmaAlpha: STILL_EMA_ALPHA,
    yawDeadbandRad: YAW_DEADBAND_RAD,
    pitchDeadbandRad: PITCH_DEADBAND_RAD,
    stillGain: STILL_GAIN,
    movingGain: MOVING_GAIN,
    maxShiftRateRadS: MAX_SHIFT_RATE_RAD_S,
    stillnessGateThreshold: STILLNESS_GATE_THRESHOLD,
    maxShiftXPx: GHOST_CAPTURE_MAX_SHIFT_X_PX,
    maxMagPx: GHOST_CAPTURE_MAX_MAG_PX,
    hFovDeg: DEFAULT_HFOV_DEG,
    zuptThresholdMs2: ZUPT_THRESHOLD_MS2,
    zuptTauS: ZUPT_TAU_S,
    motionGateShowRadS: MOTION_GATE_SHOW_RAD_S,
    motionGateHideRadS: MOTION_GATE_HIDE_RAD_S,
    gyroSensitivity: GYRO_SENSITIVITY,
    translationSensitivity: TRANSLATION_SENSITIVITY,
    tiltMaxDeg: TILT_MAX_DEG_SUBTRACTED,
    workingDistanceCm: WORKING_DISTANCE_DEFAULT_CM,
  }
}

const STORAGE_KEY = 'miblioteca:ghost-tuning-v1'

export function loadTuningConfig(): TuningConfig {
  const defaults = defaultTuningConfig()
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* corrupt storage */ }
  return defaults
}

export function saveTuningConfig(config: TuningConfig): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* quota or private browsing */ }
}
