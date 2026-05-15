---
tags: [pipeline-run:tdd-ro5-2026-05-15-g02q-omegamag-sourcing, pipeline-step:plan]
---

g02q: regression tests proving omegaMag sources from gyro path under both gyro and hybrid modes, falls back to 0 when gyro is null. Inspection shows the current implementation already satisfies this (onGyroReading writes omegaMag from gx²+gy²+gz² for 'gyro' || 'hybrid' branches via feedGhostGyro; missing gyro means onGyroReading never fires and state.omegaMag stays at the initial 0). So this is a behavior-confirmation ticket — write the asserting tests; impl unchanged.
