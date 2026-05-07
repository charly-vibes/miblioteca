export const FIELD_COUNT = 14
export const MOTION_WINDOW_FIELD_COUNT = 7

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

export function extractMotionWindow(
  trace: Float32Array,
  shotMs: number,
  windowMs = 200
): Float32Array {
  if (trace.length % FIELD_COUNT !== 0) {
    throw new RangeError('IMU trace length must be a multiple of FIELD_COUNT')
  }
  if (!Number.isFinite(shotMs)) {
    throw new RangeError('shotMs must be finite')
  }
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new RangeError('windowMs must be finite and non-negative')
  }

  const rowCount = trace.length / FIELD_COUNT
  const halfWindowMs = windowMs / 2
  const startMs = shotMs - halfWindowMs
  const endMs = shotMs + halfWindowMs
  const selected = new Float32Array(rowCount * MOTION_WINDOW_FIELD_COUNT)
  let outputOffset = 0

  for (let row = 0; row < rowCount; row++) {
    const inputOffset = row * FIELD_COUNT
    const t = trace[inputOffset + F_T]
    if (t < startMs || t > endMs) continue

    selected[outputOffset++] = t
    selected[outputOffset++] = trace[inputOffset + F_AX]
    selected[outputOffset++] = trace[inputOffset + F_AY]
    selected[outputOffset++] = trace[inputOffset + F_AZ]
    selected[outputOffset++] = trace[inputOffset + F_GX]
    selected[outputOffset++] = trace[inputOffset + F_GY]
    selected[outputOffset++] = trace[inputOffset + F_GZ]
  }

  return selected.slice(0, outputOffset)
}
