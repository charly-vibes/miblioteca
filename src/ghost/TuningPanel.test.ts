import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultTuningConfig } from './tuningConfig'
import { TuningPanel } from './TuningPanel'
import { DebugLogger } from '../debug/logger'

function makePanel(logger?: DebugLogger) {
  const config = defaultTuningConfig()
  const onChange = vi.fn()
  const panel = new TuningPanel(document, config, onChange, logger)
  document.body.appendChild(panel.el)
  return { panel, config, onChange }
}

function eventsFrom(logger: DebugLogger): Array<{ type: string; payload: unknown }> {
  return (JSON.parse(logger.export()) as { events: Array<{ type: string; payload: unknown }> }).events
}

describe('TuningPanel Pixel 7a layout and controls', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Pixel 7a-friendly touch target, drawer height, opacity, and slider grid', () => {
    const { panel } = makePanel()
    const toggle = panel.el.querySelector('[data-testid="tuning-toggle"]') as HTMLElement
    const body = panel.el.querySelector('[data-testid="tuning-panel"]') as HTMLElement
    const sliderRow = panel.el.querySelector('[data-testid="tuning-slider-stillThreshold"]') as HTMLElement
    const modelBtns = Array.from(panel.el.querySelectorAll('button[data-model]')) as HTMLButtonElement[]
    const sectionResets = Array.from(panel.el.querySelectorAll('[data-testid^="tuning-section-reset-"]')) as HTMLButtonElement[]
    const globalReset = panel.el.querySelector('[data-testid="tuning-reset"]') as HTMLButtonElement

    expect(toggle.style.width).toBe('48px')
    expect(toggle.style.height).toBe('48px')
    expect(body.style.maxHeight).toBe('40vh')
    expect(body.style.background).toBe('rgba(0, 0, 0, 0.88)')
    expect(sliderRow.style.gridTemplateColumns).toBe('80px 1fr 60px')

    // All interactive elements ≥ 44px tall (WCAG 2.5.5)
    for (const btn of modelBtns) {
      expect(Number.parseInt(btn.style.minHeight)).toBeGreaterThanOrEqual(44)
    }
    for (const btn of sectionResets) {
      expect(Number.parseInt(btn.style.minHeight)).toBeGreaterThanOrEqual(44)
    }
    expect(Number.parseInt(globalReset.style.minHeight)).toBeGreaterThanOrEqual(44)

    // Horizontal padding ≥ 12px on model buttons and resets for ≥ 44px width
    for (const btn of modelBtns) {
      const [, px] = btn.style.padding.split(' ')
      expect(Number.parseInt(px)).toBeGreaterThanOrEqual(16)
    }
    expect(Number.parseInt(globalReset.style.padding.split(' ')[1])).toBeGreaterThanOrEqual(16)
  })

  it('renders motion gate physics sliders', () => {
    const { panel } = makePanel()

    expect(panel.el.querySelector('input[data-param="motionGateShowRadS"]')).toBeInstanceOf(HTMLInputElement)
    expect(panel.el.querySelector('input[data-param="motionGateHideRadS"]')).toBeInstanceOf(HTMLInputElement)
  })

  it('uses accordion sections with only one section open at a time', () => {
    const { panel } = makePanel()
    const sensitivityBody = panel.el.querySelector('[data-testid="tuning-section-body-Sensitivity"]') as HTMLElement
    const gateBody = panel.el.querySelector('[data-testid="tuning-section-body-Capture Gate"]') as HTMLElement
    const gateHeader = panel.el.querySelector('[data-testid="tuning-section-toggle-Capture Gate"]') as HTMLElement

    expect(sensitivityBody.style.display).toBe('')
    expect(gateBody.style.display).toBe('none')

    gateHeader.click()

    expect(sensitivityBody.style.display).toBe('none')
    expect(gateBody.style.display).toBe('')
  })

  it('renders sensitivity sliders for gyro and translation gain', () => {
    const { panel } = makePanel()

    expect(panel.el.querySelector('input[data-param="gyroSensitivity"]')).toBeInstanceOf(HTMLInputElement)
    expect(panel.el.querySelector('input[data-param="translationSensitivity"]')).toBeInstanceOf(HTMLInputElement)
    expect(panel.el.querySelector('input[data-param="workingDistanceCm"]')).toBeInstanceOf(HTMLInputElement)
  })

  it('renders tilt max guard and stillness gate threshold sliders', () => {
    const { panel } = makePanel()

    expect(panel.el.querySelector('input[data-param="tiltMaxDeg"]')).toBeInstanceOf(HTMLInputElement)
    expect(panel.el.querySelector('input[data-param="stillnessGateThreshold"]')).toBeInstanceOf(HTMLInputElement)
  })

  it('reset all refreshes each slider by data-param and updates values', () => {
    const { panel, config } = makePanel()
    const movingGain = panel.el.querySelector('input[data-param="movingGain"]') as HTMLInputElement
    const maxShift = panel.el.querySelector('input[data-param="maxShiftXPx"]') as HTMLInputElement
    movingGain.value = '0.5'
    maxShift.value = '150'
    config.movingGain = 0.5
    config.maxShiftXPx = 150

    ;(panel.el.querySelector('[data-testid="tuning-reset"]') as HTMLElement).click()

    expect(movingGain.value).toBe(String(defaultTuningConfig().movingGain))
    expect(maxShift.value).toBe(String(defaultTuningConfig().maxShiftXPx))
  })

  it('per-section reset only restores that section', () => {
    const { panel, config } = makePanel()
    config.movingGain = 0.5
    config.maxShiftXPx = 150

    ;(panel.el.querySelector('[data-testid="tuning-section-reset-Orientation"]') as HTMLElement).click()

    expect(config.movingGain).toBe(defaultTuningConfig().movingGain)
    expect(config.maxShiftXPx).toBe(150)
  })
})

