import { debugLogger } from './logger'
import type { DebugLogger } from './logger'

export class DebugPanel {
  private readonly logger: DebugLogger
  private readonly btn: HTMLButtonElement | null = null

  constructor(container: HTMLElement = document.body, logger: DebugLogger = debugLogger) {
    this.logger = logger
    if (!logger.enabled) return

    this.btn = document.createElement('button')
    this.btn.textContent = 'Export logs'
    this.btn.setAttribute('aria-label', 'Export logs')
    this.btn.className = 'debug-panel-btn'
    Object.assign(this.btn.style, {
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: '9999',
      padding: '0.5rem 1rem',
      background: '#1a1a1a',
      color: '#fff',
      border: 'none',
      borderRadius: '0.25rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      opacity: '0.85',
    })
    this.btn.addEventListener('click', this.handleClick)
    container.appendChild(this.btn)
  }

  private handleClick = (): void => {
    const json = this.logger.export()
    const ts = new Date().toISOString().replace(/[T:.]/g, '-')
    const filename = `miblioteca-debug-${ts}.json`
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  destroy(): void {
    this.btn?.removeEventListener('click', this.handleClick)
    this.btn?.remove()
  }
}
