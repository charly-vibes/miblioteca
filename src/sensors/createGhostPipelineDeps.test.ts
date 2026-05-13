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

function fireDeviceOrientation(win: GhostPipelineOptions['win'], init: { alpha: number | null; beta: number | null; gamma: number | null }): void {
  const handler = vi.mocked(win.addEventListener).mock.calls.find(([type]) => type === 'deviceorientation')?.[1]
  expect(handler).toBeDefined()
  ;(handler as EventListener)(init as unknown as Event)
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

  it('constructs a Gyroscope at 60Hz when no gyro is provided', () => {
    const gyro = makeGyro()
    const Gyroscope = vi.fn(() => gyro)
    const win = { ...makeWindow(), Gyroscope }

    const deps = createGhostPipelineDeps({
      win,
      getDisplayWidth: () => 412,
      getDisplayHeight: () => 915,
    })

    expect(Gyroscope).toHaveBeenCalledWith({ frequency: 60 })
    expect(deps.gyro).toBe(gyro)
  })

  it('wires deviceorientation into getBeta and getOrientation callbacks', () => {
    const win = makeWindow()
    const deps = createGhostPipelineDeps({
      win,
      gyro: makeGyro(),
      getDisplayWidth: () => 412,
      getDisplayHeight: () => 915,
    })

    expect(deps.getBeta?.()).toBeNull()
    expect(deps.getOrientation?.()).toBeNull()

    fireDeviceOrientation(win, { alpha: 10, beta: 20, gamma: 30 })

    expect(deps.getBeta?.()).toBe(20)
    expect(deps.getOrientation?.()).toEqual({ alpha: 10, beta: 20, gamma: 30 })
  })

  it('keeps the previous complete orientation sample when an event has null angles', () => {
    const win = makeWindow()
    const deps = createGhostPipelineDeps({
      win,
      gyro: makeGyro(),
      getDisplayWidth: () => 412,
      getDisplayHeight: () => 915,
    })

    fireDeviceOrientation(win, { alpha: 10, beta: 20, gamma: 30 })
    fireDeviceOrientation(win, { alpha: null, beta: 21, gamma: 31 })

    expect(deps.getBeta?.()).toBe(21)
    expect(deps.getOrientation?.()).toEqual({ alpha: 10, beta: 20, gamma: 30 })
  })

  it('removes the deviceorientation listener on dispose', () => {
    const win = makeWindow()
    const deps = createGhostPipelineDeps({
      win,
      gyro: makeGyro(),
      getDisplayWidth: () => 412,
      getDisplayHeight: () => 915,
    })
    const handler = vi.mocked(win.addEventListener).mock.calls.find(([type]) => type === 'deviceorientation')?.[1]

    deps.dispose()

    expect(win.removeEventListener).toHaveBeenCalledWith('deviceorientation', handler)
  })
})