describe('TuningPanel debug-log emission', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits tuning:change on slider commit with prev/next/key', () => {
    const logger = new DebugLogger(new URLSearchParams('debug'))
    const { panel, config } = makePanel(logger)
    const prev = config.gyroSensitivity
    const slider = panel.el.querySelector('input[data-param="gyroSensitivity"]') as HTMLInputElement

    slider.value = '2.5'
    slider.dispatchEvent(new Event('input'))
    slider.dispatchEvent(new Event('change'))

    const changes = eventsFrom(logger).filter(e => e.type === 'tuning:change')
    expect(changes).toHaveLength(1)
    expect(changes[0].payload).toEqual({ key: 'gyroSensitivity', prev, next: 2.5 })
  })

  it('does not emit when slider commits with unchanged value', () => {
    const logger = new DebugLogger(new URLSearchParams('debug'))
    const { panel, config } = makePanel(logger)
    const slider = panel.el.querySelector('input[data-param="gyroSensitivity"]') as HTMLInputElement

    slider.value = String(config.gyroSensitivity)
    slider.dispatchEvent(new Event('change'))

    expect(eventsFrom(logger).filter(e => e.type === 'tuning:change')).toHaveLength(0)
  })

  it('emits tuning:change on orientation model toggle with prev/next', () => {
    const logger = new DebugLogger(new URLSearchParams('debug'))
    const { panel } = makePanel(logger)
    const absoluteBtn = panel.el.querySelector('button[data-model="absolute"]') as HTMLButtonElement
    absoluteBtn.click()

    const changes = eventsFrom(logger).filter(e => e.type === 'tuning:change')
    expect(changes).toHaveLength(1)
    expect(changes[0].payload).toEqual({ key: 'orientationModel', prev: 'gyro', next: 'absolute' })
  })

  it('emits tuning:section-reset with section title and per-key changes', () => {
    const logger = new DebugLogger(new URLSearchParams('debug'))
    const { panel, config } = makePanel(logger)
    config.movingGain = 0.5
    config.stillGain = 0.2
    ;(panel.el.querySelector('[data-testid="tuning-section-reset-Orientation"]') as HTMLElement).click()

    const resets = eventsFrom(logger).filter(e => e.type === 'tuning:section-reset')
    expect(resets).toHaveLength(1)
    const payload = resets[0].payload as { section: string; changes: Array<{ key: string }> }
    expect(payload.section).toBe('Orientation')
    expect(payload.changes.map(c => c.key)).toEqual(expect.arrayContaining(['movingGain', 'stillGain']))
  })

  it('emits tuning:reset with full change list on Reset defaults', () => {
    const logger = new DebugLogger(new URLSearchParams('debug'))
    const { panel, config } = makePanel(logger)
    config.movingGain = 0.5
    config.hFovDeg = 75

    ;(panel.el.querySelector('[data-testid="tuning-reset"]') as HTMLElement).click()

    const resets = eventsFrom(logger).filter(e => e.type === 'tuning:reset')
    expect(resets).toHaveLength(1)
    const keys = (resets[0].payload as { changes: Array<{ key: string }> }).changes.map(c => c.key)
    expect(keys).toEqual(expect.arrayContaining(['movingGain', 'hFovDeg']))
  })

  it('exposes hybrid in the orientationModel selector and persists the choice', () => {
    const { panel, config } = makePanel()
    const buttons = Array.from(panel.el.querySelectorAll('button[data-model]')) as HTMLButtonElement[]
    const labels = buttons.map(b => b.dataset.model)
    expect(labels).toEqual(['gyro', 'absolute', 'hybrid'])

    const hybridBtn = buttons.find(b => b.dataset.model === 'hybrid')!
    hybridBtn.click()
    expect(config.orientationModel).toBe('hybrid')
  })

  it('logs nothing when no logger is provided', () => {
    const { panel } = makePanel()
    const slider = panel.el.querySelector('input[data-param="gyroSensitivity"]') as HTMLInputElement
    slider.value = '2.5'
    slider.dispatchEvent(new Event('input'))
    slider.dispatchEvent(new Event('change'))
    // no logger → no throw; verified by absence of TypeError
    expect(true).toBe(true)
  })
})
