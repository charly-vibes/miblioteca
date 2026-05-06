# Backend API Contracts

Version: 0.1.0  
Status: baseline (pre-implementation — backend is out of scope for capture client)

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

**Response:**
```json
{
  "scan": { /* Scan object */ },
  "serverTimeMs": 1746000000000
}
```

`serverTimeMs` is used by the client to compute `clockOffsetMs = Date.now() - serverTimeMs`.

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

**Response:**
```json
{ "serverTimeMs": 1746000000000 }
```

---

### POST /api/upload

Upload one capture record. Multipart form data.

**Parts:**
- `record` — JSON string of `CaptureRecord` (without `blobRef` / `thumbnailBlobRef`, which are local keys)
- `image` — Blob (JPEG or PNG)
- `thumbnail` — Blob (JPEG, 640-px long edge)

**Response (200):**
```json
{ "recordId": "uuid", "accepted": true }
```

**Notes:**
- Client retries via `BackgroundSyncPlugin` + `online`-event drain fallback.
- Large payloads should be retried rather than resumed (Background Sync may terminate mid-transfer).

---

### POST /api/upload/trace

Upload the per-session IMU trace after the session ends.

**Body:** `application/octet-stream` — packed `Float32Array` (13 fields × N samples)

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

---

### POST /api/upload/preview

Upload optional inter-shot preview frames (when `motionTraceImages` ≠ `"off"`).

**Body:** `multipart/form-data`

**Parts (one per batch):**
- `frame` — JSON string of `PreviewFrame`
- `image` — Blob (JPEG 320×240)

**Response (200):**
```json
{ "framesAccepted": 12 }
```
