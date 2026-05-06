import { describe, it, expect } from 'vitest'
import { generateShortCode, clockOffsetMs } from './codes'

// Allowed chars: letters A-Z (except I, O) + digits 2-9 (no 0, 1)
const SEGMENT_CHARS = /^[A-HJ-NP-Z2-9]+$/

describe('generateShortCode', () => {
  it('returns a string matching the 4-letter + dash + 3-alnum pattern', () => {
    expect(generateShortCode()).toMatch(/^[A-Z]{4}-[A-HJ-NP-Z2-9]{3}$/)
  })

  it('prefix is always 4 uppercase letters (A-Z, including I and O)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode()
      expect(code.slice(0, 4)).toMatch(/^[A-Z]{4}$/)
    }
  })

  it('suffix never contains I, O, 0, or 1', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = generateShortCode().slice(5)
      expect(suffix).toMatch(SEGMENT_CHARS)
      expect(suffix).not.toMatch(/[IO01]/)
    }
  })

  it('suffix is exactly 3 characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateShortCode().slice(5)).toHaveLength(3)
    }
  })

  it('generates different codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateShortCode()))
    expect(codes.size).toBeGreaterThan(1)
  })

  it('accepts a custom random source for determinism', () => {
    let counter = 0
    const seeded = () => (counter++ / 100) % 1
    const a = generateShortCode(seeded)
    counter = 0
    const b = generateShortCode(seeded)
    expect(a).toBe(b)
  })
})

describe('clockOffsetMs', () => {
  it('returns Date.now() - serverTimeMs', () => {
    const now = Date.now()
    const serverTimeMs = now - 350
    const offset = clockOffsetMs(serverTimeMs, () => now)
    expect(offset).toBe(350)
  })

  it('returns a negative offset when server is ahead of client', () => {
    const now = Date.now()
    const serverTimeMs = now + 200
    const offset = clockOffsetMs(serverTimeMs, () => now)
    expect(offset).toBe(-200)
  })

  it('returns 0 when clocks are in sync', () => {
    const now = Date.now()
    expect(clockOffsetMs(now, () => now)).toBe(0)
  })
})
