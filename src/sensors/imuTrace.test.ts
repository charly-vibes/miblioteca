import { describe, it, expect } from 'vitest'
import {
  FIELD_COUNT,
  F_T, F_AX, F_AY, F_AZ,
  F_GX, F_GY, F_GZ,
  F_QX, F_QY, F_QZ, F_QW,
  F_GRX, F_GRY, F_GRZ,
  feedSample,
  extractMotionWindow,
  MOTION_WINDOW_FIELD_COUNT,
} from './imuTrace'
import type { ImuSample } from './imuTrace'

const S0: ImuSample = {
  t: 1000,
  ax: 1, ay: 2, az: 3,
  gx: 4, gy: 5, gz: 6,
  qx: 0.1, qy: 0.2, qz: 0.3, qw: 0.9,
  grx: 0.01, gry: 0.02, grz: 9.8,
}

const S1: ImuSample = {
  t: 2000,
  ax: -1, ay: -2, az: -3,
  gx: -4, gy: -5, gz: -6,
  qx: 0.5, qy: 0.5, qz: 0.5, qw: 0.5,
  grx: 0.0, gry: 0.0, grz: 9.81,
}

function makeTrace(times: number[]): Float32Array {
  const buf = new Float32Array(times.length * FIELD_COUNT)
  times.forEach((t, rowIndex) => {
    feedSample(buf, rowIndex, {
      t,
      ax: rowIndex + 0.1,
      ay: rowIndex + 0.2,
      az: rowIndex + 0.3,
      gx: rowIndex + 0.4,
      gy: rowIndex + 0.5,
      gz: rowIndex + 0.6,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      grx: 0,
      gry: 0,
      grz: 9.8,
    })
  })
  return buf
}

function windowRows(buf: Float32Array): number[][] {
  const rows: number[][] = []
  for (let offset = 0; offset < buf.length; offset += MOTION_WINDOW_FIELD_COUNT) {
    rows.push(Array.from(buf.slice(offset, offset + MOTION_WINDOW_FIELD_COUNT), (n) => Number(n.toFixed(6))))
  }
  return rows
}

describe('feedSample', () => {
  it('writes all 14 fields into row 0', () => {
    const buf = new Float32Array(FIELD_COUNT)
    feedSample(buf, 0, S0)

    expect(buf[F_T]).toBeCloseTo(1000)
    expect(buf[F_AX]).toBeCloseTo(1)
    expect(buf[F_AY]).toBeCloseTo(2)
    expect(buf[F_AZ]).toBeCloseTo(3)
    expect(buf[F_GX]).toBeCloseTo(4)
    expect(buf[F_GY]).toBeCloseTo(5)
    expect(buf[F_GZ]).toBeCloseTo(6)
    expect(buf[F_QX]).toBeCloseTo(0.1)
    expect(buf[F_QY]).toBeCloseTo(0.2)
    expect(buf[F_QZ]).toBeCloseTo(0.3)
    expect(buf[F_QW]).toBeCloseTo(0.9)
    expect(buf[F_GRX]).toBeCloseTo(0.01)
    expect(buf[F_GRY]).toBeCloseTo(0.02)
    expect(buf[F_GRZ]).toBeCloseTo(9.8)
  })

  it('writes into row 1 without disturbing row 0', () => {
    const buf = new Float32Array(2 * FIELD_COUNT)
    feedSample(buf, 0, S0)
    feedSample(buf, 1, S1)

    expect(buf[F_T]).toBeCloseTo(1000)
    expect(buf[FIELD_COUNT + F_T]).toBeCloseTo(2000)
    expect(buf[FIELD_COUNT + F_AX]).toBeCloseTo(-1)
    expect(buf[FIELD_COUNT + F_QW]).toBeCloseTo(0.5)
    expect(buf[FIELD_COUNT + F_GRZ]).toBeCloseTo(9.81)
  })

  it('handles zero sample without NaN', () => {
    const zero: ImuSample = { t: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, qx: 0, qy: 0, qz: 0, qw: 1, grx: 0, gry: 0, grz: 0 }
    const buf = new Float32Array(FIELD_COUNT)
    feedSample(buf, 0, zero)
    for (let i = 0; i < FIELD_COUNT; i++) {
      expect(Number.isNaN(buf[i])).toBe(false)
    }
  })
})

describe('extractMotionWindow', () => {
  it('extracts a symmetric 7-field window around a mid-trace shot', () => {
    const trace = makeTrace([0, 100, 200, 300, 400, 500, 600])

    const window = extractMotionWindow(trace, 300, 200)

    expect(windowRows(window)).toEqual([
      [200, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6],
      [300, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6],
      [400, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6],
    ])
  })

  it('truncates at the trace start instead of padding missing left-side samples', () => {
    const trace = makeTrace([0, 100, 200, 300, 400])

    const window = extractMotionWindow(trace, 0, 200)

    expect(windowRows(window)).toEqual([
      [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      [100, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6],
    ])
  })

  it('truncates at the trace end instead of padding missing right-side samples', () => {
    const trace = makeTrace([0, 100, 200, 300, 400])

    const window = extractMotionWindow(trace, 400, 200)

    expect(windowRows(window)).toEqual([
      [300, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6],
      [400, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6],
    ])
  })

  it('uses a 200 ms default window without treating it as a fixed constant', () => {
    const trace = makeTrace([0, 100, 200, 300, 400])

    expect(windowRows(extractMotionWindow(trace, 200))).toEqual([
      [100, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6],
      [200, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6],
      [300, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6],
    ])
    expect(windowRows(extractMotionWindow(trace, 200, 400))).toHaveLength(5)
  })

  it('rejects malformed inputs instead of silently returning misleading windows', () => {
    expect(() => extractMotionWindow(new Float32Array(FIELD_COUNT + 1), 0)).toThrow(RangeError)
    expect(() => extractMotionWindow(makeTrace([0]), Number.NaN)).toThrow(RangeError)
    expect(() => extractMotionWindow(makeTrace([0]), 0, -1)).toThrow(RangeError)
  })
})
