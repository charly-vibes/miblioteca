import { describe, expect, it, vi } from 'vitest'
import { checkStorageBudget, LOW_STORAGE_AVAILABLE_BYTES } from './storageBudget'

describe('checkStorageBudget', () => {
  it('requests persistent storage when asked', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const estimate = vi.fn().mockResolvedValue({ usage: 100, quota: LOW_STORAGE_AVAILABLE_BYTES + 100 })

    const status = await checkStorageBudget({ persist, estimate }, { requestPersist: true })

    expect(persist).toHaveBeenCalledTimes(1)
    expect(status).toMatchObject({ kind: 'ok', persisted: true })
  })

  it('warns when persistent storage is denied', async () => {
    const status = await checkStorageBudget(
      {
        persist: vi.fn().mockResolvedValue(false),
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: LOW_STORAGE_AVAILABLE_BYTES + 1 }),
      },
      { requestPersist: true }
    )

    expect(status).toMatchObject({ kind: 'warning', reason: 'persist-denied', persisted: false })
  })

  it('warns when less than 500 MB is available', async () => {
    const status = await checkStorageBudget({
      estimate: vi.fn().mockResolvedValue({ usage: 600, quota: 1000 }),
    })

    expect(status).toMatchObject({ kind: 'warning', reason: 'low-storage', availableBytes: 400 })
  })

  it('blocks capture when quota is exhausted', async () => {
    const status = await checkStorageBudget({
      estimate: vi.fn().mockResolvedValue({ usage: 1000, quota: 1000 }),
    })

    expect(status).toMatchObject({ kind: 'blocking', reason: 'quota-exhausted', availableBytes: 0 })
  })

  it('does not fail browsers without the StorageManager APIs', async () => {
    await expect(checkStorageBudget(undefined, { requestPersist: true })).resolves.toMatchObject({ kind: 'ok' })
  })

  it('warns instead of failing when persist rejects', async () => {
    const status = await checkStorageBudget(
      {
        persist: vi.fn().mockRejectedValue(new Error('denied')),
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: LOW_STORAGE_AVAILABLE_BYTES + 1 }),
      },
      { requestPersist: true }
    )

    expect(status).toMatchObject({ kind: 'warning', reason: 'persist-denied', persisted: false })
  })

  it('ignores estimate failures so capture can continue', async () => {
    const status = await checkStorageBudget({
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockRejectedValue(new Error('estimate failed')),
    }, { requestPersist: true })

    expect(status).toMatchObject({ kind: 'ok', persisted: true })
  })
})
