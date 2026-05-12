import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DistanceCalibrationOverlay } from './DistanceCalibrationOverlay'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

function makeOverlay(opts: {
  viewfinderWidthPx?: number
  hFovDeg?: number
  onDone?: (distanceCm: number) => void
  onCancel?: () => void
} = {}) {
  return new DistanceCalibrationOverlay(container, {
    viewfinderWidthPx: opts.viewfinderWidthPx ?? 640,
    hFovDeg: opts.hFovDeg ?? 60,
    onDone: opts.onDone ?? vi.fn(),
    onCancel: opts.onCancel ?? vi.fn(),
  })
}

describe('DistanceCalibrationOverlay', () => {
  describe('construction', () => {
    it('appends a fullscreen overlay element to the container', () => {
      makeOverlay()
      expect(container.querySelector('[data-testid="distance-cal-overlay"]')).not.toBeNull()
    })

    it('shows a resizable bracket element', () => {
      makeOverlay()
      expect(container.querySelector('[data-testid="distance-cal-bracket"]')).not.toBeNull()
    })

    it('shows a live cm readout', () => {
      makeOverlay()
      expect(container.querySelector('[data-testid="distance-cal-readout"]')).not.toBeNull()
    })

    it('shows credit-card and paperback preset buttons', () => {
      makeOverlay()
      const presets = container.querySelectorAll('[data-testid="distance-cal-preset"]')
      expect(presets).toHaveLength(2)
    })
  })

  describe('presets', () => {
    it('credit-card preset sets bracket to the credit-card reference width', () => {
      makeOverlay({ viewfinderWidthPx: 640, hFovDeg: 60 })
      const presets = container.querySelectorAll<HTMLElement>('[data-testid="distance-cal-preset"]')
      const ccBtn = Array.from(presets).find(el => el.dataset.preset === 'credit-card')
      ccBtn!.click()
      const readout = container.querySelector<HTMLElement>('[data-testid="distance-cal-readout"]')!
      expect(readout.textContent).toMatch(/credit card/i)
    })

    it('paperback preset sets bracket to the paperback reference width', () => {
      makeOverlay({ viewfinderWidthPx: 640, hFovDeg: 60 })
      const presets = container.querySelectorAll<HTMLElement>('[data-testid="distance-cal-preset"]')
      const pbBtn = Array.from(presets).find(el => el.dataset.preset === 'paperback')
      pbBtn!.click()
      const readout = container.querySelector<HTMLElement>('[data-testid="distance-cal-readout"]')!
      expect(readout.textContent).toMatch(/paperback/i)
    })
  })

  describe('distance computation', () => {
    it('onDone receives a positive finite distanceCm when Done is tapped', () => {
      const onDone = vi.fn()
      makeOverlay({ onDone })
      const doneBtn = container.querySelector<HTMLElement>('[data-testid="distance-cal-done"]')!
      doneBtn.click()
      expect(onDone).toHaveBeenCalledOnce()
      const result = onDone.mock.calls[0][0]
      expect(typeof result).toBe('number')
      expect(Number.isFinite(result)).toBe(true)
      expect(result).toBeGreaterThan(0)
    })

    it('computes correct distance for a known bracket/FOV setup', () => {
      // viewfinderWidth=640, hFovDeg=60 → focalLength = 320/tan(30°) ≈ 554.3 px
      // reference: credit card 0.0856 m
      // If bracketWidth is exactly focalLength * referenceWidth_m / distanceExpected_m,
      // then onDone should return ~distanceExpected_m * 100 cm
      // Suppose bracketWidth = focalLength * 0.0856 / 1.0 ≈ 47.5 px → distance = 100 cm
      const onDone = vi.fn()
      const overlay = makeOverlay({ viewfinderWidthPx: 640, hFovDeg: 60, onDone })
      // Set to credit-card preset
      const presets = container.querySelectorAll<HTMLElement>('[data-testid="distance-cal-preset"]')
      const ccBtn = Array.from(presets).find(el => el.dataset.preset === 'credit-card')!
      ccBtn.click()
      // Manually set bracket width to simulate 100 cm working distance
      // focalLength ≈ 554.3, refWidth = 0.0856 m → bracketWidth = 554.3 * 0.0856 / 1.0 ≈ 47.4 px
      ;(overlay as unknown as { setBracketWidthPx(px: number): void }).setBracketWidthPx(47.4)
      container.querySelector<HTMLElement>('[data-testid="distance-cal-done"]')!.click()
      expect(onDone).toHaveBeenCalledOnce()
      const distCm = onDone.mock.calls[0][0] as number
      expect(distCm).toBeCloseTo(100, 0)  // within 1 cm
    })
  })

  describe('cancel', () => {
    it('onCancel fires when Cancel is tapped', () => {
      const onCancel = vi.fn()
      makeOverlay({ onCancel })
      container.querySelector<HTMLElement>('[data-testid="distance-cal-cancel"]')!.click()
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('overlay is removed from DOM after cancel', () => {
      makeOverlay({ onCancel: () => {} })
      container.querySelector<HTMLElement>('[data-testid="distance-cal-cancel"]')!.click()
      expect(container.querySelector('[data-testid="distance-cal-overlay"]')).toBeNull()
    })
  })

  describe('destroy', () => {
    it('removes overlay from DOM when destroy() is called', () => {
      const overlay = makeOverlay()
      overlay.destroy()
      expect(container.querySelector('[data-testid="distance-cal-overlay"]')).toBeNull()
    })
  })
})

describe('distance formula edge cases', () => {
  it('bracketWidthPx clamped to minimum: does not divide by zero', () => {
    const onDone = vi.fn()
    const overlay = makeOverlay({ viewfinderWidthPx: 640, hFovDeg: 60, onDone })
    ;(overlay as unknown as { setBracketWidthPx(px: number): void }).setBracketWidthPx(0)
    container.querySelector<HTMLElement>('[data-testid="distance-cal-done"]')!.click()
    const distCm = onDone.mock.calls[0][0] as number
    expect(Number.isFinite(distCm)).toBe(true)
    expect(distCm).toBeGreaterThan(0)
    expect(distCm).toBeLessThanOrEqual(150)
  })
})

describe('GhostOverlayCanvas.setWorkingDistance', () => {
  it('setWorkingDistance method exists on GhostOverlayCanvas', async () => {
    const { GhostOverlayCanvas } = await import('../sensors/ghostOverlayCanvas')
    const vf = document.createElement('div')
    document.body.appendChild(vf)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    const overlay = new GhostOverlayCanvas(vf, { gyro: null, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, now: () => 0 })
    expect(typeof overlay.setWorkingDistance).toBe('function')
    overlay.setWorkingDistance(80)
    vf.remove()
  })
})
