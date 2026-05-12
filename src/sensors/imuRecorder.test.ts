import { describe, it, expect, beforeEach } from 'vitest'
import { createImuRecorder } from './imuRecorder'
import type { AccelerometerLike, GyroscopeLike, ImuRecorderDeps } from './imuRecorder'
import { FIELD_COUNT, F_T, F_AX, F_GX, F_QW } from './imuTrace'
import { openShelfwalkDb, getTrace, putTrace } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'

// Minimal mock sensor — exposes fireReading() to trigger onreading synchronously
function makeMockAccel(
  values: { x: number; y: number; z: number; timestamp: number } = { x: 1, y: 2, z: 3, timestamp: 100 }
): AccelerometerLike & { fireReading(): void; _values: typeof values } {
  return {
    _values: values,
    x: values.x,
    y: values.y,
    z: values.z,
    timestamp: values.timestamp,
    onreading: null,
    onerror: null,
    start() {},
    stop() {},
    fireReading() {
      this.onreading?.(new Event('reading'))
    },
  }
}

function makeMockGyro(
  values: { x: number; y: number; z: number; timestamp: number } = { x: 0.1, y: 0.2, z: 0.3, timestamp: 100 }
): GyroscopeLike & { fireReading(): void } {
  return {
    x: values.x,
    y: values.y,
    z: values.z,
    timestamp: values.timestamp,
    onreading: null,
    onerror: null,
    start() {},
    stop() {},
    fireReading() {
      this.onreading?.(new Event('reading'))
    },
  }
}

