import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountAppHeader } from './AppHeader'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  container.remove()
})

describe('mountAppHeader', () => {
  it('shows no offline indicator when online', () => {
    mountAppHeader(container)
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
  })

  it('shows offline indicator when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    mountAppHeader(container)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('shows offline indicator after going offline', () => {
    mountAppHeader(container)
    window.dispatchEvent(new Event('offline'))
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('hides install button initially (no beforeinstallprompt)', () => {
    mountAppHeader(container)
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('shows install button when beforeinstallprompt fires', () => {
    mountAppHeader(container)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(event)
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
  })

  it('calls prompt() when install button is clicked', async () => {
    mountAppHeader(container)
    const promptFn = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: promptFn,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(event)
    const btn = screen.getByRole('button', { name: /install/i })
    await userEvent.click(btn)
    expect(promptFn).toHaveBeenCalled()
  })

  it('unmount cleanup removes the header', () => {
    const unmount = mountAppHeader(container)
    unmount()
    expect(container.querySelector('.app-header')).toBeNull()
  })
})
