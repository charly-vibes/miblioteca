import { describe, it, expect } from 'vitest'
import { probeSensors } from './probe'
import type { SensorProbeDeps } from './probe'

const NO_SENSORS: SensorProbeDeps = {
  hasAccelerometer: false,
  hasGyroscope: false,
  hasAbsoluteOrientationSensor: false,
  hasGravitySensor: false,
  hasDeviceMotionEvent: false,
}

const ALL_SENSORS: SensorProbeDeps = {
  hasAccelerometer: true,
  hasGyroscope: true,
  hasAbsoluteOrientationSensor: true,
  hasGravitySensor: true,
  hasDeviceMotionEvent: true,
}

describe('probeSensors — Generic Sensor API (Chrome/Android)', () => {
  it('returns unavailable when no sensors are present and no iOS permission gate', async () => {
    const result = await probeSensors(NO_SENSORS)
    expect(result.status).toBe('unavailable')
  })

  it('returns granted with full capability map when all Generic Sensor classes are present', async () => {
    const result = await probeSensors(ALL_SENSORS)
    expect(result.status).toBe('granted')
    if (result.status === 'granted') {
      expect(result.capabilities).toEqual({
        accelerometer: true,
        gyroscope: true,
        absoluteOrientation: true,
        gravity: true,
      })
    }
  })

  it('returns granted with partial map when only some sensors are available', async () => {
    const partial: SensorProbeDeps = {
      ...NO_SENSORS,
      hasAccelerometer: true,
      hasGyroscope: true,
    }
    const result = await probeSensors(partial)
    expect(result.status).toBe('granted')
    if (result.status === 'granted') {
      expect(result.capabilities.accelerometer).toBe(true)
      expect(result.capabilities.gyroscope).toBe(true)
      expect(result.capabilities.absoluteOrientation).toBe(false)
      expect(result.capabilities.gravity).toBe(false)
    }
  })
})

describe('probeSensors — iOS Safari permission gate', () => {
  it('returns granted when both iOS permission calls resolve to granted', async () => {
    const deps: SensorProbeDeps = {
      ...NO_SENSORS,
      requestMotionPermission: async () => 'granted',
      requestOrientationPermission: async () => 'granted',
    }
    const result = await probeSensors(deps)
    expect(result.status).toBe('granted')
  })

  it('returns denied when motion permission is denied', async () => {
    const deps: SensorProbeDeps = {
      ...NO_SENSORS,
      requestMotionPermission: async () => 'denied',
      requestOrientationPermission: async () => 'granted',
    }
    const result = await probeSensors(deps)
    expect(result.status).toBe('denied')
  })

  it('returns denied when orientation permission is denied', async () => {
    const deps: SensorProbeDeps = {
      ...NO_SENSORS,
      requestMotionPermission: async () => 'granted',
      requestOrientationPermission: async () => 'denied',
    }
    const result = await probeSensors(deps)
    expect(result.status).toBe('denied')
  })

  it('returns denied when requestPermission throws', async () => {
    const deps: SensorProbeDeps = {
      ...NO_SENSORS,
      requestMotionPermission: async () => { throw new Error('NotAllowedError') },
    }
    const result = await probeSensors(deps)
    expect(result.status).toBe('denied')
  })

  it('prefers Generic Sensor API over iOS permission gate when both present', async () => {
    const deps: SensorProbeDeps = {
      ...ALL_SENSORS,
      requestMotionPermission: async () => 'denied',
      requestOrientationPermission: async () => 'denied',
    }
    // Generic Sensor API is available → skip iOS permission, return granted
    const result = await probeSensors(deps)
    expect(result.status).toBe('granted')
    if (result.status === 'granted') {
      expect(result.capabilities.accelerometer).toBe(true)
    }
  })
})
