import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebugPanel } from './DebugPanel'
import { DebugLogger } from './logger'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function enabled() {
  return new DebugLogger(new URLSearchParams('debug'))
}

function disabled() {
  return new DebugLogger(new URLSearchParams(''))
}

describe('DebugPanel — enabled', () => {
  it('renders Export logs button', () => {
    new DebugPanel(container, enabled())
    expect(screen.getByRole('button', { name: 'Export logs' })).toBeInTheDocument()
  })

  it('button has aria-label="Export logs"', () => {
    new DebugPanel(container, enabled())
    expect(screen.getByRole('button', { name: 'Export logs' })).toHaveAttribute('aria-label', 'Export logs')
  })

  it('click triggers download with miblioteca-debug-*.json filename', async () => {
    const user = userEvent.setup()
    const logger = enabled()
    logger.log('test:event', { x: 1 })

    const mockUrl = 'blob:mock'
    const createObjectURL = vi.fn().mockReturnValue(mockUrl)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    let capturedAnchor: HTMLAnchorElement | null = null
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement
        vi.spyOn(capturedAnchor, 'click').mockImplementation(() => {})
      }
      return el
    })

    new DebugPanel(container, logger)
    await user.click(screen.getByRole('button', { name: 'Export logs' }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/json')

    expect(capturedAnchor).not.toBeNull()
    expect((capturedAnchor as HTMLAnchorElement).download).toMatch(/^miblioteca-debug-.+\.json$/)
    expect((capturedAnchor as HTMLAnchorElement).href).toBe(mockUrl)
  })

  it('destroy() removes button from DOM', () => {
    const panel = new DebugPanel(container, enabled())
    expect(screen.getByRole('button', { name: 'Export logs' })).toBeInTheDocument()
    panel.destroy()
    expect(screen.queryByRole('button', { name: 'Export logs' })).not.toBeInTheDocument()
  })
})

describe('DebugPanel — disabled', () => {
  it('renders no button', () => {
    new DebugPanel(container, disabled())
    expect(screen.queryByRole('button', { name: 'Export logs' })).not.toBeInTheDocument()
  })

  it('destroy() is safe when no button was rendered', () => {
    const panel = new DebugPanel(container, disabled())
    expect(() => panel.destroy()).not.toThrow()
  })
})
