import { GhostCalibrationPage } from './GhostCalibrationPage'
import { detectSensorDeps } from '../sensors/probe'
import { DeviceMotionGyroAdapter } from '../sensors/deviceMotionAdapter'
import type { GyroLike } from '../sensors/ghostOverlay'

const root = document.getElementById('root')!
const sensors = detectSensorDeps()
const gyro: GyroLike | null = sensors.hasGyroscope
  ? (new (window as unknown as { Gyroscope: new (o: { frequency: number }) => GyroLike }).Gyroscope({ frequency: 60 }))
  : sensors.hasDeviceMotionEvent
    ? new DeviceMotionGyroAdapter(window)
    : null

new GhostCalibrationPage(root, { gyro })
