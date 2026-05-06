export const FIELD_COUNT = 14

export const F_T = 0
export const F_AX = 1
export const F_AY = 2
export const F_AZ = 3
export const F_GX = 4
export const F_GY = 5
export const F_GZ = 6
export const F_QX = 7
export const F_QY = 8
export const F_QZ = 9
export const F_QW = 10
export const F_GRX = 11
export const F_GRY = 12
export const F_GRZ = 13

export type ImuSample = {
  t: number
  ax: number; ay: number; az: number
  gx: number; gy: number; gz: number
  qx: number; qy: number; qz: number; qw: number
  grx: number; gry: number; grz: number
}

export type PauseGap = { start: number; end: number }

export type ImuTrace = {
  sessionId: string
  rowCount: number
  data: ArrayBuffer
  pauseGaps: PauseGap[]
}

export function feedSample(buf: Float32Array, rowIndex: number, sample: ImuSample): void {
  const o = rowIndex * FIELD_COUNT
  buf[o + F_T] = sample.t
  buf[o + F_AX] = sample.ax
  buf[o + F_AY] = sample.ay
  buf[o + F_AZ] = sample.az
  buf[o + F_GX] = sample.gx
  buf[o + F_GY] = sample.gy
  buf[o + F_GZ] = sample.gz
  buf[o + F_QX] = sample.qx
  buf[o + F_QY] = sample.qy
  buf[o + F_QZ] = sample.qz
  buf[o + F_QW] = sample.qw
  buf[o + F_GRX] = sample.grx
  buf[o + F_GRY] = sample.gry
  buf[o + F_GRZ] = sample.grz
}

export function createTraceBlob(buf: Float32Array, rowCount: number): Blob {
  return new Blob([buf.slice(0, rowCount * FIELD_COUNT).buffer], {
    type: 'application/octet-stream',
  })
}
