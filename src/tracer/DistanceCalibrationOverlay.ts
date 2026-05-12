import { WORKING_DISTANCE_MIN_CM, WORKING_DISTANCE_MAX_CM } from '../sensors/ghostOverlayCanvas'

export type DistanceCalibrationOverlayDeps = {
  viewfinderWidthPx: number
  hFovDeg: number
  onDone: (distanceCm: number) => void
  onCancel: () => void
}

const CREDIT_CARD_CM = 8.56
const PAPERBACK_CM = 13.0

const PRESETS: Array<{ key: string; label: string; widthCm: number }> = [
  { key: 'credit-card', label: 'Credit card (8.56 cm)', widthCm: CREDIT_CARD_CM },
  { key: 'paperback',   label: 'Paperback (13 cm)',     widthCm: PAPERBACK_CM },
]

const BRACKET_DEFAULT_PX = 100
const BRACKET_MIN_PX = 20
const BRACKET_MAX_PX = 800

export class DistanceCalibrationOverlay {
  private readonly el: HTMLDivElement
  private readonly bracket: HTMLDivElement
  private readonly readout: HTMLDivElement
  private bracketWidthPx: number = BRACKET_DEFAULT_PX
  private selectedPresetWidthCm: number = CREDIT_CARD_CM
  private readonly focalLengthPx: number
  // Stored so destroy() can remove them before the element is removed.
  private readonly boundPointerMove: (e: PointerEvent) => void
  private readonly boundPointerUp: (e: PointerEvent) => void

  constructor(container: HTMLElement, deps: DistanceCalibrationOverlayDeps) {
    const hFovRad = (deps.hFovDeg * Math.PI) / 180
    this.focalLengthPx = (deps.viewfinderWidthPx / 2) / Math.tan(hFovRad / 2)

    this.el = document.createElement('div')
    this.el.setAttribute('data-testid', 'distance-cal-overlay')
    this.el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999'

    // Outer element provides a 44px touch target; inner bar is the visual bracket.
    this.bracket = document.createElement('div')
    this.bracket.setAttribute('data-testid', 'distance-cal-bracket')
    this.bracket.style.cssText = `display:flex;align-items:center;justify-content:center;height:44px;width:${this.bracketWidthPx}px;cursor:ew-resize;touch-action:none`
    const bracketBar = document.createElement('div')
    bracketBar.style.cssText = 'height:4px;background:#fff;width:100%;pointer-events:none'
    this.bracket.appendChild(bracketBar)

    this.readout = document.createElement('div')
    this.readout.setAttribute('data-testid', 'distance-cal-readout')
    this.readout.style.cssText = 'color:#fff;margin-top:8px;font-size:16px'
    this.updateReadout()

    const presetRow = document.createElement('div')
    presetRow.style.cssText = 'display:flex;gap:8px;margin-top:16px'
    PRESETS.forEach(p => {
      const btn = document.createElement('button')
      btn.setAttribute('data-testid', 'distance-cal-preset')
      btn.setAttribute('data-preset', p.key)
      btn.textContent = p.label
      btn.addEventListener('click', () => this.selectPreset(p))
      presetRow.appendChild(btn)
    })

    const actionRow = document.createElement('div')
    actionRow.style.cssText = 'display:flex;gap:8px;margin-top:16px'

    const cancelBtn = document.createElement('button')
    cancelBtn.setAttribute('data-testid', 'distance-cal-cancel')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.addEventListener('click', () => {
      this.destroy()
      deps.onCancel()
    })

    const doneBtn = document.createElement('button')
    doneBtn.setAttribute('data-testid', 'distance-cal-done')
    doneBtn.textContent = 'Done'
    doneBtn.addEventListener('click', () => {
      const distanceCm = this.computeDistanceCm()
      this.destroy()
      deps.onDone(distanceCm)
    })

    actionRow.appendChild(cancelBtn)
    actionRow.appendChild(doneBtn)

    this.el.appendChild(this.bracket)
    this.el.appendChild(this.readout)
    this.el.appendChild(presetRow)
    this.el.appendChild(actionRow)

    // Wire pointer drag (handles mouse, touch, and stylus via Pointer Events API).
    let startX = 0
    let startWidth = 0
    this.boundPointerMove = (e: PointerEvent) => {
      if (!this.bracket.hasPointerCapture(e.pointerId)) return
      this.setBracketWidthPx(startWidth + (e.clientX - startX))
    }
    this.boundPointerUp = (e: PointerEvent) => {
      this.bracket.releasePointerCapture(e.pointerId)
    }
    this.bracket.addEventListener('pointerdown', (e: PointerEvent) => {
      this.bracket.setPointerCapture(e.pointerId)
      startX = e.clientX
      startWidth = this.bracketWidthPx
    })
    this.bracket.addEventListener('pointermove', this.boundPointerMove)
    this.bracket.addEventListener('pointerup', this.boundPointerUp)

    container.appendChild(this.el)
  }

  private selectPreset(p: { key: string; label: string; widthCm: number }) {
    this.selectedPresetWidthCm = p.widthCm
    this.updateReadout()
  }

  private updateReadout() {
    const distCm = this.computeDistanceCm()
    const presetLabel = PRESETS.find(p => p.widthCm === this.selectedPresetWidthCm)?.label ?? ''
    this.readout.textContent = `${presetLabel} → ~${distCm.toFixed(0)} cm away`
  }

  private computeDistanceCm(): number {
    const refWidthM = this.selectedPresetWidthCm / 100
    const distM = (this.focalLengthPx * refWidthM) / this.bracketWidthPx
    const distCm = distM * 100
    return Math.max(WORKING_DISTANCE_MIN_CM, Math.min(WORKING_DISTANCE_MAX_CM, distCm))
  }

  /** Test hook — allows tests to drive bracketWidthPx without simulating pointer events. */
  setBracketWidthPx(px: number) {
    this.bracketWidthPx = Math.max(BRACKET_MIN_PX, Math.min(BRACKET_MAX_PX, px))
    this.bracket.style.width = `${this.bracketWidthPx}px`
    this.updateReadout()
  }

  destroy() {
    this.bracket.removeEventListener('pointermove', this.boundPointerMove)
    this.bracket.removeEventListener('pointerup', this.boundPointerUp)
    this.el.remove()
  }
}
