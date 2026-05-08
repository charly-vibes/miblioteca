import { describe, it, expect } from 'vitest'
import { DebugLogger } from './logger'

const enabled = new URLSearchParams('debug')
const disabled = new URLSearchParams('')

describe('DebugLogger — disabled mode', () => {
  it('enabled is false when debug param absent', () => {
    const l = new DebugLogger(disabled)
    expect(l.enabled).toBe(false)
  })

  it('log() is a no-op', () => {
    const l = new DebugLogger(disabled)
    l.log('any:event', {})
    expect(l.size).toBe(0)
  })

  it('export() returns empty envelope', () => {
    const l = new DebugLogger(disabled)
    expect(l.export()).toBe('{"meta":{},"events":[]}')
  })
})

describe('DebugLogger — enabled mode', () => {
  it('enabled is true when debug param present', () => {
    const l = new DebugLogger(enabled)
    expect(l.enabled).toBe(true)
  })

  it('size starts at 0', () => {
    const l = new DebugLogger(enabled)
    expect(l.size).toBe(0)
  })

  it('export() with no entries returns events: []', () => {
    const l = new DebugLogger(enabled)
    const parsed = JSON.parse(l.export())
    expect(parsed.events).toEqual([])
    expect(parsed.meta).toHaveProperty('exportedAt')
    expect(parsed.meta).toHaveProperty('userAgent')
    expect(parsed.meta).toHaveProperty('url')
    expect(parsed.meta).toHaveProperty('sessionMs')
  })

  it('stores entries and increments size', () => {
    const l = new DebugLogger(enabled)
    l.log('camera:init-result', { ok: true })
    l.log('sensor:probe-result', { status: 'granted' })
    expect(l.size).toBe(2)
  })

  it('entry has correct structure with monotonic seq', () => {
    const l = new DebugLogger(enabled)
    l.log('camera:init-result', { ok: true })
    const parsed = JSON.parse(l.export())
    const entry = parsed.events[0]
    expect(entry).toHaveProperty('seq')
    expect(entry).toHaveProperty('t')
    expect(entry.type).toBe('camera:init-result')
    expect(entry.payload).toEqual({ ok: true })
    expect(typeof entry.t).toBe('number')
    expect(entry.t).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(entry.t)).toBe(true)
  })

  it('seq is strictly increasing across entries', () => {
    const l = new DebugLogger(enabled)
    l.log('a', 1)
    l.log('b', 2)
    l.log('c', 3)
    const { events } = JSON.parse(l.export())
    expect(events[1].seq).toBeGreaterThan(events[0].seq)
    expect(events[2].seq).toBeGreaterThan(events[1].seq)
  })

  it('export() returns entries in insertion order (ascending seq)', () => {
    const l = new DebugLogger(enabled)
    l.log('first', 1)
    l.log('second', 2)
    l.log('third', 3)
    const { events } = JSON.parse(l.export())
    expect(events.map((e: { type: string }) => e.type)).toEqual(['first', 'second', 'third'])
  })

  it('export() metadata envelope has all required fields', () => {
    const l = new DebugLogger(enabled)
    l.log('t', {})
    const { meta } = JSON.parse(l.export())
    expect(typeof meta.exportedAt).toBe('string')
    expect(typeof meta.userAgent).toBe('string')
    expect(typeof meta.url).toBe('string')
    expect(typeof meta.sessionMs).toBe('number')
  })

  it('clear() resets size to 0', () => {
    const l = new DebugLogger(enabled)
    l.log('a', 1)
    l.log('b', 2)
    l.clear()
    expect(l.size).toBe(0)
  })

  it('export() after clear() returns events: []', () => {
    const l = new DebugLogger(enabled)
    l.log('a', 1)
    l.clear()
    const { events } = JSON.parse(l.export())
    expect(events).toEqual([])
  })
})

describe('DebugLogger — ring buffer overflow', () => {
  it('size stays at 1000 after overflow', () => {
    const l = new DebugLogger(enabled)
    for (let i = 0; i < 1001; i++) l.log('t', i)
    expect(l.size).toBe(1000)
  })

  it('oldest entry is discarded on overflow', () => {
    const l = new DebugLogger(enabled)
    for (let i = 0; i < 1000; i++) l.log('fill', i)
    const seqBefore = JSON.parse(l.export()).events[0].seq
    l.log('new', 'latest')
    const { events } = JSON.parse(l.export())
    expect(events[0].seq).toBeGreaterThan(seqBefore)
    expect(events[999].type).toBe('new')
  })

  it('export() returns entries in insertion order after overflow', () => {
    const l = new DebugLogger(enabled)
    for (let i = 0; i < 1002; i++) l.log('t', i)
    const { events } = JSON.parse(l.export())
    expect(events.length).toBe(1000)
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq)
    }
  })
})

describe('DebugLogger — URLSearchParams construction', () => {
  it('any value for debug key activates debug mode', () => {
    expect(new DebugLogger(new URLSearchParams('debug=false')).enabled).toBe(true)
    expect(new DebugLogger(new URLSearchParams('debug=0')).enabled).toBe(true)
    expect(new DebugLogger(new URLSearchParams('debug=1')).enabled).toBe(true)
    expect(new DebugLogger(new URLSearchParams('debug')).enabled).toBe(true)
  })

  it('absent debug key means disabled', () => {
    expect(new DebugLogger(new URLSearchParams('')).enabled).toBe(false)
    expect(new DebugLogger(new URLSearchParams('foo=bar')).enabled).toBe(false)
  })
})
