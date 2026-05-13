import { describe, expect, it, vi } from 'vitest'
import type { GyroLike } from './ghostOverlay'
import { createGhostPipelineDeps } from './createGhostPipelineDeps'
import type { GhostPipelineOptions } from './createGhostPipelineDeps'
import { defaultTuningConfig } from '../ghost/tuningConfig'

function makeWindow(): GhostPipelineOptions['win'] {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

function makeGyro(): GyroLike {
  return {
    x: 0,
    y: 0,
    z: 0,
    timestamp: 0,
    onreading: null,
    onerror: null,
    start: vi.fn(),
    stop: vi.fn(),
  }
}

describe('createGhostPipelineDeps', () => {
  it('maps site-specific options into GhostMotionPipeline deps', () => {
    const win = makeWindow()
    const gyro = makeGyro()
    const tuning = { ...defaultTuningConfig(), movingGain: 0.123 }
    const getDisplayWidth = () => 412
    const getDisplayHeight = () => 915
    const getScreenOrientation = () => 'portrait-primary'
    const onFrame = vi.fn()
    const onGyroSample = vi.fn()
    const raf = vi.fn()
    const caf = vi.fn()
    const now = () => 42
    const logger = { log: vi.fn() }

    const deps = createGhostPipelineDeps({
      win,
      gyro,
      getDisplayWidth,
      getDisplayHeight,
      getScreenOrientation,
      enableMotionGate: false,
      tuning,
      onFrame,
      onGyroSample,
      requestAnimationFrame: raf,
      cancelAnimationFrame: caf,
      now,
      logger,
    })

    expect(deps.gyro).toBe(gyro)
    expect(deps.displayWidth).toBe(getDisplayWidth)
    expect(deps.displayHeight).toBe(getDisplayHeight)
    expect(deps.getScreenOrientation).toBe(getScreenOrientation)
    expect(deps.enableMotionGate).toBe(false)
    expect(deps.tuning).toBe(tuning)
    expect(deps.onFrame).toBe(onFrame)
    expect(deps.onGyroSample).toBe(onGyroSample)
    expect(deps.requestAnimationFrame).toBe(raf)
    expect(deps.cancelAnimationFrame).toBe(caf)
    expect(deps.now).toBe(now)
    expect(deps.logger).toBe(logger)
  })

  it('defaults motion gate to enabled', () => {
    const deps = createGhostPipelineDeps({
      win: makeWindow(),
      gyro: makeGyro(),
      getDisplayWidth: () => 412,
      getDisplayHeight: () => 915,
    })

    expect(deps.enableMotionGate).toBe(true)
  })
})
