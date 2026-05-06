# Data Model

Version: 0.1.0  
Status: baseline (pre-implementation)

## Overview

Four top-level entities describe a collaborative bookshelf scan. All records
are stored in IndexedDB as sidecar JSON alongside image Blobs. The backend
merges by `scanId` and orders events globally using `capturedAt - clockOffsetMs`.

## Scan

A library-wide capture effort spanning multiple users and devices.

```ts
interface Scan {
  scanId: string;             // UUID
  shortCode: string;          // "BARN-7K9" — 4 letters + dash + 3 alphanumeric chars (no I/O/0/1)
  joinToken: string;          // 128-bit hex secret embedded in invite URL
  joinTokenExpiresAt: string; // ISO 8601, default 24 h — intentional MVP limit; no token refresh endpoint
  name: string;               // "Main library, second floor, west wing"
  createdAt: string;
  hostUserId: string;
  participants: Array<{
    userId: string;
    displayName: string;
    joinedAt: string;
    role: "host" | "contributor";
  }>;
}
```

## CaptureSession

One device-user walking pass. `clockOffsetMs` is measured at join time against
the server to enable cross-device event ordering.

```ts
interface CaptureSession {
  sessionId: string;          // UUID
  scanId: string;
  userId: string;             // random UUID per install, no PII
  displayName: string;
  clockOffsetMs: number;      // Date.now() - serverTimeMs at handshake; positive = local clock ahead of server
  startedAt: string;          // ISO 8601
  endedAt?: string;           // set on clean close; inferred from max(capturedAt) across session records if missing (e.g. app crash)
  device: {
    userAgent: string;
    platform: string;
    pixelRatio: number;
    screen: { width: number; height: number };
    timezone: string;
  };
  app: { version: string; commit: string };
  motionTrace?: {
    blobRef: string;          // IndexedDB key for Float32Array trace (always equals sessionId)
    sampleRateHz: number;     // typically 50-60
    fields: ReadonlyArray<
      "t" | "ax" | "ay" | "az" | "gx" | "gy" | "gz" |
      "qx" | "qy" | "qz" | "qw" | "grx" | "gry" | "grz"
    >;
    pauseGaps: Array<{ from: number; to: number }>; // monotonic ms
  };
  userNotes?: string;
}
```

## CaptureRecord

One photo with full metadata sidecar. Every record carries `zupt: true` because
the steadiness gate enforces the device is stationary at every shot.

Minimum required fields for a valid upload: `recordId`, `sessionId`, `scanId`, `userId`,
`index`, `capturedAt`, `capturedAtMonotonic`, `zupt`, `image`, `qualityChecks`, `uploadState`.
All fields without `?` are TypeScript-required and must be present.

```ts
interface CaptureRecord {
  recordId: string;            // UUID
  sessionId: string;
  scanId: string;              // denormalised
  userId: string;              // denormalised
  index: number;               // 0-based within session
  capturedAt: string;          // ISO 8601 wall clock
  capturedAtMonotonic: number; // performance.now() at shutter (intra-session only)
  zupt: true;                  // every record is a stationary ZUPT anchor
  isAnchorFrame?: boolean;     // fiducial marker shot
  isTieShot?: boolean;         // true when this shot overlaps with another user's coverage zone
  tiedToUserId?: string;       // identifies that user; only meaningful when isTieShot === true
  image: {
    blobRef: string;           // IndexedDB key in `blobs` store (always equals recordId)
    thumbnailBlobRef: string;  // IndexedDB key in `thumbnails` store (always equals recordId); 640-px long-edge JPEG
    mimeType: string;
    width: number; height: number;
    thumbnailWidth: number; thumbnailHeight: number;
    sizeBytes: number; thumbnailSizeBytes: number;
    sourceApi: "ImageCapture" | "CanvasSnapshot" | "InputFileCapture";
  };
  camera: {
    deviceId?: string;
    facingMode?: "environment" | "user";
    settings?: Partial<MediaTrackSettings>;
    capabilities?: Partial<MediaTrackCapabilities>;
  };
  geolocation?: {
    lat: number; lon: number;
    accuracyMeters: number;
    altitudeMeters: number | null;
    altitudeAccuracyMeters: number | null;
    heading: number | null; speed: number | null;
    timestamp: number;
  };
  orientation?: {
    quaternion: [number, number, number, number]; // AbsoluteOrientationSensor
    alpha: number; beta: number; gamma: number;
    absolute: boolean; timestamp: number;
  };
  motion?: {
    accel:       { x: number; y: number; z: number; timestamp: number };
    linearAccel: { x: number; y: number; z: number; timestamp: number };
    gyro:        { x: number; y: number; z: number; timestamp: number };
    gravity:     { x: number; y: number; z: number; timestamp: number };
  };
  motionWindow?: {
    // Small excerpt of the continuous trace centered on the shot timestamp.
    // Useful for per-record quality checks without loading the full trace Blob.
    samples: Array<{ t: number; ax: number; ay: number; az: number;
                                  gx: number; gy: number; gz: number }>;
  };
  qualityChecks: {
    laplacianVariance: number;
    overexposedFraction: number;
    underexposedFraction: number;
    steadyAtCapture: boolean;
    tiltDegrees: number;
    estimatedYawDeltaSincePrev?: number; // radians, integrated gyro
    stepCountSincePrev?: number;
  };
  exif?: Record<string, unknown>;
  uploadState: "pending" | "uploading" | "uploaded" | "failed" | "rejected";
}
```

