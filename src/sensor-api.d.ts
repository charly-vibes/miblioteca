// Generic Sensor API ambient declarations
// https://www.w3.org/TR/generic-sensor/
// Not included in lib.dom — required for Accelerometer, Gyroscope, and friends.

interface SensorOptions {
  frequency?: number
}

interface MotionSensorOptions extends SensorOptions {
  referenceFrame?: 'device' | 'screen'
}

interface SensorErrorEventInit extends EventInit {
  error: DOMException
}

declare class SensorErrorEvent extends Event {
  constructor(type: string, errorEventInitDict: SensorErrorEventInit)
  readonly error: DOMException
}

declare abstract class Sensor extends EventTarget {
  readonly activated: boolean
  readonly hasReading: boolean
  readonly timestamp: DOMHighResTimeStamp | null
  start(): void
  stop(): void
  onreading: ((this: Sensor, ev: Event) => unknown) | null
  onerror: ((this: Sensor, ev: SensorErrorEvent) => unknown) | null
  onactivate: ((this: Sensor, ev: Event) => unknown) | null
  addEventListener(type: 'reading', listener: (this: Sensor, ev: Event) => unknown, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: 'error', listener: (this: Sensor, ev: SensorErrorEvent) => unknown, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: 'activate', listener: (this: Sensor, ev: Event) => unknown, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: 'reading', listener: (this: Sensor, ev: Event) => unknown, options?: boolean | EventListenerOptions): void
  removeEventListener(type: 'error', listener: (this: Sensor, ev: SensorErrorEvent) => unknown, options?: boolean | EventListenerOptions): void
  removeEventListener(type: 'activate', listener: (this: Sensor, ev: Event) => unknown, options?: boolean | EventListenerOptions): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void
}

declare class Accelerometer extends Sensor {
  constructor(options?: MotionSensorOptions)
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

declare class LinearAccelerationSensor extends Sensor {
  constructor(options?: MotionSensorOptions)
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

declare class GravitySensor extends Sensor {
  constructor(options?: MotionSensorOptions)
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

declare class Gyroscope extends Sensor {
  constructor(options?: MotionSensorOptions)
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

declare abstract class OrientationSensor extends Sensor {
  readonly quaternion: ReadonlyArray<number> | null
  populateMatrix(targetMatrix: Float32Array | Float64Array | DOMMatrix): void
}

declare class AbsoluteOrientationSensor extends OrientationSensor {
  constructor(options?: SensorOptions)
}

declare class RelativeOrientationSensor extends OrientationSensor {
  constructor(options?: SensorOptions)
}
