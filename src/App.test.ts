import { screen } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountMibliotecaApp } from './App'
import { openShelfwalkDb, putScan, putSession, type ShelfwalkDatabase } from './tracer/persistence'

let container: HTMLDivElement
let db: ShelfwalkDatabase
let dispose: (() => void) | undefined

beforeEach(async () => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  })

  container = document.createElement('div')
  document.body.append(container)
  db = await openShelfwalkDb(`app-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  db.close()
  container.remove()
})

describe('mountMibliotecaApp', () => {
  it('shows scan management when no active session exists', async () => {
    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('heading', { name: /start a shelf scan/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /join a scan/i })).toBeInTheDocument()
  })

  it('resumes the latest active session instead of forcing scan management', async () => {
    await putScan(db, {
      id: 'scan-resume',
      shortCode: 'RSUM-234',
      joinToken: 'resume-token',
      createdAt: '2026-05-07T10:00:00.000Z',
    })
    await putSession(db, {
      id: 'session-resume',
      scanId: 'scan-resume',
      userId: 'user-resume',
      startedAt: '2026-05-07T10:01:00.000Z',
      clockOffsetMs: 0,
      status: 'active',
    })

    dispose = mountMibliotecaApp(container, { openDb: async () => db })

    expect(await screen.findByRole('button', { name: /open camera/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /start a shelf scan/i })).not.toBeInTheDocument()
  })
})
