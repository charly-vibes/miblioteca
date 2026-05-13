# Proposal: Add Ghost Tuning Panel

## Summary

Add a live parameter-tuning panel to the ghost calibration page (`/ghost.html`)
that lets the operator adjust all pipeline parameters on-device in real-time.
This eliminates the current cycle of "change constant → redeploy → test on phone"
and allows rapid iteration during field calibration.

## Motivation

The ghost overlay pipeline has ~15 tunable constants (smoothing gains, deadbands,
capture gate thresholds, physics constants) spread across `ghostOverlay.ts` and
`ghostCaptureGate.ts`. Every constant change currently requires a code edit,
rebuild, and deploy cycle. On a Pixel 7a in the field this loop takes minutes.
A live tuning panel reduces iteration to seconds.

## Scope

- **In scope:** tuning UI, tuning config type and persistence, pipeline accepting
  runtime config overrides, model switching (gyro ↔ absolute orientation),
  shared pipeline factory ensuring `/ghost` and capture view use identical logic
- **Out of scope:** presets library, remote config push, A/B testing infrastructure

## Target Device

Pixel 7a — 412×915 CSS viewport (portrait). The panel must keep the telemetry
bar and ghost overlay tracking dots visible while parameters are being adjusted.
Minor overlap with the calibration rectangle's lower edge is acceptable during
tuning since the operator observes tracking behavior, not rectangle shape.

## Current State

A partial implementation exists in the working tree (uncommitted):

- `src/ghost/tuningConfig.ts` — `TuningConfig` type, defaults, localStorage persistence (functional)
- `src/ghost/TuningPanel.ts` — panel UI (functional but has defects: 40px toggle target, 55vh max-height, no accordion, broken `refreshAllSliders()`)
- `src/sensors/GhostMotionPipeline.ts` — accepts `TuningConfig` and reads it per-frame (functional)
- `src/sensors/ghostOverlay.ts` — pure functions accept config overrides (functional)
- `src/ghost/types.ts` — `CalibrationExport.tuning` field added (functional)
- `src/ghost/GhostCalibrationPage.ts` — wires panel and config (functional)

Remaining work focuses on **fixing defects** in the existing UI, adding **accordion behavior**, and creating the **shared pipeline factory**.

## Affected Areas

| File | Change |
|------|--------|
| `src/ghost/tuningConfig.ts` | Exists — add key versioning |
| `src/ghost/TuningPanel.ts` | Exists — fix toggle size, max-height, add accordion, fix `refreshAllSliders()` |
| `src/ghost/GhostCalibrationPage.ts` | Exists — refactor to use shared factory |
| `src/sensors/GhostMotionPipeline.ts` | Exists — already accepts `TuningConfig` (verify) |
| `src/sensors/ghostOverlay.ts` | Exists — already accepts config overrides (verify) |
| `src/ghost/types.ts` | Exists — already has `tuning` field (verify) |
| `src/sensors/createGhostPipelineDeps.ts` | New — shared factory for pipeline deps |
| `src/sensors/ghostOverlayCanvas.ts` | Refactor to use shared factory |

## Spec Deltas

- `ghost-tuning-panel` — new capability (7 requirements, 22 scenarios)
  - Shared Pipeline Factory (3 scenarios)
  - Tuning Config Type and Defaults (4 scenarios)
  - Tuning Panel Toggle (3 scenarios)
  - Drawer Layout for Small Screens (3 scenarios)
  - Parameter Sliders (4 scenarios)
  - Orientation Model Toggle (2 scenarios)
  - Reset and Export (3 scenarios)
