# Tasks: Add Ghost Tuning Panel

## Phase 1: Config Foundation
- [ ] Update `src/ghost/tuningConfig.ts`: change localStorage key to `miblioteca:ghost-tuning-v1` (prevents origin collision, enables schema migration)
- [ ] Verify `tuning` field on `CalibrationExport` in `src/ghost/types.ts` (already exists)
- [ ] Write unit tests for config round-trip, corrupt localStorage fallback, defaults match constants

## Phase 2: Shared Pipeline Factory
- [ ] Create `src/sensors/createGhostPipelineDeps.ts` with `GhostPipelineOptions` interface and `createGhostPipelineDeps()` factory
- [ ] Factory handles: Gyroscope construction, deviceorientation listener, getOrientation/getBeta callbacks
- [ ] Factory accepts site-specific options: `enableMotionGate`, `tuning`, `onGyroSample`, display dimension getters
- [ ] Refactor `src/sensors/ghostOverlayCanvas.ts` to use factory instead of inline sensor wiring
- [ ] Refactor `src/ghost/GhostCalibrationPage.ts` to use factory instead of inline sensor wiring
- [ ] Add parity test: two factory instances with different `enableMotionGate` values receive the same `deviceorientation` events → both `getOrientation()` and `getBeta()` return identical values
- [ ] Remove duplicated sensor wiring code from both sites
- [ ] Verify all existing tests still pass after refactor

## Phase 3: Pipeline Accepts Runtime Config
- [ ] Verify `GhostMotionPipelineDeps.tuning` is optional and pipeline reads it per-frame (already wired)
- [ ] Verify `computeOrientationDelta` reads smoothing params from passed config (already wired)
- [ ] Verify `feedGhostAccel` reads ZUPT params from passed config (already wired)
- [ ] Verify `motionGateVisible` reads gate thresholds from passed config (already wired)
- [ ] Verify pipeline detects model change mid-run and resets orientation state (already wired)
- [ ] Update pipeline tests to cover tuning config override paths

## Phase 4: Fix Tuning Panel UI
Existing `TuningPanel.ts` has defects. Fix and extend:
- [ ] Fix toggle button size: 40×40 → 48×48 (WCAG 2.5.5 minimum touch target)
- [ ] Fix drawer max-height: 55vh → 40vh (leaves calibration rectangle visible on 915px viewport)
- [ ] Fix drawer background: `rgba(0,0,0,0.85)` → `rgba(0,0,0,0.88)` (match design spec)
- [ ] Fix slider grid: `90px 1fr 55px` → `80px 1fr 60px` (match design spec, wider value column)
- [ ] Add accordion behavior to sections: tap section header to expand/collapse, only one section open at a time
- [ ] Add `motionGateShowRadS` and `motionGateHideRadS` sliders to PHYSICS_PARAMS (currently missing — config has them, UI doesn't)
- [ ] Fix `refreshAllSliders()`: add `data-param` attribute to each `<input>` during creation, look up by attribute instead of value matching. Current code has a dead loop (lines 203-206) and uses `.find()` by value mismatch which maps the wrong param when multiple values differ
- [ ] Add per-section reset buttons (one per accordion section)
- [ ] Add global "Reset all" button (already exists, verify it works with accordion)

## Phase 5: Wire Into Ghost Page
- [ ] Verify `GhostCalibrationPage` loads config via `loadTuningConfig()` (already wired)
- [ ] Verify `tuning` is passed to `GhostMotionPipeline` deps (already wired)
- [ ] Verify `TuningPanel` is mounted in the ghost page DOM (already wired)
- [ ] Verify `exportJson()` includes `tuning` snapshot (already wired)
- [ ] Telemetry display reads gate thresholds from `tuning` (not hardcoded)

## Phase 6: Validation
- [ ] Verify on Pixel 7a: drawer keeps telemetry bar visible; rectangle overlap is minor and acceptable
- [ ] Verify accordion behavior: only one section open at a time
- [ ] Verify slider changes take effect within one RAF frame
- [ ] Verify model switch resets pipeline state
- [ ] Verify exported JSON includes tuning config snapshot
- [ ] Run full test suite — all tests pass
