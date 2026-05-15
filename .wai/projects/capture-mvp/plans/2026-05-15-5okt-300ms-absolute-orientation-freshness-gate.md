---
tags: [pipeline-run:tdd-ro5-2026-05-15-5okt-freshness-gate, pipeline-step:plan]
---

5okt: 300ms absolute-orientation freshness gate + gyro fallback in hybrid mode.

Behavior:
- Pipeline tracks the wallclock of the last RAF tick where deps.getOrientation() returned non-null. Call this lastAbsoluteFreshMs.
- In rafLoop hybrid branch, before applying the complementary filter correction, check: now - lastAbsoluteFreshMs > 300 → skip absolute correction, just emit gyro yaw/pitch (which has continued integrating in onGyroReading). Effective gyro-fallback for stale absolute.
- If getOrientation() returns null this frame: do not update lastAbsoluteFreshMs, do not apply correction (same as today).
- If getOrientation() returns non-null but the gate is open (last fresh >300ms ago): re-seed orientationState as the new reference (since the qRef is stale too), but defer correction to next frame.

NOT in scope:
- ikv9: emitting 'hybrid-fallback-gyro' label (the assertion lives in ikv9's test set, exercising 5okt's gate)
- jtbh: per-frame clamp

Test strategy (vitest):
- TEST A 'stale absolute reading routes hybrid yaw through gyro alone': use deps.now to simulate elapsed time > 300ms between absolute samples. Compare to baseline hybrid (where absolute is fresh) → stale-path yaw equals pure-gyro yaw, not the blended value.
- TEST B 'fresh absolute (within 300ms) still applies the complementary filter': sanity guard that the gate doesn't fire prematurely.

Edge cases:
- getOrientation returns null forever: gate never opens (stays at -Infinity); hybrid yaw = gyro yaw (already the current behavior).
- First fresh reading after long gap: lastAbsoluteFreshMs is updated, qRef is RE-SEEDED so that drift doesn't accumulate from the stale reference, correction is skipped this frame (to avoid a snap), applied from the next frame onward.

Affected files:
- src/sensors/GhostMotionPipeline.ts: add lastAbsoluteFreshMs private field; modify hybrid branch in rafLoop
- src/sensors/GhostMotionPipeline.test.ts: +2 tests

Acceptance per ticket:
- Stale-absolute test passes
- 5okt owns openspec task 1.2 doc note: design.md fallback table matches impl (verify during fix step)
