# Change: Add accelerometer-based translation tracking to ghost overlay

## Why
The dominant motion when scanning a bookcase is **lateral translation** — the user's
arm sweeps the phone along the shelf. The current ghost overlay model tracks only
rotation (gyroscope). A pure lateral slide produces near-zero gyro signal, so the
ghost barely moves and gives no useful alignment feedback. Adding `DeviceMotion`
linear acceleration integration makes the overlay track sideways movement, which is
exactly the motion users actually perform.

## What Changes
- **Add `DeviceMotion` subscription** in `GhostOverlayCanvas` to receive
  gravity-subtracted `acceleration.{x,y}` samples; integration uses `event.interval`
  (actual sample period in ms) as dt — not a fixed 60 Hz assumption
- **Accumulate velocity and displacement** per inter-shot interval using trapezoidal
  integration in device frame; horizontal components (x = lateral, y = vertical) are
  used directly without quaternion rotation because the phone is held approximately
  upright (`beta ≈ 90°`)
- **Beta-angle guard**: if `|beta − 90°| > 30°`, set `translationShiftPx/Py = 0`
  silently — gravity leaks into the lateral channels at extreme angles and would
  send the ghost off-screen. This does not affect the rotation shift.
- **Velocity reset on shutter**: `setSnapshot()` zeros both velocity and displacement
  accumulators, bounding drift to within each inter-shot interval. This is the primary
  drift control for translation-dominant sessions.
- **Gate-close velocity zero**: when the steadiness gate closes (hide threshold
  triggered), velocity is also zeroed as a secondary correction during sessions that
  include angular motion.
- **Combined shift formula**: total pixel shift is the sum of existing rotation shift
  and new translation shift:
  ```
  translationShiftPx = -(dx_m / workingDistance_m) * focalLength
  translationShiftPy = -(dy_m / workingDistance_m) * focalLength
  ```
  The minus sign ensures the ghost moves opposite to the camera, matching world-space
  AR behavior.
- **Default working distance: 0.6 m** (arm's length from a bookcase; see
  `add-distance-config` for calibration)
- **URL param override**: `?distance=<cm>` sets working distance for the session
- **Debug events**: add `dx_cm`, `dy_cm`, `velX`, `velY` to existing `ghost:shift`
  and `ghost:at-shutter` events
- **Graceful degradation**: if `DeviceMotion` is unavailable or permission denied,
  fall back to rotation-only shift silently (existing behavior)

## Impact
- Affected specs: `ghost-overlay` (new motion model)
- Related research: `.wai/projects/capture-mvp/research/2026-05-07-dead-reckoning-shelf-position-estimation-via-zu.md`
- Affected code: `src/sensors/ghostOverlay.ts` (state type, computeShift),
  `src/sensors/ghostOverlayCanvas.ts` (DeviceMotion listener, velocity accumulators),
  `src/tracer/CaptureView.ts` (pass workingDistance from URL param)
- **Depends on**: existing `add-ghost-overlay` change (rotation shift infrastructure)
- **Blocked by**: `add-distance-config` is optional — this change ships with a fixed
  0.6 m default; calibration is deferred
