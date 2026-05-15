## MODIFIED Requirements

### Requirement: Tuning Config Type and Defaults
The system SHALL define a `TuningConfig` type containing all tunable pipeline
parameters with factory defaults sourced from the compiled module constants.

Parameters:
- `orientationModel`: `'gyro' | 'absolute' | 'hybrid'` (default: `'gyro'`)
- `stillThreshold`, `stillEmaAlpha`, `yawDeadbandRad`, `pitchDeadbandRad`,
  `stillGain`, `movingGain`, `maxShiftRateRadS` (orientation smoothing)
- `maxShiftXPx`, `maxMagPx` (capture gate thresholds)
- `hFovDeg`, `zuptThresholdMs2`, `zuptTauS`, `motionGateShowRadS`,
  `motionGateHideRadS` (physics constants)

#### Scenario: Defaults match module constants
- **GIVEN** the compiled constants in `ghostOverlay.ts` and `ghostCaptureGate.ts`
- **WHEN** `defaultTuningConfig()` is called
- **THEN** every field matches the corresponding exported constant

#### Scenario: Config round-trips through localStorage
- **GIVEN** a valid `TuningConfig` object including `orientationModel: 'hybrid'`
- **WHEN** it is saved via `saveTuningConfig()` and loaded via `loadTuningConfig()`
- **THEN** the loaded config deep-equals the saved config

#### Scenario: Corrupt localStorage falls back to defaults
- **GIVEN** `localStorage` contains invalid JSON at the tuning config key
- **WHEN** `loadTuningConfig()` is called
- **THEN** it returns the factory defaults without throwing

#### Scenario: localStorage key is namespaced and versioned
- **GIVEN** the tuning config persistence implementation
- **WHEN** the storage key is used
- **THEN** it uses `miblioteca:ghost-tuning-v1` (namespaced to prevent origin collision, versioned for schema migration)

### Requirement: Orientation Model Toggle
The drawer SHALL provide a toggle to switch between `gyro`, `absolute`, and `hybrid`
orientation models.

#### Scenario: Model toggle is always visible in the drawer
- **GIVEN** the drawer is open
- **WHEN** the drawer content renders
- **THEN** the model toggle appears at the top of the drawer content, above the collapsible sections, and offers `gyro`, `absolute`, and `hybrid` choices

#### Scenario: Switching model resets pipeline state
- **GIVEN** the drawer is open and a model is selected
- **WHEN** the user selects a different orientation model
- **THEN** `TuningConfig.orientationModel` is updated, the pipeline detects the change on its next RAF frame, and resets its internal orientation and ghost state
