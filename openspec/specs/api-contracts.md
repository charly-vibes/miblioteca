# Backend API Contracts

Version: 0.1.0  
Status: baseline (pre-implementation — backend is out of scope for the capture MVP)

> **MVP note**: All endpoints in this document are post-MVP. The MVP capture client delivers data via portable bundle export (`add-portable-bundle-export`), not server upload. These contracts describe the future backend ingest path: individual artifact upload (`POST /api/upload`) using the same capture record format the bundle already contains. No backend work begins until bundle artifacts have been validated against downstream processing needs.

## Overview

The capture client hits six endpoints. All requests/responses are JSON unless
otherwise noted. All endpoints require HTTPS. Authentication is via bearer
`joinToken` on participant endpoints.

## Endpoints

### POST /api/scan

Create a new scan. Called by the host device when starting a session.

**Request:**
```json
{
  "scanId": "uuid",
  "name": "Main library, 2F west",
  "shortCode": "BARN-7K9",
  "joinToken": "128-bit-hex"
}
```

**Response (200):**
```json
{
  "scan": { /* Scan object */ },
  "serverTimeMs": 1746000000000
}
```

`serverTimeMs` is used by the client to compute `clockOffsetMs = Date.now() - serverTimeMs`.
Positive `clockOffsetMs` means local clock is ahead of server. Known limitation: ignores RTT
(~half round-trip bias); acceptable for MVP. To order events globally, compare
`capturedAt - clockOffsetMs` across records.

**Response (400):** invalid or missing fields  
**Response (409):** scanId or shortCode already exists  
**Response (500):** server error

---

### POST /api/scan/join

Join an existing scan as a contributor.

**Request:**
```json
{
  "shortCode": "BARN-7K9",
  "token": "128-bit-hex",
  "displayName": "Alice",
  "clientTimeMs": 1746000000123
}
```

**Response (200):**
```json
{
  "scan": { /* Scan object */ },
  "userId": "uuid",
  "serverTimeMs": 1746000000100
}
```

**Response (401):** invalid or expired token  
**Response (404):** scan not found

---

### GET /api/scan/:id/time

Re-sync clock mid-session if `clockOffsetMs` may have drifted.

Call when: every 30 min, or when `Date.now() - performance.now()` diverges from the
`clockOffsetMs` baseline by more than 500 ms.

**Response:**
```json
{ "serverTimeMs": 1746000000000 }
```

---

### POST /api/upload

Upload one capture record. Multipart form data.

**Parts:**
- `record` — JSON string of `CaptureRecord` (fields stripped before upload: `blobRef`, `thumbnailBlobRef`, `uploadState`)
- `image` — Blob (JPEG or PNG; typically 2–10 MB)
- `thumbnail` — Blob (JPEG, 640-px long edge; typically < 200 KB)

**Headers:**
```
Idempotency-Key: <recordId>
```

**Response (200):**
```json
{ "recordId": "uuid", "accepted": true }
```

**Response (400):** malformed record JSON or missing parts  
**Response (409):** duplicate recordId (server deduplicates; return 200 or 409 with prior result)  
**Response (413):** payload exceeds server limit  
**Response (500):** server error

**Notes:**
- Client retries via `BackgroundSyncPlugin` + `online`-event drain fallback.
- `Idempotency-Key: <recordId>` allows safe retries; server must deduplicate by `recordId`.
- Expected payload: image 2–10 MB, thumbnail < 200 KB. Document server limit; chunk if exceeded.

---

### POST /api/upload/trace

Upload the per-session IMU trace after the session ends.

**Body:** `application/octet-stream` — packed `Float32Array` (14 fields × N samples)

**Headers:**
```
X-Session-Id: <sessionId>
X-Scan-Id: <scanId>
X-Sample-Rate-Hz: 60
X-Fields: t,ax,ay,az,gx,gy,gz,qx,qy,qz,qw,grx,gry,grz
```

**Response (200):**
```json
{ "sessionId": "uuid", "samplesAccepted": 108000 }
```

**Response (400):** missing or invalid headers  
**Response (413):** trace exceeds server limit (expect ~5 MB per 30-min session at 60 Hz)  
**Response (500):** server error

---

### POST /api/upload/preview

Upload optional inter-shot preview frames (when `motionTraceImages` ≠ `"off"`).

**Body:** `multipart/form-data`

**Parts (one HTTP request per frame):**
- `frame` — JSON string of `PreviewFrame`
- `image` — Blob (JPEG 320×240; typically 20–50 KB)

**Response (200):**
```json
{ "framesAccepted": 1 }
```

**Response (400):** malformed frame JSON  
**Response (413):** payload exceeds server limit  
**Response (500):** server error
