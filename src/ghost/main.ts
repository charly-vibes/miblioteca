import { GhostCalibrationPage } from './GhostCalibrationPage'
import { detectSensorDeps } from '../sensors/probe'
import { DeviceMotionGyroAdapter } from '../sensors/deviceMotionAdapter'
import type { GyroLike } from '../sensors/ghostOverlay'

const root = document.getElementById('root')!
const sensors = detectSensorDeps()
let gyro: GyroLike | null = null
if (sensors.hasGyroscope) {
  try {
    gyro = new (window as unknown as { Gyroscope: new (o: { frequency: number }) => GyroLike }).Gyroscope({ frequency: 60 })
  } catch (e) {
    console.warn('Gyroscope unavailable (permission denied or not supported):', e)
    gyro = sensors.hasDeviceMotionEvent ? new DeviceMotionGyroAdapter(window) : null
  }
} else if (sensors.hasDeviceMotionEvent) {
  gyro = new DeviceMotionGyroAdapter(window)
}

new GhostCalibrationPage(root, { gyro })
