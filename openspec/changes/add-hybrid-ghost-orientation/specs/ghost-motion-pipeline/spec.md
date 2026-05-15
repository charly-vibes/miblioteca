## ADDED Requirements

### Requirement: Hybrid orientation fusion mode
The ghost motion pipeline SHALL provide a `hybrid` orientation mode that uses
both gyroscope samples and absolute orientation samples in the same tracking
session.

In hybrid mode:
- gyroscope input remains the fast-response orientation source
- absolute orientation remains the drift-correction reference source
- translation tracking continues to use the existing motion/acceleration path unchanged

#### Scenario: Hybrid mode responds to gyro motion immediately
- **GIVEN** `orientationModel` is `hybrid` and both gyro and absolute orientation inputs are available
- **WHEN** a short horizontal pan produces fresh gyro samples before the next RAF tick
- **THEN** the next emitted `GhostFrame` reflects that motion without waiting for a model switch or a separate absolute-only integration path

#### Scenario: Hybrid mode corrects long-run gyro drift
- **GIVEN** `orientationModel` is `hybrid`, the device returns near its starting pose, and the pure gyro estimate has accumulated residual drift
- **WHEN** fresh absolute orientation samples continue arriving across subsequent RAF ticks
- **THEN** the emitted yaw/pitch values converge back toward the absolute reference instead of preserving the full residual gyro drift

#### Scenario: Hybrid mode preserves translation behavior
- **GIVEN** `orientationModel` is `hybrid` and motion/acceleration samples are present
- **WHEN** the device translates laterally with minimal rotation
- **THEN** `dx_m` and `dy_m` evolve under the existing translation integration rules and are not disabled or redefined by the hybrid orientation path

### Requirement: Hybrid orientation complementary filter
The pipeline SHALL combine gyroscope and absolute orientation samples in hybrid
mode using a per-frame complementary filter that pulls the gyro estimate toward
the absolute target.

The blend coefficient SHALL reuse the existing stillness-aware gains:
- still → `stillGain`
- moving → `movingGain`

The angular delta SHALL be computed as the shortest signed angle so that the
`±π` wraparound does not produce large corrections.

#### Scenario: Still device pulls strongly toward absolute orientation
- **GIVEN** `orientationModel` is `hybrid`, the stillness detector reports still, and the absolute reference differs from the gyro estimate by a small angle
- **WHEN** the pipeline emits the next frame
- **THEN** the emitted yaw/pitch moves toward the absolute reference by approximately `stillGain * delta`, not the full delta and not zero

#### Scenario: Moving device favors the gyro estimate
- **GIVEN** `orientationModel` is `hybrid`, the stillness detector reports moving, and the absolute reference differs from the gyro estimate by a small angle
- **WHEN** the pipeline emits the next frame
- **THEN** the emitted yaw/pitch moves toward the absolute reference by approximately `movingGain * delta`, leaving most of the short-term motion under gyro control

### Requirement: Hybrid correction is rate-limited to suppress snaps
The per-frame correction applied to the gyro estimate in hybrid mode SHALL be
clamped to `±maxShiftRateRadS * dt` per axis before being added to the gyro
estimate. The clamp SHALL apply only to the correction term, not to the gyro
integration itself.

#### Scenario: Discontinuous absolute jump is smoothed
- **GIVEN** `orientationModel` is `hybrid` and a single absolute-orientation sample arrives that differs from the gyro estimate by an angle larger than `maxShiftRateRadS * dt`
- **WHEN** the pipeline emits the next frame
- **THEN** the yaw correction applied that frame does not exceed `maxShiftRateRadS * dt`, and subsequent frames continue to ramp toward the absolute reading instead of snapping in one step

### Requirement: Hybrid orientation freshness gating
The pipeline SHALL treat an absolute orientation reading as fresh only when its
last-arrival timestamp is within `300 ms` of the current RAF tick. Stale
absolute readings SHALL NOT contribute to fusion and SHALL trigger the gyro
fallback path.

#### Scenario: Stale absolute reading triggers gyro fallback
- **GIVEN** `orientationModel` is `hybrid`, gyro samples are arriving, and the last absolute orientation sample arrived more than `300 ms` ago
- **WHEN** the pipeline emits the next frame
- **THEN** yaw/pitch update from the gyro path only and the frame reports `orientationSource = 'hybrid-fallback-gyro'`

