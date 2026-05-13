# Tasks: Add Ghost Tuning Panel

## Phase 1: Config Foundation
- [x] Update `src/ghost/tuningConfig.ts`: change localStorage key to `miblioteca:ghost-tuning-v1` (prevents origin collision, enables schema migration)
- [x] Verify `tuning` field on `CalibrationExport` in `src/ghost/types.ts` (already exists)
- [x] Write unit tests for config round-trip, corrupt localStorage fallback, defaults match constants

## Phase 2: Shared Pipeline Factory
- [x] Create `src/sensors/createGhostPipelineDeps.ts` with `GhostPipelineOptions` interface and `createGhostPipelineDeps()` factory
- [x] Factory handles: Gyroscope construction, deviceorientation listener, getOrientation/getBeta callbacks
- [x] Factory accepts site-specific options: `enableMotionGate`, `tuning`, `onGyroSample`, display dimension getters
- [x] Refactor `src/sensors/ghostOverlayCanvas.ts` to use factory instead of inline sensor wiring
- [x] Refactor `src/ghost/GhostCalibrationPage.ts` to use factory instead of inline sensor wiring
- [x] Add parity test: two factory instances with different `enableMotionGate` values receive the same `deviceorientation` events → both `getOrientation()` and `getBeta()` return identical values
- [x] Remove duplicated sensor wiring code from both sites
- [x] Verify all existing tests still pass after refactor

## Phase 3: Pipeline Accepts Runtime Config
- [x] Verify `GhostMotionPipelineDeps.tuning` is optional and pipeline reads it per-frame (already wired)
- [x] Verify `computeOrientationDelta` reads smoothing params from passed config (already wired)
- [x] Verify `feedGhostAccel` reads ZUPT params from passed config (already wired)
- [x] Verify `motionGateVisible` reads gate thresholds from passed config (already wired)
- [x] Verify pipeline detects model change mid-run and resets orientation state (already wired)
- [x] Update pipeline tests to cover tuning config override paths

## Phase 4: Fix Tuning Panel UI
Existing `TuningPanel.ts` has defects. Fix and extend:
- [x] Fix toggle button size: 40×40 → 48×48 (WCAG 2.5.5 minimum touch target)
- [x] Fix drawer max-height: 55vh → 40vh (leaves calibration rectangle visible on 915px viewport)
- [x] Fix drawer background: `rgba(0,0,0,0.85)` → `rgba(0,0,0,0.88)` (match design spec)
- [x] Fix slider grid: `90px 1fr 55px` → `80px 1fr 60px` (match design spec, wider value column)
- [x] Add accordion behavior to sections: tap section header to expand/collapse, only one section open at a time
- [x] Add `motionGateShowRadS` and `motionGateHideRadS` sliders to PHYSICS_PARAMS (currently missing — config has them, UI doesn't)
- [x] Fix `refreshAllSliders()`: add `data-param` attribute to each `<input>` during creation, look up by attribute instead of value matching. Current code has a dead loop (lines 203-206) and uses `.find()` by value mismatch which maps the wrong param when multiple values differ
- [x] Add per-section reset buttons (one per accordion section)
- [x] Add global "Reset all" button (already exists, verify it works with accordion)

## Phase 5: Wire Into Ghost Page
- [x] Verify `GhostCalibrationPage` loads config via `loadTuningConfig()` (already wired)
- [x] Verify `tuning` is passed to `GhostMotionPipeline` deps (already wired)
- [x] Verify `TuningPanel` is mounted in the ghost page DOM (already wired)
- [x] Verify `exportJson()` includes `tuning` snapshot (already wired)
- [x] Telemetry display reads gate thresholds from `tuning` (not hardcoded)

## Phase 6: Validation
- [ ] Verify on Pixel 7a: drawer keeps telemetry bar visible; rectangle overlap is minor and acceptable
- [x] Verify accordion behavior: only one section open at a time
- [ ] Verify slider changes take effect within one RAF frame
- [x] Verify model switch resets pipeline state
- [x] Verify exported JSON includes tuning config snapshot
- [x] Run full test suite — all tests pass
