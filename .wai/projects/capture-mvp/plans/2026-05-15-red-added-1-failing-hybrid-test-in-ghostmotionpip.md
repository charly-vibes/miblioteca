---
tags: [pipeline-run:tdd-ro5-2026-05-15-hpct-hybrid-filter, pipeline-step:red]
---

RED: added 1 failing hybrid test in GhostMotionPipeline.test.ts. Test asserts hybrid yaw is strictly between gyro-only (-0.05) and absolute target (0). Current output: yaw=0 because hybrid silently routes to the absolute else-branch which updates only omegaMag. 30 other pipeline tests still green.
