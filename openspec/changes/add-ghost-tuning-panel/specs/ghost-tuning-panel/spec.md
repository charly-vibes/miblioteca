## ADDED Requirements

### Requirement: Shared Pipeline Factory
The system SHALL provide a single factory function `createGhostPipelineDeps()`
that constructs `GhostMotionPipelineDeps` for both the capture view and the
ghost calibration page. Both entry points MUST use this factory — no inline
sensor wiring.

#### Scenario: Factory produces identical orientation output regardless of options
- **GIVEN** two factory instances created with different `enableMotionGate` values
- **WHEN** the same sequence of `deviceorientation` events is dispatched to both
- **THEN** both instances' `getOrientation()` callbacks return identical `{alpha, beta, gamma}` values and both `getBeta()` callbacks return identical numbers at every point in the sequence

#### Scenario: Capture view and ghost page both use the factory
- **GIVEN** the production source code of `ghostOverlayCanvas.ts` and `GhostCalibrationPage.ts`
- **WHEN** either file constructs a `GhostMotionPipeline`
- **THEN** it calls `createGhostPipelineDeps()` with site-specific options and does NOT perform any sensor wiring outside the factory

#### Scenario: Factory handles sensor unavailability gracefully
- **GIVEN** a browser where `Gyroscope` is not available (undefined or throws on construction)
- **WHEN** the factory is called
- **THEN** the returned deps have `gyro: null` and the pipeline falls back to devicemotion-only operation without throwing

---

### Requirement: Tuning Config Type and Defaults
The system SHALL define a `TuningConfig` type containing all tunable pipeline
parameters with factory defaults sourced from the compiled module constants.

Parameters:
- `orientationModel`: `'gyro' | 'absolute'` (default: `'gyro'`)
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
- **GIVEN** a valid `TuningConfig` object
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

---

### Requirement: Tuning Panel Toggle
The ghost calibration page SHALL display a toggle button that opens and closes
the tuning panel drawer.

#### Scenario: Toggle button is always visible
- **GIVEN** the ghost calibration page is constructed
- **WHEN** the page renders
- **THEN** a toggle button (gear icon) is visible at fixed position bottom-left with a minimum touch target of 48×48 CSS pixels

#### Scenario: Tapping toggle opens the drawer
- **GIVEN** the drawer is closed
- **WHEN** the toggle button is tapped
- **THEN** the drawer slides up from the bottom edge, the toggle icon changes to a close indicator, and the drawer is visible

#### Scenario: Tapping toggle closes the drawer
- **GIVEN** the drawer is open
- **WHEN** the toggle button is tapped
- **THEN** the drawer is hidden and the toggle icon returns to the gear icon

---

### Requirement: Drawer Layout for Small Screens
The tuning panel drawer SHALL fit within a 412×915 CSS viewport without
obscuring the telemetry bar. Minor overlap with the lower portion of the
calibration rectangle is acceptable during tuning.

#### Scenario: Drawer max-height preserves telemetry visibility
- **GIVEN** a 412×915 CSS viewport (Pixel 7a portrait)
- **WHEN** the drawer is open
- **THEN** the drawer's max-height is at most 40vh (≈366px), positioned at the bottom of the viewport. The telemetry bar (top 70px) remains fully visible. The drawer may overlap the lower portion of the calibration rectangle — this is acceptable since the operator watches tracking behavior, not rectangle shape, while tuning

#### Scenario: Sections use accordion behavior
- **GIVEN** the drawer contains sections: Orientation, Capture Gate, Physics
- **WHEN** a section header is tapped
- **THEN** that section expands and all other sections collapse (only one section open at a time)

#### Scenario: Drawer scrolls within its bounds
- **GIVEN** an expanded section's content exceeds the drawer's max-height
- **WHEN** the user scrolls inside the drawer
- **THEN** the drawer scrolls vertically within its bounds without scrolling the page behind it

---

### Requirement: Parameter Sliders
Each tunable parameter SHALL be adjustable via a range slider with live
numeric readout.

#### Scenario: Slider reflects current value
- **GIVEN** the drawer is opened
- **WHEN** the sliders render
- **THEN** each slider's position and value display match the current `TuningConfig` values

#### Scenario: Dragging a slider updates the config immediately
- **GIVEN** the drawer is open with a visible slider
- **WHEN** the user drags a slider to a new position
- **THEN** the corresponding `TuningConfig` field is updated, the value display reflects the new value, and the pipeline uses the new value on its next RAF frame

#### Scenario: Slider layout fits 412px width
- **GIVEN** a 412px-wide viewport with 10px padding on each side (392px usable)
- **WHEN** a parameter row is rendered
- **THEN** it uses a grid layout: label (≤80px, ellipsis overflow) + range input (flexible, ≥200px) + value display (≤60px, right-aligned monospace)

#### Scenario: Config is persisted on change
- **GIVEN** a slider exists in the drawer
- **WHEN** any slider value changes
- **THEN** the full config is written to `localStorage` under the versioned key

---

### Requirement: Orientation Model Toggle
The drawer SHALL provide a toggle to switch between `gyro` and `absolute`
orientation models.

#### Scenario: Model toggle is always visible in the drawer
- **GIVEN** the drawer is open
- **WHEN** the drawer content renders
- **THEN** the model toggle appears at the top of the drawer content, above the collapsible sections

#### Scenario: Switching model resets pipeline state
- **GIVEN** the drawer is open and a model is selected
- **WHEN** the user selects a different orientation model
- **THEN** `TuningConfig.orientationModel` is updated, the pipeline detects the change on its next RAF frame, and resets its internal orientation and ghost state

---

### Requirement: Reset and Export
The tuning panel SHALL provide reset controls and include tuning config
in calibration exports.

#### Scenario: Per-section reset restores section defaults
- **GIVEN** the drawer is open with one section expanded and its parameters modified
- **WHEN** the user taps the reset button within that section
- **THEN** only the parameters in that section are restored to factory defaults, sliders are updated, and the config is persisted

#### Scenario: Global reset restores all defaults
- **GIVEN** the drawer is open with parameters modified across multiple sections
- **WHEN** the user taps the "Reset all" button at the bottom of the drawer
- **THEN** all parameters including the orientation model are restored to factory defaults, all sliders and the model toggle are updated, and the config is persisted

#### Scenario: Export includes tuning snapshot
- **GIVEN** a calibration session with modified tuning parameters
- **WHEN** the user exports calibration JSON
- **THEN** the export payload contains a `tuning` field with a snapshot of the full `TuningConfig` at time of export
