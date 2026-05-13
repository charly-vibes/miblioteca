import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultTuningConfig, loadTuningConfig, saveTuningConfig } from './tuningConfig'

describe('tuningConfig persistence key', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and loads config under a namespaced versioned localStorage key', () => {
    const config = { ...defaultTuningConfig(), movingGain: 0.123 }

    saveTuningConfig(config)

    expect(localStorage.getItem('miblioteca:ghost-tuning-v1')).toBe(JSON.stringify(config))
    expect(localStorage.getItem('ghost-tuning-config')).toBeNull()
    expect(loadTuningConfig()).toEqual(config)
  })
})
