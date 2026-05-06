import { describe, it, expect } from 'vitest'
import {
  FIELD_COUNT,
  F_T, F_AX, F_AY, F_AZ,
  F_GX, F_GY, F_GZ,
  F_QX, F_QY, F_QZ, F_QW,
  F_GRX, F_GRY, F_GRZ,
  feedSample,
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