function makeNoop() {
  return () => () => {}
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  const name = `test-imu-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(name)
})

describe('createImuRecorder', () => {
  it('stop() writes a trace to IDB with correct rowCount and data', async () => {
    const accel = makeMockAccel({ x: 1, y: 2, z: 3, timestamp: 1000 })
    const deps: ImuRecorderDeps = {
      accel,
      gyro: null,
      absOri: null,
      grav: null,
      onVisibilityChange: makeNoop(),
      now: () => 1000,
      writeTrace: (sessionId, trace) => putTrace(db, sessionId, trace).then(() => undefined),
    }

    const recorder = createImuRecorder('sess-1', deps)

    accel.fireReading()
    accel.fireReading()
    accel.fireReading()

    await recorder.stop()

    const trace = await getTrace(db, 'sess-1')
    expect(trace).toBeDefined()
    expect(trace!.sessionId).toBe('sess-1')
    expect(trace!.rowCount).toBe(3)
    expect(trace!.pauseGaps).toEqual([])

    const view = new Float32Array(trace!.data)
    expect(view[F_T]).toBeCloseTo(1000)
    expect(view[F_AX]).toBeCloseTo(1)
  })

  it('non-primary sensor readings update shared state without adding rows', async () => {
    const accel = makeMockAccel({ x: 5, y: 0, z: 0, timestamp: 500 })
    const gyro = makeMockGyro({ x: 0.9, y: 0, z: 0, timestamp: 500 })
    const deps: ImuRecorderDeps = {
      accel,
      gyro,
      absOri: null,
      grav: null,
      onVisibilityChange: makeNoop(),
      now: () => 500,
      writeTrace: (sessionId, trace) => putTrace(db, sessionId, trace).then(() => undefined),
    }

    const recorder = createImuRecorder('sess-2', deps)

    gyro.fireReading()  // updates lastGx but does not append (accel is primary)
    accel.fireReading() // appends one row with latest gyro state

    await recorder.stop()

    const trace = await getTrace(db, 'sess-2')
    expect(trace!.rowCount).toBe(1)
    const view = new Float32Array(trace!.data)
    expect(view[F_AX]).toBeCloseTo(5)
    expect(view[F_GX]).toBeCloseTo(0.9)
  })

  it('records pause gaps from visibility changes', async () => {
    let visHandler: ((hidden: boolean) => void) | null = null
    const accel = makeMockAccel()
    const deps: ImuRecorderDeps = {
      accel,
      gyro: null,
      absOri: null,
      grav: null,
      onVisibilityChange: (handler) => {
        visHandler = handler
        return () => { visHandler = null }
      },
      now: () => 1000,
      writeTrace: (sessionId, trace) => putTrace(db, sessionId, trace).then(() => undefined),
    }

    const recorder = createImuRecorder('sess-3', deps)
    visHandler!(true)   // page hidden at t=1000
    visHandler!(false)  // page visible at t=1000

    await recorder.stop()

    const trace = await getTrace(db, 'sess-3')
    expect(trace!.pauseGaps).toHaveLength(1)
    expect(trace!.pauseGaps[0]).toEqual({ start: 1000, end: 1000 })
  })

  it('falls back to gyro as primary when accel is null', async () => {
    const gyro = makeMockGyro({ x: 3, y: 0, z: 0, timestamp: 200 })
    const deps: ImuRecorderDeps = {
      accel: null,
      gyro,
      absOri: null,
      grav: null,
      onVisibilityChange: makeNoop(),
      now: () => 200,
      writeTrace: (sessionId, trace) => putTrace(db, sessionId, trace).then(() => undefined),
    }

    const recorder = createImuRecorder('sess-4', deps)
    gyro.fireReading()
    gyro.fireReading()
    await recorder.stop()

    const trace = await getTrace(db, 'sess-4')
    expect(trace!.rowCount).toBe(2)
    const view = new Float32Array(trace!.data)
    expect(view[F_GX]).toBeCloseTo(3)
    // qw defaults to 1 (identity quaternion initial state)
    expect(view[F_QW]).toBeCloseTo(1)
  })

  it('buffer grows automatically beyond initial capacity', async () => {
    const accel = makeMockAccel()
    const deps: ImuRecorderDeps = {
      accel,
      gyro: null,
      absOri: null,
      grav: null,
      onVisibilityChange: makeNoop(),
      now: () => 0,
      writeTrace: (sessionId, trace) => putTrace(db, sessionId, trace).then(() => undefined),
    }

    const recorder = createImuRecorder('sess-5', deps)

    // Fire more than INITIAL_CAPACITY (1024) readings
    for (let i = 0; i < 1100; i++) accel.fireReading()

    await recorder.stop()

    const trace = await getTrace(db, 'sess-5')
    expect(trace!.rowCount).toBe(1100)
    expect(trace!.data.byteLength).toBe(1100 * FIELD_COUNT * 4)
  })
})

describe('imuRecorder robustness (mibilioteca-f3w, mibilioteca-fpvy)', () => {
  it('accel onerror is not null after createImuRecorder (sensor errors must not be silently swallowed)', () => {
    const accel = makeMockAccel()
    const recorder = createImuRecorder('sess-err', {
      accel,
      gyro: null,
      absOri: null,
      grav: null,
      now: () => performance.now(),
      onVisibilityChange: makeNoop(),
      writeTrace: (_id, _trace) => Promise.resolve(),
    })
    expect(accel.onerror).not.toBeNull()
    void recorder.stop()
  })

  it('grow() is bounded by MAX_ROWS: rowCount stops at cap, no OOM doubling past limit', async () => {
    const accel = makeMockAccel()
    let now = 1000
    let capturedRowCount = 0
    const recorder = createImuRecorder('sess-cap', {
      accel,
      gyro: null,
      absOri: null,
      grav: null,
      now: () => now++,
      onVisibilityChange: makeNoop(),
      writeTrace: (_id, trace) => {
        capturedRowCount = trace.rowCount
        return Promise.resolve()
      },
    })
    // Fire 200,000 readings — well past any reasonable max (spec: 108,000 = 30min × 60Hz)
    for (let i = 0; i < 200_000; i++) accel.fireReading()
    await recorder.stop()
    // rowCount must be capped at MAX_ROWS (108,000), not 200,000
    expect(capturedRowCount).toBeLessThanOrEqual(108_000)
  })
})
