---
tags: [pipeline-run:tdd-ro5-2026-05-15-hybrid-orientation-x5pz, pipeline-step:plan]
---

x5pz: extend OrientationModel union from 'gyro' | 'absolute' to 'gyro' | 'absolute' | 'hybrid' and prove storage round-trip preserves the new value.

Scope:
- src/ghost/tuningConfig.ts: widen the OrientationModel type union to include 'hybrid'
- src/ghost/tuningConfig.test.ts: add a focused round-trip test for orientationModel='hybrid'

Test strategy (vitest, jsdom):
- RED test 1: type-level — expectTypeOf<OrientationModel>().toEqualTypeOf<'gyro' | 'absolute' | 'hybrid'>() (will fail until union is widened)
- RED test 2: storage round-trip — save a TuningConfig with orientationModel='hybrid', call loadTuningConfig, assert the returned config.orientationModel === 'hybrid' (passes today because the field is opaque to storage, but expectTypeOf protects from regression and assigns the value to a typed variable)

Out of scope:
- Pipeline behavior, UI selector, freshness gate, clamp, seeding, omegaMag, debug field, first-frame, fallbacks (each is a separate ticket)

Affected tests:
- src/ghost/tuningConfig.test.ts (adds one type assertion + one round-trip test)
- existing tests should keep passing: defaults still produce 'gyro'

Acceptance:
- New test fails before the type change, passes after
- npx vitest run src/ghost/tuningConfig.test.ts green
- No production behavior change yet
