---
tags: [pipeline-run:tdd-ro5-2026-05-15-pkxx-mode-switch-seeding, pipeline-step:plan]
---

pkxx: runtime mode-switch seeding into hybrid + translation preservation.

Current bug at GhostMotionPipeline.ts:175 — mode switch calls initialGhostState() which zeros dx_m/dy_m/velX/velY too. Translation should NOT be reset on mode switch.

Behavior:
- On runtime model change, preserve translation state (dx_m, dy_m, velX, velY, lastAccelT) while resetting orientation (yawIntegral, pitchIntegral, lastT, omegaMag).
- On switch INTO hybrid: if deps.getOrientation() returns non-null in the SAME rafLoop tick, seed orientationState from it (lazy seed already does this via the existing !orientationState path); yaw stays at 0 (the new qRef defines origin).
- On switch INTO any mode: clear orientationState (the qRef of the prior session is no longer applicable).

Test strategy:
- TEST A: gyro → hybrid runtime switch preserves dx_m (translation) but resets yaw to 0.
- TEST B: absolute → hybrid runtime switch preserves dx_m, resets yaw, lazily seeds new qRef on first frame.

Implementation: change initialGhostState() call at rafLoop:175 to preserve translation fields. Provide a small helper or inline spread.
