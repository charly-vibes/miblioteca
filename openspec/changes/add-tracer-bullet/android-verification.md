# Android Chrome Verification Checklist — Tracer Bullet

**App URL:** `https://charly-vibes.github.io/miblioteca/`
**Target runtime:** Android Chrome (latest) over HTTPS
**Date tested:** _______________
**Device / Android version:** _______________
**Chrome version:** _______________

---

## 1. App Boot / PWA Shell

- [ ] App loads over HTTPS without certificate errors
- [ ] No JS console errors on initial load
- [ ] "Add to Home Screen" / install prompt appears (or can be triggered from Chrome menu)
- [ ] App installs as standalone PWA (no browser chrome after launch)
- [ ] Offline indicator visible when device is offline (airplane mode)

**Observed behavior / notes:**
```
```

---

## 2. Session Bootstrap

- [ ] `POST /api/scan` handshake completes (or mock scan initializes correctly)
- [ ] `clockOffsetMs` is computed and stored (check IDB in DevTools → Application → IndexedDB)
- [ ] Session state shows `active` (not `error`) in UI or DevTools
- [ ] Bootstrap failure shows a useful error state (not a blank screen)

**Observed behavior / notes:**
```
```

---

## 3. Camera Permission Handling

- [ ] App requests camera permission on first use
- [ ] **Happy path:** permission granted → live viewfinder appears
- [ ] **Denied path:** permission denied → error state shown with a retry or guidance message (no crash)
- [ ] **Revoked path:** revoke permission in settings, return to app → graceful degradation
- [ ] Camera stream stops cleanly when navigating away or closing the tab

**Observed behavior / notes:**
```
```

---

## 4. Capture

- [ ] Shutter button is visible and tappable
- [ ] Steadiness gate blocks shutter when device is moving (`zupt: false`)
- [ ] Shutter fires when device is held still (`zupt: true`)
- [ ] Capture completes without JS errors
- [ ] Thumbnail appears after capture (or saved/complete indicator is shown)

**Observed behavior / notes:**
```
```

---

## 5. Local Save (IndexedDB)

- [ ] After capture, open Chrome DevTools → Application → IndexedDB → miblioteca
- [ ] A `CaptureRecord` exists with correct fields (`scanId`, `capturedAt`, `zupt: true`, etc.)
- [ ] Image blob stored in `blobs` store
- [ ] Thumbnail blob stored in `blobs` store
- [ ] `uploadState` starts as `pending`

**Observed behavior / notes:**
```
```

---

## 6. Stub Upload Status

- [ ] Upload attempt is made after capture (check Network tab for `POST /api/upload`)
- [ ] Upload state transitions from `pending` → `uploading` → `uploaded` (or `failed`)
- [ ] Upload status is reflected in UI (upload status panel shows correct state)
- [ ] On network failure: upload state becomes `failed`, retry is possible

**Observed behavior / notes:**
```
```

---

## 7. Overall Verdict

- [ ] All critical paths (boot, camera, capture, save, upload) exercised without crash
- [ ] No unhandled promise rejections in console
- [ ] App is usable on a physical Android device for the target workflow

**Blocking issues found:**
```
```

**Non-blocking observations:**
```
```

---

## Human Decision Items

> Record any runtime discrepancies, unexpected behaviors, or decisions that shaped follow-on scope.

```
```
