# Design: Ghost Tuning Panel

## Design Constraints

### Target: Pixel 7a (412×915 CSS viewport, portrait)

The ghost calibration page is a fullscreen camera view with layered elements:

```
┌──────────────────────────┐ 0px
│  telemetry bar (70px)    │
├──────────────────────────┤ 70px
│                          │
│    calibration rectangle │
│    (60%×40% viewport)    │
│    centered vertically   │
│                          │
├──────────────────────────┤ ~700px
│  hint text / buttons     │
│  stop btn / confirm btn  │
└──────────────────────────┘ 915px
```

The calibration rectangle (40% of viewport height, centered below the telemetry
bar) ends at approximately 670–700px depending on centering mode. A 40vh drawer
from the bottom starts at ~549px, which may overlap the lower portion of the
rectangle. This is acceptable: while tuning, the operator watches the ghost
overlay's tracking behavior (dots, shift telemetry), not the rectangle shape.
The telemetry bar (top 70px) MUST remain fully visible — the drawer never
reaches it.

### Interaction Model

Touch sliders on a 412px-wide phone are imprecise. The design addresses this:

1. **Collapsed by default** — single gear icon button (48×48 touch target,
   meeting WCAG 2.5.5 minimum target size)
2. **Drawer from bottom** — slides up, max-height capped at 40vh (366px) to
   leave the telemetry bar and most of the camera view visible above
3. **Grouped in collapsible sections** — only one section open at a time to
   minimize scroll depth. Three sections: Orientation, Capture Gate, Physics
4. **Model toggle** sits at the top of the drawer (always visible when open)
5. **Each parameter row**: label (compact) + range slider + tappable value
   display that shows precise numeric value
6. **Reset button** per section and global reset at bottom

### Architecture: Mutable Config Object

The `TuningConfig` is a plain mutable object shared by reference between:

```
GhostCalibrationPage
  ├── TuningPanel (reads/writes config fields via sliders)
  ├── GhostMotionPipeline (reads config each RAF frame)
  └── telemetry render (reads config for gate threshold display)
```

This avoids the complexity of an event system. The pipeline already reads
`this.tuning?.orientationModel` on each frame, so slider changes take effect
within one RAF tick (~16ms).

### Persistence

`localStorage` key `miblioteca:ghost-tuning-v1`. The `miblioteca:` prefix
prevents collision with other apps on the same origin. The `v1` suffix enables
schema migration — if `TuningConfig` gains fields, bump to `v2` and load `v1`
data into the new defaults via spread. Load on page construction, save on
every slider change (debounced writes not needed — localStorage is synchronous
and these are small payloads). On corruption or missing key, fall back to
compiled defaults from the module constants.

### Layout: Bottom Drawer

```
┌──────────────────────────────────┐
│ ⚙ (toggle)          [bottom-left, fixed] │
└──────────────────────────────────┘

When open:
┌──────────────────────────────────┐ bottom of viewport
│ [Gyro] [Absolute]    model toggle│  ← always visible
│ ▸ Orientation (collapsed)        │  ← tap to expand
│ ▾ Capture Gate (expanded)        │
│   Gate shift X  ═══●═══  40 px   │
│   Gate mag      ═══●═══  45 px   │
│   [Reset section]                │
│ ▸ Physics (collapsed)            │
│ [Reset all]                      │
└──────────────────────────────────┘
  max-height: 40vh
  background: rgba(0,0,0,0.88)
  overflowY: auto (within sections)
```

Slider row grid on 412px (392px usable after 10px padding each side):
- Label: 80px (truncated with ellipsis if needed)
- Range input: flex 1 (~252px, adequate touch target)
- Value + unit: 60px right-aligned, monospace

### Model Switching

When `orientationModel` changes from `gyro` to `absolute` (or vice versa):
- The pipeline detects the change in `rafLoop` via `this.tuning?.orientationModel`
- It resets internal orientation state and ghost state
- No pipeline reconstruction needed — it already handles this

### Export