### Requirement: Hybrid mode seeds gyro state on entry
The pipeline SHALL seed its internal gyro yaw/pitch state when `orientationModel`
switches to `hybrid`:
- if a fresh absolute reading exists, seed both axes from it
- otherwise, retain the last gyro state

#### Scenario: Entering hybrid with fresh absolute reading does not snap
- **GIVEN** the pipeline is running in `absolute` mode with a known absolute yaw/pitch
- **WHEN** `orientationModel` switches to `hybrid` and at least one fresh absolute sample is available
- **THEN** the first hybrid frame's yaw/pitch is approximately equal to the last absolute reading, not zero and not the previous gyro accumulator

### Requirement: omegaMag source in hybrid mode
The pipeline SHALL derive `omegaMag` from the gyroscope rotation rate when gyro
samples are available, regardless of which orientation source drove yaw/pitch
on that frame. When gyro is unavailable, `omegaMag` SHALL be `0`.

#### Scenario: Hybrid frame uses gyro rotation rate for motion gate
- **GIVEN** `orientationModel` is `hybrid` and both sensors are available
- **WHEN** the pipeline emits a frame
- **THEN** `omegaMag` reflects the gyro angular-velocity magnitude, and the motion gate (`motionGateShowRadS` / `motionGateHideRadS`) behaves identically to `gyro` mode

### Requirement: Hybrid first-frame behavior
The pipeline SHALL handle the first frame after entering hybrid mode without
emitting undefined or zero-seeded yaw/pitch:
- fresh absolute, no gyro yet → emit the absolute reading directly
- fresh gyro, no absolute yet → behave as `gyro` until the first absolute sample arrives
- neither fresh → emit no orientation change beyond idle behavior

#### Scenario: First hybrid frame with only absolute available
- **GIVEN** `orientationModel` is `hybrid`, no gyro samples have arrived, and a fresh absolute reading exists
- **WHEN** the pipeline emits its first hybrid frame
- **THEN** yaw/pitch equal the absolute reading and the frame reports `orientationSource = 'hybrid-fallback-absolute'`

#### Scenario: First hybrid frame with only gyro available
- **GIVEN** `orientationModel` is `hybrid`, gyro samples are arriving, and no absolute sample has arrived yet
- **WHEN** the pipeline emits its first hybrid frame
- **THEN** yaw/pitch update from the gyro path and the frame reports `orientationSource = 'hybrid-fallback-gyro'`

### Requirement: Hybrid orientation fallback behavior
The ghost motion pipeline SHALL degrade safely when hybrid mode is selected but
one of its required sensor streams is unavailable.

#### Scenario: Hybrid falls back to gyro when absolute orientation is unavailable
- **GIVEN** `orientationModel` is `hybrid`, gyro samples are available, and `getOrientation()` returns no usable absolute sample
- **WHEN** the pipeline emits frames
- **THEN** yaw/pitch continue updating from the gyro path rather than freezing or throwing, and each frame reports `orientationSource = 'hybrid-fallback-gyro'`

#### Scenario: Hybrid falls back to absolute orientation when gyro is unavailable
- **GIVEN** `orientationModel` is `hybrid`, no `gyro` sensor is attached, and absolute orientation samples are available
- **WHEN** the pipeline emits frames
- **THEN** yaw/pitch continue updating from the absolute-orientation path, `omegaMag` is `0`, and each frame reports `orientationSource = 'hybrid-fallback-absolute'`

#### Scenario: Runtime switch into hybrid resets orientation state
- **GIVEN** a running pipeline currently using `gyro` or `absolute`
- **WHEN** `orientationModel` changes to `hybrid`
- **THEN** the pipeline resets its internal orientation state, applies the seeding rule, and only then emits hybrid-tracked frames so stale state from the previous mode is not reused

### Requirement: Per-frame orientation source attribution
Every `GhostFrame` SHALL include an `orientationSource` field identifying which
path produced its yaw/pitch values:
- `'gyro'` in gyro mode
- `'absolute'` in absolute mode
- `'hybrid'` when both sources contributed via the complementary filter
- `'hybrid-fallback-gyro'` when hybrid was selected but only gyro contributed
- `'hybrid-fallback-absolute'` when hybrid was selected but only absolute contributed

#### Scenario: Exported recordings expose orientation source per frame
- **GIVEN** a calibration session was recorded with `orientationModel = 'hybrid'`
- **WHEN** the exported JSON is inspected
- **THEN** every entry in `ghostFrames` contains an `orientationSource` field with one of the documented values
