export type SensorCapabilityMap = {
  accelerometer: boolean
  gyroscope: boolean
  absoluteOrientation: boolean
  gravity: boolean
}

export type SensorProbeResult =
  | { status: 'granted'; capabilities: SensorCapabilityMap }
  | { status: 'denied' }
  | { status: 'unavailable' }

// iOS Safari exposes requestPermission() as a static method on DeviceMotionEvent/
// DeviceOrientationEvent — not in lib.dom, so we cast to access it.
type IOSEventClass = {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export type SensorProbeDeps = {
  hasAccelerometer: boolean
  hasGyroscope: boolean
  hasAbsoluteOrientationSensor: boolean
  hasGravitySensor: boolean
  // iOS Safari permission gates (undefined on non-iOS)
  requestMotionPermission?: () => Promise<'granted' | 'denied'>
  requestOrientationPermission?: () => Promise<'granted' | 'denied'>
}

export function detectSensorDeps(w: Window & typeof globalThis = window): SensorProbeDeps {
  const win = w as unknown as Record<string, unknown>
  const DevMotion = w.DeviceMotionEvent as unknown as IOSEventClass | undefined
  const DevOrientation = w.DeviceOrientationEvent as unknown as IOSEventClass | undefined

  return {
    hasAccelerometer: typeof win['Accelerometer'] === 'function',
    hasGyroscope: typeof win['Gyroscope'] === 'function',
    hasAbsoluteOrientationSensor: typeof win['AbsoluteOrientationSensor'] === 'function',
    hasGravitySensor: typeof win['GravitySensor'] === 'function',
    requestMotionPermission:
      typeof DevMotion?.requestPermission === 'function'
        ? () => DevMotion.requestPermission!()
        : undefined,
    requestOrientationPermission:
      typeof DevOrientation?.requestPermission === 'function'
        ? () => DevOrientation.requestPermission!()
        : undefined,
  }
}

export async function probeSensors(deps: SensorProbeDeps): Promise<SensorProbeResult> {
  const hasGenericSensor =
    deps.hasAccelerometer ||
    deps.hasGyroscope ||
    deps.hasAbsoluteOrientationSensor ||
    deps.hasGravitySensor

  // On iOS Safari, neither Generic Sensor API nor DeviceMotionEvent works without
  // an explicit requestPermission() call triggered by a user gesture.
  if (!hasGenericSensor && (deps.requestMotionPermission || deps.requestOrientationPermission)) {
    try {
      const results = await Promise.all([
        deps.requestMotionPermission?.() ?? Promise.resolve<'granted' | 'denied'>('granted'),
        deps.requestOrientationPermission?.() ?? Promise.resolve<'granted' | 'denied'>('granted'),
      ])
      if (results.some((r) => r === 'denied')) {
        return { status: 'denied' }
      }
      return {
        status: 'granted',
        capabilities: {
          accelerometer: false,
          gyroscope: false,
          absoluteOrientation: false,
          gravity: false,
        },
      }
    } catch {
      return { status: 'denied' }
    }
  }

  if (!hasGenericSensor) {
    return { status: 'unavailable' }
  }

  return {
    status: 'granted',
    capabilities: {
      accelerometer: deps.hasAccelerometer,
      gyroscope: deps.hasGyroscope,
      absoluteOrientation: deps.hasAbsoluteOrientationSensor,
      gravity: deps.hasGravitySensor,
    },
  }
}