The `CalibrationExport` type includes a `tuning: TuningConfig` field (already
wired in the existing partial implementation) so the exact parameter set used
during a calibration session is captured in the JSON export. This makes results
reproducible.

## Shared Pipeline Factory: Eliminating Drift Between Entry Points

### Problem

The capture view (`ghostOverlayCanvas.ts` / `CaptureView.ts`) and the ghost
calibration page (`GhostCalibrationPage.ts`) both construct a
`GhostMotionPipeline` with nearly identical deps — but the construction is
duplicated. When v2 absolute orientation was added, only one site got updated,
causing a regression where `/ghost` used the old gyro-only path.

### Current divergences (intentional)

| Feature              | Capture view     | Ghost page          |
|----------------------|------------------|---------------------|
| `enableMotionGate`   | `true`           | `false`             |
| `tuning`             | none (hardcoded) | `TuningConfig`      |
| `onGyroSample`       | none             | records raw frames  |
| Display dims source  | viewfinder elem  | root/visualViewport |

Everything else (orientation wiring, sensor construction, pipeline config)
MUST be identical between the two entry points.

### Solution: `createGhostPipelineDeps()`

A single factory function in `src/sensors/createGhostPipelineDeps.ts` that
constructs `GhostMotionPipelineDeps` from a minimal options bag:

```typescript
interface GhostPipelineOptions {
  win: WindowLike;
  getDisplayWidth: () => number;
  getDisplayHeight: () => number;
  getScreenOrientation: () => number;
  enableMotionGate?: boolean;     // default: true
  tuning?: TuningConfig;          // default: compiled defaults
  onGyroSample?: (sample: GyroSample) => void;
}

function createGhostPipelineDeps(opts: GhostPipelineOptions): GhostMotionPipelineDeps;
```

The factory handles:
- Gyroscope sensor construction (with permission check + fallback)
- `deviceorientation` event listener setup → `getOrientation()` / `getBeta()`
- Sensor lifecycle (start/stop via returned deps, not managed internally)

Both `ghostOverlayCanvas.ts` and `GhostCalibrationPage.ts` call this factory
with their site-specific options. The only code that differs between sites is
the options bag — all sensor wiring is in one place.

### Invariant

If `createGhostPipelineDeps(a)` and `createGhostPipelineDeps(b)` are called
with the same orientation events, the resulting `getOrientation()` and
`getBeta()` callbacks MUST return identical values. A test asserts this by
feeding the same event sequence through two factory instances with different
`enableMotionGate` values and comparing output.

### Migration path

1. Extract shared logic into `createGhostPipelineDeps.ts`
2. Refactor `ghostOverlayCanvas.ts` to use the factory
3. Refactor `GhostCalibrationPage.ts` to use the factory
4. Add parity test: same inputs → same pipeline state regardless of options
5. Remove duplicated sensor wiring from both sites

## Rejected Alternatives

### Full-width drawer from side
Would obscure the camera view entirely on a 412px-wide phone. Bottom drawer
keeps the top 60% visible.

### Numeric input fields instead of sliders
Too small to tap accurately on mobile. Sliders give continuous visual feedback.
The value display next to each slider provides precision.

### Floating controls attached to each parameter in the camera view
Would clutter the calibration view and interfere with rectangle dragging.

### Separate settings page
Defeats the purpose — the operator needs to see the camera feed while adjusting
parameters.

### Just share constants instead of a factory
Sharing only the tuning constants (via imports) wouldn't prevent wiring drift.
The v2 orientation regression was caused by different sensor setup code, not
different constant values. The factory must own sensor construction to guarantee
parity.

### Pass config through event system instead of mutable object
An event-based approach (`configChanged` events) would add an event listener
per parameter, per frame — ~15 listeners firing each slider drag. The mutable
shared object is simpler: the pipeline already reads config each RAF frame,
so changes propagate within 16ms without any event plumbing. The trade-off is
that mutation is harder to trace than events, but for a single-page tuning tool
the simplicity wins.
