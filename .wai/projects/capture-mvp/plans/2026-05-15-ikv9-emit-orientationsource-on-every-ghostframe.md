---
tags: [pipeline-run:tdd-ro5-2026-05-15-ikv9-orientation-source, pipeline-step:plan]
---

ikv9: emit orientationSource on every GhostFrame.

Type:
  export type OrientationSource = 'gyro' | 'absolute' | 'hybrid' | 'hybrid-fallback-gyro' | 'hybrid-fallback-absolute'
  GhostFrame gains: orientationSource: OrientationSource

Label rules (from design.md):
- model='gyro' → 'gyro'
- model='absolute' → 'absolute'
- model='hybrid' AND gyro present AND absolute fresh → 'hybrid'
- model='hybrid' AND gyro present AND absolute stale/missing → 'hybrid-fallback-gyro'
- model='hybrid' AND gyro missing AND absolute present → 'hybrid-fallback-absolute'
- gate-closed early-return frame → 'gyro' (matches today's pre-hybrid contract)

Tests: 5 tests covering each label across the rafLoop output.

Files:
- src/sensors/ghostOverlay.ts: add OrientationSource type, extend GhostFrame
- src/sensors/GhostMotionPipeline.ts: compute label in rafLoop, attach to onFrame call
- src/sensors/GhostMotionPipeline.test.ts: +5 tests
