import type { TuningConfig, OrientationModel } from './tuningConfig'
import { defaultTuningConfig, saveTuningConfig } from './tuningConfig'
import type { DebugLogger } from '../debug/logger'

type ParamDef = {
  key: keyof TuningConfig & string
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

const SENSITIVITY_PARAMS: ParamDef[] = [
  { key: 'gyroSensitivity', label: 'Gyro sens', min: 0.25, max: 4.0, step: 0.05, unit: '×' },
  { key: 'translationSensitivity', label: 'Trans sens', min: 0.25, max: 8.0, step: 0.05, unit: '×' },
  { key: 'workingDistanceCm', label: 'Distance', min: 20, max: 150, step: 5, unit: 'cm' },
]

const ORIENTATION_PARAMS: ParamDef[] = [
  { key: 'stillThreshold', label: 'Still thresh', min: 0.01, max: 0.3, step: 0.005, unit: 'rad/s' },
  { key: 'stillEmaAlpha', label: 'Still EMA α', min: 0.5, max: 0.99, step: 0.01 },
  { key: 'stillnessGateThreshold', label: 'Stillness gate', min: 0.5, max: 0.99, step: 0.01 },
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
  { key: 'motionGateShowRadS', label: 'Gate show ω', min: 0.05, max: 2.0, step: 0.05, unit: 'rad/s' },
  { key: 'motionGateHideRadS', label: 'Gate hide ω', min: 0.05, max: 2.0, step: 0.05, unit: 'rad/s' },
  { key: 'tiltMaxDeg', label: 'Tilt max', min: 10, max: 90, step: 1, unit: '°' },
]

export class TuningPanel {
  readonly el: HTMLElement
  private panelBody: HTMLElement
  private toggleBtn: HTMLElement
  private open = false
  private readonly valueDisplays = new Map<string, HTMLElement>()
  private readonly sectionBodies = new Map<string, HTMLElement>()
  private readonly committed = new Map<string, number>()

  constructor(
    private readonly doc: Document,
    private readonly config: TuningConfig,
    private readonly onChange: () => void,
    private readonly logger?: DebugLogger,
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
      width: '48px', height: '48px', borderRadius: '50%',
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
      position: 'fixed', bottom: '68px', left: '0', right: '0',
      maxHeight: '40vh', overflowY: 'auto', overflowX: 'hidden',
      background: 'rgba(0,0,0,0.88)', color: '#eee',
      fontFamily: 'monospace', fontSize: '12px',
      padding: '8px 10px', zIndex: '19',
      display: 'none',
      WebkitOverflowScrolling: 'touch',
    })

    panel.appendChild(this.buildModelToggle())
    panel.appendChild(this.buildSection('Sensitivity', SENSITIVITY_PARAMS))
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
        const prev = this.config.orientationModel
        if (prev === model) return
        this.config.orientationModel = model
        row.querySelectorAll('button[data-model]').forEach(b => {
          ;(b as HTMLElement).style.background = (b as HTMLElement).dataset.model === model ? '#06f' : '#333'
        })
        this.logger?.log('tuning:change', { key: 'orientationModel', prev, next: model })
        this.save()
      })
      row.appendChild(btn)
    }

    return row
  }

  private buildSection(title: string, params: ParamDef[]): HTMLElement {
    const section = this.doc.createElement('div')
    section.style.marginBottom = '8px'

    const header = this.doc.createElement('div')
    Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' })

    const heading = this.doc.createElement('button')
    heading.type = 'button'
    heading.textContent = title
    heading.setAttribute('data-testid', `tuning-section-toggle-${title}`)
    Object.assign(heading.style, {
      flex: '1', textAlign: 'left', fontWeight: 'bold', fontSize: '11px',
      color: '#aaa', background: 'transparent', border: '0', padding: '4px 0', cursor: 'pointer',
    })
    heading.addEventListener('click', () => this.openSection(title))

    const reset = this.doc.createElement('button')
    reset.type = 'button'
    reset.textContent = 'Reset'
    reset.setAttribute('data-testid', `tuning-section-reset-${title}`)
    Object.assign(reset.style, {
      padding: '3px 8px', border: '1px solid #666', borderRadius: '4px',
      background: '#333', color: '#fff', cursor: 'pointer', fontSize: '10px',
    })
    reset.addEventListener('click', () => {
      const defaults = defaultTuningConfig()
      const changes: Array<{ key: string; prev: number; next: number }> = []
      for (const p of params) {
        const prev = this.config[p.key] as number
        const next = defaults[p.key] as number
        if (prev !== next) changes.push({ key: p.key, prev, next })
        ;(this.config as Record<string, unknown>)[p.key] = next
        this.committed.set(p.key, next)
      }
      this.refreshAllSliders()
      if (changes.length) this.logger?.log('tuning:section-reset', { section: title, changes })
      this.save()
    })

    header.appendChild(heading)
    header.appendChild(reset)
    section.appendChild(header)

    const body = this.doc.createElement('div')
    body.setAttribute('data-testid', `tuning-section-body-${title}`)
    body.style.display = this.sectionBodies.size === 0 ? '' : 'none'
    for (const p of params) {
      body.appendChild(this.buildSlider(p))
    }
    this.sectionBodies.set(title, body)
    section.appendChild(body)
    return section
  }

  private openSection(title: string): void {
    for (const [name, body] of this.sectionBodies) {
      body.style.display = name === title ? '' : 'none'
    }
    const opened = this.sectionBodies.get(title)
    if (typeof opened?.scrollIntoView === 'function') {
      opened.scrollIntoView({ block: 'nearest' })
    }
  }

  private buildSlider(p: ParamDef): HTMLElement {
    const row = this.doc.createElement('div')
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '80px 1fr 60px',
      alignItems: 'center', gap: '4px', marginBottom: '2px',
    })

    const label = this.doc.createElement('span')
    label.textContent = p.label
    label.style.fontSize = '11px'

    row.setAttribute('data-testid', `tuning-slider-${p.key}`)

    const input = this.doc.createElement('input')
    input.type = 'range'
    input.dataset.param = p.key
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
    this.committed.set(p.key, this.config[p.key] as number)

    input.addEventListener('input', () => {
      ;(this.config as Record<string, unknown>)[p.key] = parseFloat(input.value)
      this.updateValueDisplay(valSpan, p)
      this.save()
    })
    input.addEventListener('change', () => {
      const prev = this.committed.get(p.key) ?? this.config[p.key] as number
      const next = this.config[p.key] as number
      if (prev !== next) {
        this.logger?.log('tuning:change', { key: p.key, prev, next })
        this.committed.set(p.key, next)
      }
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
      const changes: Array<{ key: string; prev: unknown; next: unknown }> = []
      for (const k of Object.keys(defaults) as Array<keyof TuningConfig>) {
        const prev = (this.config as Record<string, unknown>)[k]
        const next = (defaults as Record<string, unknown>)[k]
        if (prev !== next) changes.push({ key: k, prev, next })
      }
      Object.assign(this.config, defaults)
      for (const [k, v] of Object.entries(defaults)) {
        if (typeof v === 'number') this.committed.set(k, v)
      }
      this.refreshAllSliders()
      if (changes.length) this.logger?.log('tuning:reset', { changes })
      this.save()
    })
    return btn
  }

  private refreshAllSliders(): void {
    const allParams = [...SENSITIVITY_PARAMS, ...ORIENTATION_PARAMS, ...GATE_PARAMS, ...PHYSICS_PARAMS]
    for (const input of this.panelBody.querySelectorAll('input[type="range"]')) {
      const el = input as HTMLInputElement
      const key = el.dataset.param as keyof TuningConfig | undefined
      const param = allParams.find(p => p.key === key)
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
