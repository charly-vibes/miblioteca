import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultTuningConfig } from './tuningConfig'
import { TuningPanel } from './TuningPanel'

function makePanel() {
  const config = defaultTuningConfig()
  const onChange = vi.fn()
  const panel = new TuningPanel(document, config, onChange)
  document.body.appendChild(panel.el)
  return { panel, config, onChange }
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

    expect(toggle.style.width).toBe('48px')
    expect(toggle.style.height).toBe('48px')
    expect(body.style.maxHeight).toBe('40vh')
    expect(body.style.background).toBe('rgba(0, 0, 0, 0.88)')
    expect(sliderRow.style.gridTemplateColumns).toBe('80px 1fr 60px')
  })

  it('renders motion gate physics sliders', () => {
    const { panel } = makePanel()

    expect(panel.el.querySelector('input[data-param="motionGateShowRadS"]')).toBeInstanceOf(HTMLInputElement)
    expect(panel.el.querySelector('input[data-param="motionGateHideRadS"]')).toBeInstanceOf(HTMLInputElement)
  })

  it('uses accordion sections with only one section open at a time', () => {
    const { panel } = makePanel()
    const orientationBody = panel.el.querySelector('[data-testid="tuning-section-body-Orientation"]') as HTMLElement
    const gateBody = panel.el.querySelector('[data-testid="tuning-section-body-Capture Gate"]') as HTMLElement
    const gateHeader = panel.el.querySelector('[data-testid="tuning-section-toggle-Capture Gate"]') as HTMLElement

    expect(orientationBody.style.display).toBe('')
    expect(gateBody.style.display).toBe('none')

    gateHeader.click()

    expect(orientationBody.style.display).toBe('none')
    expect(gateBody.style.display).toBe('')
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
