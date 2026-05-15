---
tags: [pipeline-run:tdd-ro5-2026-05-15-hpct-hybrid-filter, pipeline-step:fix]
---

hpct fix-pass: applied all RO5 findings.

MEDIUM [test-pitch] — DONE: added 'blends gyro pitch toward absolute orientation target' to GhostMotionPipeline.test.ts mirroring the yaw test.

LOW [test-shortestAngle] — DONE: added 3 unit tests for shortestAngle (identity, wrap, edge -π/+π) and 2 for rawOrientationYawPitch in ghostOverlay.test.ts.

LOW [doc-link] — DONE: added a 2-line comment in the hybrid rafLoop block pointing to design.md fusion formula.

LOW [extract-helper] — DEFERRED: keep inline until 5okt/jtbh add more state (freshness gate, per-frame clamp); extraction makes more sense once the block grows.

Caught regression while running: original shortestAngle wrap test asserted 3π → -π, but the implementation correctly maps 3π → π (since (-π, π] keeps +π). Test corrected; impl unchanged.

Final: 840 tests green (+6 from baseline x5pz close). Tsc clean.
