---
tags: [pipeline-run:tdd-ro5-2026-05-15-hybrid-orientation-x5pz, pipeline-step:red]
---

RED: added 2 failing type-level tests in src/ghost/tuningConfig.test.ts — expectTypeOf union check (line 114) and orientationModel='hybrid' round-trip assignment (line 118). Both fail under 'npx tsc --noEmit -p tsconfig.app.json'. All other tests (runtime + type) still green.
