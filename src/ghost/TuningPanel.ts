import type { TuningConfig, OrientationModel } from './tuningConfig'
import { defaultTuningConfig, saveTuningConfig } from './tuningConfig'

type ParamDef = {
  key: keyof TuningConfig & string
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

const ORIENTATION_PARAMS: ParamDef[] = [
  { key: 'stillThreshold', label: 'Still thresh', min: 0.01, max: 0.3, step: 0.005, unit: 'rad/s' },
  { key: 'stillEmaAlpha', label: 'Still EMA α', min: 0.5, max: 0.99, step: 0.01 },
  { key: 'yawDeadbandRad', label: 'Yaw deadband', min: 0, max: 0.05, step: 0.001, unit: 'rad' },
  { key: 'pitchDeadbandRad', label: 'Pitch deadband', min: 0, max: 0.05, step: 0.001, unit: 'rad' },
  { key: 'stillGain', label: 'Still gain', min: 0.005, max: 0.3, step: 0.005 },
  { key: 'movingGain', label: 'Moving gain', min: 0.01, max: 0.5, step: 0.01 },
  { key: 'maxShiftRateRadS', label: 'Max rate', min: 0.05, max: 3.0, step: 0.05, unit: 'rad/s' },
]

const GATE_PARAMS: ParamDef[] = [
  { key: 'maxShiftXPx', label: 'Gate shift X', min: 5, max: 150, step: 5, unit: 'px' },
  { key: 'maxMagPx', label: 'Gate mag', min: 5, max: 200, step: 5, unit: 'px' },
]

const PHYSICS_PARAMS: ParamDef[] = [
  { key: 'hFovDeg', label: 'H FOV', min: 15, max: 90, step: 1, unit: '°' },
  { key: 'zuptThresholdMs2', label: 'ZUPT thresh', min: 0.01, max: 1.0, step: 0.01, unit: 'm/s²' },
  { key: 'zuptTauS', label: 'ZUPT τ', min: 0.02, max: 2.0, step: 0.02, unit: 's' },
]

export class TuningPanel {
  readonly el: HTMLElement
  private panelBody: HTMLElement
  private toggleBtn: HTMLElement
  private open = false
  private readonly valueDisplays = new Map<string, HTMLElement>()

  constructor(
    private readonly doc: Document,
    private readonly config: TuningConfig,
    private readonly onChange: () => void,
  ) {
    this.el = doc.createElement('div')
    this.toggleBtn = this.buildToggle()
    this.panelBody = this.buildPanel()
    this.el.appendChild(this.toggleBtn)
    this.el.appendChild(this.panelBody)
  }

  private buildToggle(): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.textContent = '⚙'
    btn.setAttribute('data-testid', 'tuning-toggle')
    Object.assign(btn.style, {
      position: 'fixed', bottom: '12px', left: '12px',
      width: '40px', height: '40px', borderRadius: '50%',
      border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
      fontSize: '20px', cursor: 'pointer', zIndex: '20',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    })
    btn.addEventListener('click', () => {
      this.open = !this.open
      this.panelBody.style.display = this.open ? '' : 'none'
      btn.textContent = this.open ? '✕' : '⚙'
    })
    return btn
  }

  private buildPanel(): HTMLElement {
    const panel = this.doc.createElement('div')
    panel.setAttribute('data-testid', 'tuning-panel')
    Object.assign(panel.style, {
      position: 'fixed', bottom: '60px', left: '0', right: '0',
      maxHeight: '55vh', overflowY: 'auto', overflowX: 'hidden',
      background: 'rgba(0,0,0,0.85)', color: '#eee',
      fontFamily: 'monospace', fontSize: '12px',
      padding: '8px 10px', zIndex: '19',
      display: 'none',
      WebkitOverflowScrolling: 'touch',
    })

    panel.appendChild(this.buildModelToggle())
    panel.appendChild(this.buildSection('Orientation', ORIENTATION_PARAMS))
    panel.appendChild(this.buildSection('Capture Gate', GATE_PARAMS))
    panel.appendChild(this.buildSection('Physics', PHYSICS_PARAMS))
    panel.appendChild(this.buildResetBtn())

    return panel
  }

  private buildModelToggle(): HTMLElement {
    const row = this.doc.createElement('div')
    Object.assign(row.style, { display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' })

    const label = this.doc.createElement('span')
    label.textContent = 'Model:'
    label.style.marginRight = '4px'
    row.appendChild(label)

    const models: OrientationModel[] = ['gyro', 'absolute']
    for (const model of models) {
      const btn = this.doc.createElement('button')
      btn.textContent = model
      btn.setAttribute('data-model', model)
      Object.assign(btn.style, {
        padding: '4px 10px', border: '1px solid #666', borderRadius: '4px',
        background: this.config.orientationModel === model ? '#06f' : '#333',
        color: '#fff', cursor: 'pointer', fontSize: '12px',
      })
      btn.addEventListener('click', () => {
        this.config.orientationModel = model
        row.querySelectorAll('button[data-model]').forEach(b => {
          ;(b as HTMLElement).style.background = (b as HTMLElement).dataset.model === model ? '#06f' : '#333'
        })
        this.save()
      })
      row.appendChild(btn)
    }

    return row
  }

  private buildSection(title: string, params: ParamDef[]): HTMLElement {
    const section = this.doc.createElement('div')
    section.style.marginBottom = '8px'

    const heading = this.doc.createElement('div')
    heading.textContent = title
    Object.assign(heading.style, { fontWeight: 'bold', fontSize: '11px', color: '#aaa', marginBottom: '4px' })
    section.appendChild(heading)

    for (const p of params) {
      section.appendChild(this.buildSlider(p))
    }
    return section
  }

  private buildSlider(p: ParamDef): HTMLElement {
    const row = this.doc.createElement('div')
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '90px 1fr 55px',
      alignItems: 'center', gap: '4px', marginBottom: '2px',
    })

    const label = this.doc.createElement('span')
    label.textContent = p.label
    label.style.fontSize = '11px'

    const input = this.doc.createElement('input')
    input.type = 'range'
    input.min = String(p.min)
    input.max = String(p.max)
    input.step = String(p.step)
    input.value = String(this.config[p.key])
    Object.assign(input.style, { width: '100%', height: '20px', cursor: 'pointer' })

    const valSpan = this.doc.createElement('span')
    valSpan.style.fontSize = '11px'
    valSpan.style.textAlign = 'right'
    this.updateValueDisplay(valSpan, p)
    this.valueDisplays.set(p.key, valSpan)

    input.addEventListener('input', () => {
      ;(this.config as Record<string, unknown>)[p.key] = parseFloat(input.value)
      this.updateValueDisplay(valSpan, p)
      this.save()
    })

    row.appendChild(label)
    row.appendChild(input)
    row.appendChild(valSpan)
    return row
  }

  private updateValueDisplay(el: HTMLElement, p: ParamDef): void {
    const v = this.config[p.key] as number
    const decimals = p.step < 0.01 ? 3 : p.step < 0.1 ? 2 : p.step < 1 ? 1 : 0
    el.textContent = `${v.toFixed(decimals)}${p.unit ? ' ' + p.unit : ''}`
  }

  private buildResetBtn(): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.textContent = 'Reset defaults'
    btn.setAttribute('data-testid', 'tuning-reset')
    Object.assign(btn.style, {
      marginTop: '6px', padding: '4px 12px',
      border: '1px solid #666', borderRadius: '4px',
      background: '#333', color: '#fff', cursor: 'pointer', fontSize: '11px',
    })
    btn.addEventListener('click', () => {
      const defaults = defaultTuningConfig()
      Object.assign(this.config, defaults)
      this.refreshAllSliders()
      this.save()
    })
    return btn
  }

  private refreshAllSliders(): void {
    const allParams = [...ORIENTATION_PARAMS, ...GATE_PARAMS, ...PHYSICS_PARAMS]
    for (const input of this.panelBody.querySelectorAll('input[type="range"]')) {
      const el = input as HTMLInputElement
      const param = allParams.find(p => String(this.config[p.key]) !== el.value)
      if (param) {
        el.value = String(this.config[param.key])
      }
    }
    for (const p of allParams) {
      const disp = this.valueDisplays.get(p.key)
      if (disp) this.updateValueDisplay(disp, p)
    }
    this.panelBody.querySelectorAll('button[data-model]').forEach(b => {
      ;(b as HTMLElement).style.background = (b as HTMLElement).dataset.model === this.config.orientationModel ? '#06f' : '#333'
    })
  }

  private save(): void {
    saveTuningConfig(this.config)
    this.onChange()
  }
}
