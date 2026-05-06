import { describe, it, expect, beforeEach, vi } from 'vitest'
import { requestUploadSync } from './syncRegistration'

describe('requestUploadSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('no-ops when serviceWorker is absent', async () => {
    const orig = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    await expect(requestUploadSync()).resolves.toBeUndefined()
    if (orig) Object.defineProperty(navigator, 'serviceWorker', orig)
  })

  it('no-ops when SyncManager is absent', async () => {
    const origSM = (window as unknown as Record<string, unknown>).SyncManager
    delete (window as unknown as Record<string, unknown>).SyncManager
    await expect(requestUploadSync()).resolves.toBeUndefined()
    if (origSM !== undefined) (window as unknown as Record<string, unknown>).SyncManager = origSM
  })

  it('registers upload-pending tag when both APIs are present', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.resolve({ sync: { register } })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready },
      configurable: true,
    })
    ;(window as unknown as Record<string, unknown>).SyncManager = class {}

    await requestUploadSync()

    expect(register).toHaveBeenCalledWith('upload-pending')
  })
})
