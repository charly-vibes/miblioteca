## 1. Specification and model surface
- [x] 1.1 Extend the ghost orientation model vocabulary to include `hybrid` in specs, config typing, and UI expectations
- [x] 1.2 Document hybrid fallback rules for missing gyro or missing absolute-orientation samples

## 2. Red → Green tests
- [x] 2.1 Add pipeline tests that fail until hybrid mode uses gyro for fast motion and absolute orientation for drift correction (complementary filter)
- [x] 2.2 Add tuning panel/config tests that fail until `hybrid` is selectable and persists through storage round-trips
- [x] 2.3 Add regression tests for runtime switching between `gyro`, `absolute`, and `hybrid`, including the seed-on-entry behavior
- [x] 2.4 Add tests proving stale (`>300 ms`) absolute readings trigger the gyro fallback and emit `hybrid-fallback-gyro`
- [x] 2.5 Add tests proving a large absolute jump is rate-limited by `maxShiftRateRadS * dt` over multiple frames instead of snapping in one
- [x] 2.6 Add tests proving `omegaMag` continues to derive from the gyro path in hybrid mode and falls back to `0` only when gyro is missing
- [x] 2.7 Add tests for first-frame behavior in hybrid mode (absolute-only, gyro-only, neither)
- [x] 2.8 Add tests proving `orientationSource` is emitted on every frame with the correct label per mode/fallback

## 3. Implementation
- [x] 3.1 Update `OrientationModel` and tuning config persistence to include `hybrid`
- [x] 3.2 Implement the hybrid complementary filter in `GhostMotionPipeline` using `stillGain` / `movingGain` as `α` and `shortestAngle` for the delta
- [x] 3.3 Time-gate absolute-orientation freshness at `300 ms` and route stale readings through the gyro fallback path
- [x] 3.4 Clamp the per-frame fusion correction to `±maxShiftRateRadS * dt` per axis
- [x] 3.5 Seed gyro yaw/pitch from the latest fresh absolute reading on entry to `hybrid` mode; preserve translation tracking behavior unchanged
- [x] 3.6 Always derive `omegaMag` from the gyro path when present; fall back to `0` when gyro is missing
- [x] 3.7 Emit `orientationSource` on every `GhostFrame` (`gyro` | `absolute` | `hybrid` | `hybrid-fallback-gyro` | `hybrid-fallback-absolute`)
- [x] 3.8 Update the tuning panel selector and related labels/tooling for the third model

## 4. Validation
- [x] 4.1 Run focused Vitest suites for the pipeline and tuning panel
- [x] 4.2 Run `npm run check`
- [ ] 4.3 Record a manual ghost-page verification pass comparing `gyro`, `absolute`, and `hybrid`
