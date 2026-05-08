# Design: Debug Event Log

## DebugLogger singleton

`src/debug/logger.ts` exports a singleton `debugLogger` created once at module
load time. It reads `new URL(location.href).searchParams.has('debug')` to decide
whether logging is active. All `log()` calls are no-ops when inactive — zero
overhead on the production path.

Any presence of the `debug` key in the URL activates debug mode, regardless of
value — `?debug=false` activates debug mode just as `?debug` does.

The `DebugLogger` constructor accepts an optional `URLSearchParams` argument so
unit tests can construct an isolated, enabled instance without manipulating
`location.href` directly.

```
DebugEntry = {
  t:       DOMHighResTimeStamp   // performance.now() at emission time
  seq:     number                // monotonically increasing counter
  type:    string                // dot-namespaced event type (e.g. "camera:init-result")
  payload: unknown               // event-specific structured data
}
```

Ring buffer is a fixed-size array (1000 slots). Oldest entry is overwritten when
full. This bounds memory growth regardless of session length. Export reconstructs
insertion order by reading from `(head + 1) % 1000` when the buffer is full.

`export()` serialises the buffer as a JSON object with a metadata envelope:

```json
{
  "meta": {
    "exportedAt": "<ISO-8601 timestamp>",
    "userAgent": "<navigator.userAgent>",
    "url": "<location.href>",
    "sessionMs": "<performance.now() at export time>"
  },
  "events": [ ...DebugEntry array, oldest first ]
}
```

When the logger is disabled, `export()` returns `'{"meta":{},"events":[]}'`.

This metadata allows a tester to share the file without separately recording their
browser or device — the user agent and URL are captured at export time. The
downloaded JSON file can be shared via the native share sheet or email.

## DebugPanel component

`src/debug/DebugPanel.ts` creates a fixed-position `<button>` appended to
`document.body`. It is only instantiated when `debugLogger.enabled` is true.
`CaptureView` checks this flag in its constructor and mounts the panel once.

The button triggers a `<a download>` click against a `Blob` URL, identical to
the existing `downloadBundle()` pattern in `src/bundle/share.ts`.

Filename: `miblioteca-debug-<ISO-8601-timestamp>.json`

## Event taxonomy (instrumentation targets)

| Type | Emitted from | Key payload fields | Notes |
|---|---|---|---|
| `camera:init-result` | `cameraInit.ts` | `ok`, `error?`, `facingMode?`, `deviceId?` | |
| `sensor:permission-requested` | `probe.ts` / `SensorManager` | `api: 'DeviceOrientationEvent'|'DeviceMotionEvent'` | iOS 13+ only; before requestPermission() |
| `sensor:permission-result` | `probe.ts` / `SensorManager` | `api`, `granted: boolean`, `reason?` | Result of requestPermission() or PermissionStatus |
| `sensor:probe-result` | `probe.ts` | `status`, `capabilities?` | |
| `sensor:orientation-sample` | `GhostOverlayCanvas` rAF loop | `alpha`, `beta`, `gamma` | **Throttled: at most 1 entry per 2 seconds**; also emitted on the very first reading |
| `ghost:created` | `GhostOverlayCanvas` constructor | — | |
| `ghost:render-tick` | `GhostOverlayCanvas` rAF loop | — | Emitted once on the first successful rAF frame only |
| `ghost:reference-frame-set` | `GhostOverlayCanvas.setSnapshot()` | `hasImageData: boolean` | Renamed from snapshot-set for clarity |
| `ghost:destroyed` | `GhostOverlayCanvas.destroy()` | — | |
| `share:api-check` | `CaptureView` mount | `available: boolean`, `canShare: boolean`, `isSecureContext: boolean` | Emitted unconditionally; diagnoses Firefox / non-HTTPS cases |
| `share:attempt` | share handler | `sizeBytes` | |
| `share:result` | share handler | `outcome: 'success'|'cancelled'|'error'`, `error?` | |
| `download:triggered` | download handler | `sizeBytes` | |
| `capture:shutter` | `CaptureView.takePhoto()` | `index`, `qualityChecks?` | |
| `capture:saved` | `CaptureView.takePhoto()` | `uploadState` | |
| `lifecycle:visibility-changed` | `document` visibilitychange listener | `state: 'hidden'|'visible'` | Diagnoses browser backgrounding / rAF throttle |
| `error:uncaught` | `window` error + unhandledrejection listeners | `message: string`, `source?: string`, `stack?: string` | Registered in debug mode only; captures silent failures |

## Trade-offs considered

**Why not `localStorage`?** Persistence across reloads is unnecessary for diagnosis
and complicates the mental model. The user navigates to `?debug`, reproduces the
issue, taps Export.

**Why not `console.log`?** `console` output is not available without DevTools; it
cannot be exported. Structured entries are also easier to parse than free-form strings.

**Why 1000 entries?** A typical reproduce-export cycle runs for under a minute.
At ~10 events/s that's ~600 entries — safely under the cap. At 1000 entries the
buffer is a few hundred KB at most; well within mobile RAM budgets.

**Why throttle orientation events?** DeviceOrientation fires at ~60 Hz. Without
throttling, a 1000-entry buffer saturates in ~17 seconds, overwriting camera init,
share, and permission events before the tester can tap Export. The 2-second throttle
preserves motion data while keeping orientation's share of the buffer proportional
to more diagnostic event types.
