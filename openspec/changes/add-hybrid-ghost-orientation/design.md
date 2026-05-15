## Context
The current ghost pipeline exposes two mutually exclusive orientation modes:
- `gyro`: integrates angular velocity continuously
- `absolute`: derives yaw/pitch from absolute orientation samples and smooths them with still/moving gains

The user request is not for another toggle label, but for a true combined mode where both inputs are active at once. This is a cross-cutting change because it affects runtime state transitions, the persisted tuning schema, UI selection, and test coverage.

## Goals / Non-Goals
- Goals:
  - Preserve gyro responsiveness during quick pans
  - Reduce long-run drift by continuously referencing absolute orientation
  - Keep translation tracking unchanged
  - Degrade safely when one sensor stream is absent
- Non-Goals:
  - Introduce a full quaternion EKF or magnetometer calibration workflow
  - Rework motion gating or translation math
  - Add new user-exposed fusion sliders in this change

## Decisions

### Decision: add `hybrid` as a third orientation model
`orientationModel` becomes `'gyro' | 'absolute' | 'hybrid'`.

Rationale:
- Keeps current behavior stable for existing users
- Makes hybrid opt-in for calibration and field validation
- Avoids silently redefining `absolute` or `gyro`

### Decision: hybrid mode applies a complementary filter per frame
Hybrid mode integrates gyro samples to produce a fast estimate, then per RAF tick pulls that estimate toward the absolute-orientation target by a fraction `α`:

```
yaw_out   = yaw_gyro   + α * shortestAngle(yaw_absolute   - yaw_gyro)
pitch_out = pitch_gyro + α * shortestAngle(pitch_absolute - pitch_gyro)
```

`α` is selected from the existing tuning knobs:
- still (per existing stillness detector) → `α = stillGain`
- moving → `α = movingGain`

Rationale:
- Cheap, deterministic, no new knobs in this change
- Honors the design goal of "reuse existing gains"
- Still ⇒ stronger pull toward absolute (drift correction dominates)
- Moving ⇒ weaker pull (trust gyro for low-latency motion)
- `shortestAngle` prevents large corrections at the `±π` wraparound

### Decision: absolute-orientation freshness is time-gated
A cached absolute reading is considered fresh when its last-arrival timestamp is within `absoluteOrientationStaleMs` (default `300 ms`) of the current RAF tick.

Rationale:
- Value-based (`null`) detection misses the case where the browser stops emitting but does not null out the field
- `300 ms` ≈ 10 RAF frames, long enough to tolerate jitter on iOS Safari, short enough to fall back before the user notices stale drift correction
- This threshold is internal, not user-tunable in this change

### Decision: per-frame correction is rate-limited to suppress snaps
The fusion correction term `α * shortestAngle(...)` is clamped to `±maxShiftRateRadS * dt` per axis before being added to the gyro estimate.

Rationale:
- Browser sensor-fusion engines can step the absolute reading discontinuously (e.g. after a magnetometer re-lock)
- Reusing the existing `maxShiftRateRadS` knob means snaps become smooth ramps without introducing a new control
- The clamp only affects the correction term, not the gyro integration, so fast motion is unaffected

### Decision: mode-switch seeding avoids visible jumps
Entering `hybrid`:
- If a fresh absolute reading exists, seed both `yaw_gyro` and `pitch_gyro` from it
- Otherwise, retain the last gyro state (or zero if uninitialized)

Leaving `hybrid` follows the same reset path as today's `gyro ↔ absolute` switch.

Rationale:
- Prevents the ghost from snapping when the operator toggles modes mid-session
- Keeps reset behavior consistent with the existing "Switching model resets pipeline state" scenario

### Decision: `omegaMag` always comes from the gyro path in hybrid
Stillness detection, motion gating, and ZUPT continue to consume `omegaMag` derived from the literal gyroscope rotation rate, regardless of which orientation source drives yaw/pitch on a given frame.

Rationale:
- `omegaMag` is a rotation-rate quantity; absolute orientation does not provide it directly
- Keeps the motion gate semantically identical to `gyro` mode
- When gyro is absent (absolute-only fallback), `omegaMag` falls back to `0` and the gate behaves as it does in today's `absolute` mode

### Decision: emit a per-frame `orientationSource` debug field
Every `GhostFrame` in hybrid mode includes:

```
orientationSource:
  | 'hybrid'
  | 'hybrid-fallback-gyro'      // absolute stale/missing
  | 'hybrid-fallback-absolute'  // gyro missing
```

`gyro` and `absolute` modes emit their existing source labels.

Rationale:
- Recordings already proved their worth in diagnosing the translation bug; hybrid is harder to validate without per-frame attribution of which source actually drove the output
- Cheap to add (one enum field) and easy to grep in exported JSON

### Decision: first-frame behavior
- Fresh absolute, no gyro yet → emit the absolute reading directly (no integration)
- Fresh gyro, no absolute yet → behave as `gyro` until the first absolute sample arrives, then switch to the complementary filter on the next tick
- Neither fresh → emit no orientation change (idle)

Rationale:
- Prevents an initial frame from being either undefined or seeded from stale zeros
- Matches existing pipeline behavior at startup for the single-source modes

### Decision: explicit fallback rules
Hybrid requires both sources for full behavior, but the pipeline must remain usable when one source is missing.

Fallback order:
- Gyro available, absolute stale/missing → behave as `gyro`, emit `orientationSource = 'hybrid-fallback-gyro'`
- Absolute available, gyro missing → behave as `absolute` for yaw/pitch, `omegaMag = 0`, emit `orientationSource = 'hybrid-fallback-absolute'`
- Both unavailable → no new orientation change beyond existing idle behavior

Rationale:
- Prevents hybrid mode from becoming a dead end on browsers with partial sensor support
- Keeps model selection predictable during calibration experiments
- The fallback labels make the failure mode visible in exports

## Risks / Trade-offs
- Reusing existing gains (`stillGain` / `movingGain`) as the fusion `α` is good enough for first validation but may need hybrid-specific knobs later; deferred until real-world data shows a need
- The complementary filter assumes the absolute reading is in the same frame of reference as the gyro estimate; if the device's absolute-orientation provider applies its own smoothing or reset behavior, the fusion will inherit that lag — acceptable for this iteration
- Fallback branching increases the surface area of pipeline tests and must be exercised explicitly

## Migration Plan
1. Extend the model type and storage round-trip handling so persisted configs can load `hybrid`
2. Update the tuning panel to surface the third option
3. Implement hybrid fusion in the pipeline behind the existing runtime model switch, including freshness gating, rate clamp, seeding, and `orientationSource` emission
4. Validate with focused tests and manual ghost-page runs

## Open Questions
None remaining for this iteration. Future questions deferred to post-validation:
- Whether `α` should become a hybrid-specific knob separate from `stillGain` / `movingGain`
- Whether `absoluteOrientationStaleMs` should become user-tunable
