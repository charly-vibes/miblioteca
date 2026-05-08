# Proposal: Add Debug Event Log for Mobile Diagnostics

## Problem

On mobile browsers, DevTools is unavailable. When bugs surface — the Share button
failing silently, the ghost overlay not responding to camera movement — there is no
way to observe what the app is doing. Reproducing these issues on desktop is often
impossible because they depend on sensor permissions, browser APIs, and device-specific
behaviour.

Concrete failures observed:
- Chrome Android: Share button does not work.
- Chrome Android: Ghost overlay appears but does not shift as the camera moves.
- Firefox: No Share, but Download works; ghost overlay non-functional.

## Solution

A `?debug` query parameter activates an in-memory ring-buffer event log. When enabled,
key subsystems emit structured timestamped events into the buffer. A floating
"Export logs" button (visible only in debug mode) downloads the buffer as a JSON file
that can be shared out-of-band for diagnosis.

No changes to production code paths when `?debug` is absent.

## Scope

Two new capabilities:

1. **`debug-logger`** — `DebugLogger` module: singleton, ring buffer, `log()`, `export()`.
   Export format: `{ meta: { exportedAt, userAgent, url, sessionMs }, events: [...] }`.
2. **`debug-ui`** — Floating export button, rendered only when debug mode is active.

Instrumentation of existing subsystems threads `DebugLogger.log()` calls into
existing code without altering behaviour. The following event types are required
and form part of the specified scope (full payload details in `design.md`):

| Category | Required events |
|---|---|
| Camera | `camera:init-result` |
| Sensors | `sensor:permission-requested`, `sensor:permission-result`, `sensor:probe-result`, `sensor:orientation-sample` (throttled ≤1/2s) |
| Ghost overlay | `ghost:created`, `ghost:render-tick`, `ghost:reference-frame-set`, `ghost:destroyed` |
| Share / download | `share:api-check` (at mount, unconditional), `share:attempt`, `share:result`, `download:triggered` |
| Capture | `capture:shutter`, `capture:saved` |
| Lifecycle | `lifecycle:visibility-changed` |
| Errors | `error:uncaught` (via `unhandledrejection` + `window.onerror`) |

## Out of Scope

- Persisting logs across page reloads (IndexedDB, localStorage).
- A streaming / real-time log viewer in the UI.
- Log levels / filtering (keep it simple: all events or none).
- Remote log upload. The downloaded JSON file can be shared via the native share
  sheet or email by the tester after exporting.
