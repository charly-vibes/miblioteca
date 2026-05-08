# Tasks: add-debug-event-log

Ordered for sequential delivery. Each task is independently testable.

## 1. DebugLogger module [debug-logger spec]

Create `src/debug/logger.ts`:
- Export a `DebugEntry` type `{ seq: number; t: number; type: string; payload: unknown }`.
- Export a `DebugLogger` class with `enabled: boolean`, `size: number`, `log(type, payload)`, `export(): string`, and `clear()`.
  - Constructor accepts an optional `URLSearchParams` argument; falls back to `new URL(location.href).searchParams` so unit tests can pass in a controlled instance.
- Export a `debugLogger` singleton initialised from the page URL.
- Implement the ring buffer (fixed 1000-slot array). `export()` reconstructs insertion order via `(head + 1) % 1000` when the buffer is full.
- `export()` returns a JSON object `{ meta: { exportedAt, userAgent, url, sessionMs }, events: [...] }`. When disabled, returns `'{"meta":{},"events":[]}'`.

Write `src/debug/logger.test.ts`:
- Test disabled mode: `log()` is a no-op, `export()` returns `'{"meta":{},"events":[]}'`.
- Test enabled mode with 0 entries: `export()` returns a valid envelope with `events: []`.
- Test ring buffer overflow: 1001 entries → size stays 1000, oldest dropped.
- Test entry structure: `seq`, `t`, `type`, `payload` all present and correct.
- Test `export()` ordering: oldest entry has the lowest `seq`.
- Test `clear()`: after `clear()`, `size === 0` and `export()` returns an envelope with `events: []`.
- Test `export()` metadata envelope: returned object includes `meta.userAgent`, `meta.url`, `meta.exportedAt`, `meta.sessionMs`.
- Test that passing `URLSearchParams` with `debug` creates an enabled instance without touching `location.href`.

## 2. DebugPanel component [debug-ui spec]

Create `src/debug/DebugPanel.ts`:
- Constructor appends a fixed-position `<button aria-label="Export logs">` to `document.body`.
- On click: calls `debugLogger.export()`, creates a `Blob('application/json')`, triggers `<a download>`, then revokes the Blob URL with `URL.revokeObjectURL()` (same pattern as `downloadBundle()` in `src/bundle/share.ts`).
- Filename: `miblioteca-debug-${new Date().toISOString()}.json`.
- Expose `destroy()` to remove the button.

Write `src/debug/DebugPanel.test.ts`:
- Test button is present in DOM after construction.
- Test click triggers a link with the correct filename pattern.
- Test `destroy()` removes the button.

## 3. Instrument camera init [no new spec]

In `src/camera/cameraInit.ts`, import `debugLogger` and emit:
- `camera:init-result` with `{ ok, error?, facingMode?, deviceId? }` before returning.

No new tests needed — existing `cameraInit.test.ts` covers behaviour; the `log()` call is observability-only and does not affect the return value or control flow of `cameraInit`.

## 4. Instrument sensor probe and permissions [no new spec]

In `src/sensors/probe.ts`, import `debugLogger` and emit:
- `sensor:permission-requested` with `{ api }` immediately before each `requestPermission()` call (iOS 13+ path only).
- `sensor:permission-result` with `{ api, granted, reason? }` after each permission check resolves.
- `sensor:probe-result` with `{ status, capabilities? }` before returning from `probeSensors()`.

## 5. Instrument GhostOverlayCanvas [no new spec]

In `src/sensors/ghostOverlayCanvas.ts`, import `debugLogger` and emit:
- `ghost:created` in the constructor.
- `ghost:render-tick` once on the first successful rAF frame (guard with a boolean flag, not on every frame).
- `sensor:orientation-sample` with `{ alpha, beta, gamma }` in the rAF loop, **throttled to at most 1 entry per 2 seconds** plus one unconditional emit on the very first reading. This prevents orientation events from saturating the ring buffer before diagnostic events can be captured.
- `ghost:reference-frame-set` with `{ hasImageData: boolean }` in `setSnapshot()`.
- `ghost:destroyed` in `destroy()`.

## 6. Instrument share and download handlers [no new spec]

In `src/bundle/share.ts`, import `debugLogger` and emit:
- `share:attempt` with `{ sizeBytes }` at the start of `shareBundle()`.
- `share:result` with `{ outcome: 'success' | 'cancelled' | 'error', error?: string }` after `navigator.share()` resolves or rejects.
- `download:triggered` with `{ sizeBytes }` at the start of `downloadBundle()`.

## 7. Mount DebugPanel and lifecycle/error listeners in CaptureView [debug-ui spec]

In `src/tracer/CaptureView.ts`:
- After constructing the root element, if `debugLogger.enabled`:
  - Emit `share:api-check` unconditionally: `{ available: !!navigator.share, canShare: !!navigator.canShare, isSecureContext: location.protocol === 'https:' }`.
  - Register `document.addEventListener('visibilitychange', ...)` emitting `lifecycle:visibility-changed { state: document.visibilityState }`.
  - Register `window.addEventListener('unhandledrejection', ...)` emitting `error:uncaught { message, stack? }`.
  - Register `window.addEventListener('error', ...)` emitting `error:uncaught { message, source?, stack? }`.
  - Instantiate `DebugPanel`.
- Call `debugPanel.destroy()` in the existing `destroy()` method; remove the three event listeners.

Update `src/tracer/CaptureView.test.ts`:
- Test that no export button is rendered when debug is disabled (default in tests).

## 8. Add capture shutter events [no new spec]

In `src/tracer/CaptureView.ts` `takePhoto()` method, emit:
- `capture:shutter` with `{ index, qualityChecks }` when the shutter fires.
- `capture:saved` with `{ uploadState }` after `saveCapture` and `uploadCapture` complete.

## 9. Integration tests for instrumentation [no new spec]

Add `src/debug/integration.test.ts`. For each instrumented subsystem, construct a
`DebugLogger` in enabled mode (passing `URLSearchParams` with `debug`), run the
operation, and assert the expected event type appears in the log:

- `camera:init-result` present after `cameraInit()` call.
- `sensor:probe-result` present after `probeSensors()` call.
- `sensor:orientation-sample` present after simulating a `deviceorientation` event.
- `ghost:reference-frame-set` present after `setSnapshot()` call.
- `share:api-check` present after `CaptureView` mounts with debug enabled.

## Dependencies

Tasks 1 and 2 are independent and can be parallelised.
Tasks 3–6 each depend on Task 1 (need the logger).
Task 7 depends on Tasks 1 and 2.
Task 8 depends on Task 1.
Task 9 depends on Tasks 3–8.
