import { debugLogger } from '../debug/logger'

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
  hasDeviceMotionEvent: boolean
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
    hasDeviceMotionEvent: typeof w.DeviceMotionEvent !== 'undefined',
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
    debugLogger.log('sensor:permission-requested', { api: 'ios-device-motion-orientation' })
    try {
      const results = await Promise.all([
        deps.requestMotionPermission?.() ?? Promise.resolve<'granted' | 'denied'>('granted'),
        deps.requestOrientationPermission?.() ?? Promise.resolve<'granted' | 'denied'>('granted'),
      ])
      const granted = results.every((r) => r === 'granted')
      debugLogger.log('sensor:permission-result', { granted })
      if (!granted) {
        debugLogger.log('sensor:probe-result', { status: 'denied' })
        return { status: 'denied' }
      }
      debugLogger.log('sensor:probe-result', { status: 'granted', via: 'ios-permission' })
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
      debugLogger.log('sensor:permission-result', { granted: false, reason: 'exception' })
      debugLogger.log('sensor:probe-result', { status: 'denied' })
      return { status: 'denied' }
    }
  }

  if (!hasGenericSensor) {
    debugLogger.log('sensor:probe-result', { status: 'unavailable' })
    return { status: 'unavailable' }
  }

  debugLogger.log('sensor:probe-result', { status: 'granted', via: 'generic-sensor' })
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
