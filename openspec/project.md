# Project Context

## Purpose

mibilioteca is a TypeScript PWA for capturing bookshelf spine photos to enable
downstream stitching and cataloguing of library collections. It runs entirely in
the browser on Android Chrome, using `getUserMedia` for live camera preview,
the Generic Sensor API for IMU data, and IndexedDB + Service Worker for offline
storage and background sync. Multiple users can collaborate on a single scan
session via a shared join token.

## Tech Stack

- **Vite + TypeScript + React** — build toolchain and UI framework
- **vite-plugin-pwa + Workbox** — service worker, precaching, background sync
- **idb** — typed IndexedDB wrapper
- **exifr** — defensive EXIF reader (~30 KB)
- **qrcode-svg** — client-side QR rendering for invite URLs (~6 KB)
- **@types/w3c-image-capture** — `ImageCapture` API types (missing from lib.dom)
- **Generic Sensor API** — `Accelerometer`, `Gyroscope`, `LinearAccelerationSensor`,
  `AbsoluteOrientationSensor`, `GravitySensor`, `Magnetometer` (hand-written `.d.ts`)
- Plain Canvas / WebGL for on-device quality checks (no OpenCV.js in MVP)
- **HTTPS** required everywhere — sensors, camera, service worker, wake lock all need
  a secure context

## Project Conventions

### Code Style

- TypeScript strict mode; no `any` except where wrapping untyped browser APIs
  (cast with `(window as any).SensorConstructor` and add a comment explaining why)
- 2-space indentation, LF line endings
- No comments explaining what code does; only leave comments for non-obvious WHY
- Functional core / imperative shell: sensor math and image processing are pure
  functions; DOM side-effects and IndexedDB writes are in the shell layer

### Architecture Patterns

- **Capture degradation ladder:** `ImageCapture.takePhoto()` → canvas snapshot
  fallback; always probe `getPhotoCapabilities()` at session start, never promise
  "full sensor resolution" in the UI
- **Sidecar JSON for metadata:** never rely on EXIF being present in the Blob;
  capture all sensor readings, timestamps, and quality scores in a typed
  `CaptureRecord` object stored in IndexedDB alongside the Blob
- **Single monotonic clock per session:** stamp `performance.now()` at shutter;
  store both `capturedAt` (ISO 8601) and `capturedAtMonotonic` (ms) per record;
  use `clockOffsetMs = Date.now() - serverTimeMs` for cross-device ordering
- **ZUPT anchors:** every `CaptureRecord` carries `zupt: true`; the steadiness
  gate (§6 of requirements) enforces the phone is stationary at each shot
- **Continuous IMU trace:** packed Float32Array Blob per session (~5 MB / 30 min),
  NOT per-record JSON; fields: `t | ax ay az | gx gy gz | qx qy qz qw | grx gry grz`
- **Ghost overlay:** CSS `transform: translate3d` on an absolutely-positioned
  `<canvas>` over `<video>`; shift driven by gyro integration in `requestAnimationFrame`

### Testing Strategy

- Unit tests for pure functions: `laplacianVariance`, `feedAccel`, `makeThumbnail`,
  `shortCode`, `clockOffsetMs` math
- Integration tests for IndexedDB flows use a real IDB (no mocks)
- No automated browser camera tests — document manual test checklist per feature
- Vitest as the test runner

### Git Workflow

- Single `main` branch; feature branches for non-trivial changes
- Conventional commits (feat/fix/chore/refactor)
- Commit workflow: use the `commit` skill
- No force-push to main

## Domain Context

A **Scan** is a library-wide effort (may span many users and hours). Each device
produces a **CaptureSession** (one walking pass). Each shot is a **CaptureRecord**
with a full-resolution Blob, a 640-px JPEG thumbnail, sidecar metadata, quality
scores, and sensor readings. A **SessionTrace** holds the continuous IMU stream;
**PreviewFrame** holds optional inter-shot low-res frames (default off).

Cross-device time alignment uses a server-anchored `clockOffsetMs`; spatial
alignment uses printed fiducial markers (`isAnchorFrame: true`) and "tie shots"
(`isTieShot: true`) between users. The backend stitches sessions offline; the
client's job is only to produce clean, well-timestamped data.

## Important Constraints

- **HTTPS or localhost only** — `navigator.mediaDevices` is `undefined` over HTTP
- **Document must be visible** for sensors to fire and for `applyConstraints({ zoom })`
- **`ImageCapture.takePhoto()` often returns video-resolution on Android Chrome** —
  the Chromium pipeline clamps to PREVIEW/RECORD size; treat it as best-effort
- **EXIF is not guaranteed** — `canvas.toBlob()` never writes EXIF;
  `ImageCapture.takePhoto()` may or may not; always use sidecar JSON as truth
- **Background Sync is Chromium-only** — always also implement an `online` event
  drain fallback; large payloads may terminate the SW, so chunk uploads
- **`navigator.storage.persist()` must be requested at session start** — without
  it Chromium LRU-evicts IndexedDB under storage pressure
- **iOS Safari is second-class** — no `ImageCapture`, no Background Sync, sensors
  require `requestPermission()` from a user gesture; plan a fallback profile
- **Web Share API requires a user gesture** — call `navigator.share()` only from
  a click handler, never on mount or after an async gap
- **Web NFC is Android Chrome only** — treat as nice-to-have, never the only join path

## External Dependencies

- `POST /api/scan` — create scan, returns `serverTimeMs` for clock anchoring
- `POST /api/scan/join` — join with `shortCode + joinToken + clientTimeMs`, returns
  `userId + serverTimeMs`
- `GET /api/scan/:id/time` — re-sync clock mid-session
- `POST /api/upload` — multipart: one image Blob + sidecar JSON
- `POST /api/upload/trace` — per-session IMU trace Blob
- `POST /api/upload/preview` — preview frames (when enabled)
- **dolt** — local database backend for `bd` issue tracker (port 13627)
