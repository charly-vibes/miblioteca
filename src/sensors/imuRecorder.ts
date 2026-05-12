import { FIELD_COUNT, feedSample } from './imuTrace'
import type { ImuTrace, PauseGap } from './imuTrace'

export type SensorLike = {
  start(): void
  stop(): void
  onreading: ((ev: Event) => void) | null
  onerror: ((ev: { error: DOMException }) => void) | null
}

export type AccelerometerLike = SensorLike & {
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
  readonly timestamp: DOMHighResTimeStamp | null
}

export type GyroscopeLike = SensorLike & {
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
  readonly timestamp: DOMHighResTimeStamp | null
}

export type OrientationSensorLike = SensorLike & {
  readonly quaternion: ReadonlyArray<number> | null
  readonly timestamp: DOMHighResTimeStamp | null
}

export type GravitySensorLike = SensorLike & {
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

export type ImuRecorderDeps = {
  accel: AccelerometerLike | null
  gyro: GyroscopeLike | null
  absOri: OrientationSensorLike | null
  grav: GravitySensorLike | null
  onVisibilityChange: (handler: (hidden: boolean) => void) => () => void
  now: () => number
  writeTrace: (sessionId: string, trace: ImuTrace) => Promise<void>
}

export type ImuRecorder = {
  stop(): Promise<void>
}

const INITIAL_CAPACITY = 1024
// 30 min × 60 Hz = 108,000 rows; hard cap prevents OOM on extended sessions
const MAX_ROWS = 108_000

export function createImuRecorder(sessionId: string, deps: ImuRecorderDeps): ImuRecorder {
  let capacity = INITIAL_CAPACITY
  let buf = new Float32Array(capacity * FIELD_COUNT)
  let rowCount = 0
  const pauseGaps: PauseGap[] = []
  let pauseStart: number | null = null

  let lastAx = 0, lastAy = 0, lastAz = 0
  let lastGx = 0, lastGy = 0, lastGz = 0
  let lastQx = 0, lastQy = 0, lastQz = 0, lastQw = 1
  let lastGrx = 0, lastGry = 0, lastGrz = 0

  function grow() {
    const next = new Float32Array(capacity * FIELD_COUNT * 2)
    next.set(buf)
    buf = next
    capacity *= 2
  }

  function appendRow(t: number) {
    if (rowCount >= MAX_ROWS) return
    if (rowCount >= capacity) grow()
    feedSample(buf, rowCount, {
      t,
      ax: lastAx, ay: lastAy, az: lastAz,
      gx: lastGx, gy: lastGy, gz: lastGz,
      qx: lastQx, qy: lastQy, qz: lastQz, qw: lastQw,
      grx: lastGrx, gry: lastGry, grz: lastGrz,
    })
    rowCount++
  }

  // Primary sensor fires readings and appends rows; others update shared state only.
  // Priority: accel → gyro → absOri → grav
  const primary = deps.accel ?? deps.gyro ?? deps.absOri ?? deps.grav

  if (deps.accel) {
    deps.accel.onreading = () => {
      lastAx = deps.accel!.x ?? 0
      lastAy = deps.accel!.y ?? 0
      lastAz = deps.accel!.z ?? 0
      appendRow(deps.accel!.timestamp ?? deps.now())
    }
    deps.accel.onerror = (ev) => console.warn('imuRecorder: accel error', ev.error?.message)
    deps.accel.start()
  }

  if (deps.gyro) {
    deps.gyro.onreading = () => {
      lastGx = deps.gyro!.x ?? 0
      lastGy = deps.gyro!.y ?? 0
      lastGz = deps.gyro!.z ?? 0
      if (primary === deps.gyro) appendRow(deps.gyro!.timestamp ?? deps.now())
    }
    deps.gyro.onerror = (ev) => console.warn('imuRecorder: gyro error', ev.error?.message)
    deps.gyro.start()
  }

  if (deps.absOri) {
    deps.absOri.onreading = () => {
      const q = deps.absOri!.quaternion
      if (q) { lastQx = q[0]; lastQy = q[1]; lastQz = q[2]; lastQw = q[3] }
      if (primary === deps.absOri) appendRow(deps.absOri!.timestamp ?? deps.now())
    }
    deps.absOri.onerror = (ev) => console.warn('imuRecorder: absOri error', ev.error?.message)
    deps.absOri.start()
  }

  if (deps.grav) {
    deps.grav.onreading = () => {
      lastGrx = deps.grav!.x ?? 0
      lastGry = deps.grav!.y ?? 0
      lastGrz = deps.grav!.z ?? 0
      if (primary === deps.grav) appendRow(deps.now())
    }
    deps.grav.onerror = (ev) => console.warn('imuRecorder: grav error', ev.error?.message)
    deps.grav.start()
  }

  const unsubscribeVisibility = deps.onVisibilityChange((hidden) => {
    const t = deps.now()
    if (hidden) {
      pauseStart = t
    } else if (pauseStart !== null) {
      pauseGaps.push({ start: pauseStart, end: t })
      pauseStart = null
    }
  })

  return {
    async stop() {
      deps.accel?.stop()
      deps.gyro?.stop()
      deps.absOri?.stop()
      deps.grav?.stop()
      unsubscribeVisibility()

      const t = deps.now()
      if (pauseStart !== null) {
        pauseGaps.push({ start: pauseStart, end: t })
        pauseStart = null
      }

      const trace: ImuTrace = {
        sessionId,
        rowCount,
        data: buf.slice(0, rowCount * FIELD_COUNT).buffer,
        pauseGaps,
      }
      await deps.writeTrace(sessionId, trace).catch((err: unknown) => {
        console.error('imuRecorder: failed to write trace', err)
      })
    },
  }
}
