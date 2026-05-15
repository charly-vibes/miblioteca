---
tags: [pipeline-run:tdd-ro5-2026-05-15-hybrid-orientation-x5pz, pipeline-step:review]
---

RO5 review for x5pz (type surface + persistence)

Diff scope:
- src/ghost/tuningConfig.ts: OrientationModel union widened to include 'hybrid'
- src/sensors/GhostMotionPipeline.ts: import OrientationModel; activeModel field type generalized
- src/ghost/tuningConfig.test.ts: +2 tests (type union check, hybrid storage round-trip)

Pass 1 Accuracy: OK. Union widens cleanly. activeModel typed as OrientationModel future-proofs the field. Runtime behavior unchanged.

Pass 2 Completeness: covers type widening, round-trip, defaults unchanged. Not covered (intentionally deferred to downstream tickets): runtime emission of 'hybrid' (hpct), tuning panel selector (4yde), pipeline behavioural tests (hpct).

Pass 3 Clarity: test titles descriptive. Imports follow existing pattern. No comments needed.

Pass 4 Actionability:
- LOW hpct-followup: onGyroReading 'else' branch now also accepts 'hybrid' as a silent passthrough behaving like absolute. Intentional per tracer-bullet sequencing. Already in hpct scope.
- LOW orphan-guard: no test asserts that loading a config with an unknown legacy orientationModel value falls back to 'gyro'. Out of x5pz scope.

Pass 5 Integration: import path matches existing pattern; widening flows cleanly through GhostMotionPipeline; openspec proposal lists 'hybrid' as the third union member.

Score: 0 critical / 0 high / 0 medium / 2 low (both deferred to downstream tickets).
Full vitest suite green (833 tests). Tsc green. Ready to ship.
