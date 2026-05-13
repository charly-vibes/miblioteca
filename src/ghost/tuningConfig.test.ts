import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  DEFAULT_HFOV_DEG,
  GYRO_SENSITIVITY,
  MAX_SHIFT_RATE_RAD_S,
  MOTION_GATE_HIDE_RAD_S,
  MOTION_GATE_SHOW_RAD_S,
  MOVING_GAIN,
  PITCH_DEADBAND_RAD,
  STILL_EMA_ALPHA,
  STILL_GAIN,
  STILL_THRESHOLD,
  STILLNESS_GATE_THRESHOLD,
  TILT_MAX_DEG_SUBTRACTED,
  TRANSLATION_SENSITIVITY,
  WORKING_DISTANCE_DEFAULT_CM,
  YAW_DEADBAND_RAD,
  ZUPT_TAU_S,
  ZUPT_THRESHOLD_MS2,
} from '../sensors/ghostOverlay'
import { GHOST_CAPTURE_MAX_MAG_PX, GHOST_CAPTURE_MAX_SHIFT_X_PX } from '../tracer/ghostCaptureGate'
import type { CalibrationExport } from './types'
import type { TuningConfig } from './tuningConfig'
import { defaultTuningConfig, loadTuningConfig, saveTuningConfig } from './tuningConfig'

const STORAGE_KEY = 'miblioteca:ghost-tuning-v1'

describe('tuningConfig persistence', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and loads all config values under a namespaced versioned localStorage key', () => {
    const config: TuningConfig = {
      orientationModel: 'absolute',
      stillThreshold: 0.11,
      stillEmaAlpha: 0.82,
      yawDeadbandRad: 0.012,
      pitchDeadbandRad: 0.013,
      stillGain: 0.05,
      movingGain: 0.09,
      maxShiftRateRadS: 0.45,
      stillnessGateThreshold: 0.82,
      maxShiftXPx: 41,
      maxMagPx: 46,
      hFovDeg: 42,
      zuptThresholdMs2: 0.12,
      zuptTauS: 0.25,
      motionGateShowRadS: 0.44,
      motionGateHideRadS: 0.59,
      gyroSensitivity: 1.5,
      translationSensitivity: 2.0,
      tiltMaxDeg: 50,
      workingDistanceCm: 70,
    }

    saveTuningConfig(config)

    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(config))
    expect(localStorage.getItem('ghost-tuning-config')).toBeNull()
    expect(loadTuningConfig()).toEqual(config)
  })

  it('falls back to compiled defaults when localStorage is missing', () => {
    expect(loadTuningConfig()).toEqual(defaultTuningConfig())
  })

  it('falls back to compiled defaults when localStorage contains corrupt JSON', () => {
    values.set(STORAGE_KEY, '{not valid json')

    expect(loadTuningConfig()).toEqual(defaultTuningConfig())
  })

  it('defaults mirror compiled ghost overlay and capture gate constants', () => {
    expect(defaultTuningConfig()).toEqual({
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
    })
  })

  it('types calibration exports with a tuning config snapshot', () => {
    expectTypeOf<CalibrationExport['tuning']>().toEqualTypeOf<TuningConfig | undefined>()
  })
})
