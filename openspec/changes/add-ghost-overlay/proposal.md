# Change: Add ghost overlay for photo-to-photo alignment

## Why
Without visual alignment feedback, users can't tell if consecutive captures overlap correctly.
A ghost overlay showing the previous capture faintly behind the live view makes alignment
intuitive — no backend required.

## What Changes
- New `<canvas>` element absolutely positioned over the live `<video>` in `CaptureView`
- CSS `transform: translate3d` shift driven by gyro yaw accumulation since the last shutter event
- Shift formula: `shiftX = -(videoWidth/2) / tan(hFOV_rad/2) * yawIntegral` (default hFOV 65°, ≤20% error)
- Overlay hidden while device angular velocity exceeds the steadiness gate (`|ω| > 0.5 rad/s`)
- Ghost canvas appears after first capture; hidden before any capture exists

## Impact
- Affected specs: `ghost-overlay` (new capability)
- Affected code: `src/tracer/CaptureView.ts`, `src/tracer/imuRecorder.ts`