## PreviewFrame

Optional inter-shot low-res frames for backend visual-inertial odometry.
Default off in MVP; controlled by `motionTraceImages: "off" | "low" | "medium"` setting.

The `previewFrames` and `previewBlobs` IDB stores are always created in DB version 2;
they remain empty when `motionTraceImages === "off"`.

```ts
interface PreviewFrame {
  frameId: string;
  sessionId: string;
  scanId: string;
  userId: string;
  capturedAtMonotonic: number; // same clock as the session trace
  blobRef: string;             // IndexedDB key in `previewBlobs` store (always equals frameId); 320×240 JPEG
  width: number; height: number;
  sizeBytes: number;
}
```

## IndexedDB Schema

| Object Store    | Key          | Value          | Notes                        |
|-----------------|--------------|----------------|------------------------------|
| `blobs`         | `recordId`   | Blob           | full-resolution image        |
| `records`       | `recordId`   | CaptureRecord  | index: `by-uploadState`      |
| `scans`         | `scanId`     | Scan           |                              |
| `sessions`      | `sessionId`  | CaptureSession |                              |
| `traces`        | `sessionId`  | Blob (Float32) | packed IMU trace             |
| `thumbnails`    | `recordId`   | Blob (JPEG)    | 640-px long-edge             |
| `previewFrames` | `frameId`    | PreviewFrame   |                              |
| `previewBlobs`  | `frameId`    | Blob (JPEG)    | 320×240                      |

DB name: `shelfwalk`, version history:

| DB Version | Changes |
|------------|---------|
| 1          | Initial schema: blobs, records, scans, sessions, traces, thumbnails |
| 2          | Added previewFrames and previewBlobs stores |

## blobRef Identity Contract

A `blobRef` is always the primary key of the corresponding IDB object store:

| Field | Value | IDB store |
|-------|-------|-----------|
| `CaptureRecord.image.blobRef` | `recordId` | `blobs` |
| `CaptureRecord.image.thumbnailBlobRef` | `recordId` | `thumbnails` |
| `CaptureSession.motionTrace.blobRef` | `sessionId` | `traces` |
| `PreviewFrame.blobRef` | `frameId` | `previewBlobs` |

## uploadState FSM

```
pending → uploading   Service Worker or online-drain loop picks up the record
uploading → uploaded  server returns 200
uploading → failed    non-2xx response or network error; eligible for retry
failed → uploading    explicit retry; capped at 5 attempts total
failed → rejected     5th consecutive failure; terminal — requires manual review
uploading → rejected  server returns non-retryable 4xx (400, 413, 422)
```

Retryable response codes: 429, 500, 502, 503, 504, network error.  
Terminal response codes (move to `rejected`): 400, 413, 422.

## Storage Budget

- Request `navigator.storage.persist()` at session start; warn the user if denied.
- Warn if `navigator.storage.estimate()` shows less than 500 MB available.
- Blobs must not be evicted until `uploadState === "uploaded"`.
- Pause capture and display a warning if quota is exhausted before upload completes.

## Quality Check Reference Thresholds

Reference values for `CaptureRecord.qualityChecks`; to be calibrated during design phase.

| Field | Warning threshold | Condition |
|-------|-------------------|-----------|
| `laplacianVariance` | < 80 | blurry |
| `overexposedFraction` | > 0.05 | overexposure |
| `underexposedFraction` | > 0.05 | underexposure |
| `tiltDegrees` | > 15° | tilt |
