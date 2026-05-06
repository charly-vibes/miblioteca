import { describe, expect, it, vi } from 'vitest'
import { createInstallPrompt } from './installPrompt'

function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  })
  window.dispatchEvent(event)
  return event
}

describe('createInstallPrompt', () => {
  it('canInstall is false before beforeinstallprompt fires', () => {
    const ctrl = createInstallPrompt()
    expect(ctrl.canInstall()).toBe(false)
    ctrl.destroy()
  })

  it('canInstall becomes true when beforeinstallprompt fires', () => {
    const ctrl = createInstallPrompt()
    fireInstallPrompt()
    expect(ctrl.canInstall()).toBe(true)
    ctrl.destroy()
  })

  it('install() calls prompt() on the captured event', async () => {
    const ctrl = createInstallPrompt()
    const event = fireInstallPrompt('accepted')
    await ctrl.install()
    expect(event.prompt).toHaveBeenCalled()
    ctrl.destroy()
  })

  it('canInstall becomes false after accepted outcome', async () => {
    const ctrl = createInstallPrompt()
    fireInstallPrompt('accepted')
    await ctrl.install()
    expect(ctrl.canInstall()).toBe(false)
    ctrl.destroy()
  })

  it('canInstall stays true after dismissed outcome', async () => {
    const ctrl = createInstallPrompt()
    fireInstallPrompt('dismissed')
    await ctrl.install()
    expect(ctrl.canInstall()).toBe(true)
    ctrl.destroy()
  })

  it('install() is a no-op when canInstall is false', async () => {
    const ctrl = createInstallPrompt()
    expect(ctrl.canInstall()).toBe(false)
    await ctrl.install()
    expect(ctrl.canInstall()).toBe(false)
    ctrl.destroy()
  })

  it('install() clears event on AbortError', async () => {
    const ctrl = createInstallPrompt()
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new DOMException('prompt not shown', 'AbortError')),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    window.dispatchEvent(event)
    expect(ctrl.canInstall()).toBe(true)
    await ctrl.install()
    expect(ctrl.canInstall()).toBe(false)
    ctrl.destroy()
  })
})
