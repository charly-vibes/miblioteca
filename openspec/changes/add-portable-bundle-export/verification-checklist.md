# Android Chrome Verification Checklist
## add-portable-bundle-export MVP

**Device target**: Android Chrome (latest)
**App URL**: GH Pages deploy — https://charly-vibes.github.io/miblioteca
**Date**: 2026-05-07
**Tester**: charly vibes
**Result**: ✅ PASS (with notes)

---

## 1. Capture

- [x] 1.1 Open the app on Android Chrome
- [x] 1.2 Tap the camera/scan button
- [x] 1.3 Point at a book spine and capture a photo
- [x] 1.4 Confirm the captured image appears in the session view

## 2. Persistence

- [x] 2.1 Note the scan/session ID shown
- [x] 2.2 Close the tab and reopen the app
- [x] 2.3 Confirm the captured record is still present (not lost on reload)

## 3. Export — happy path

- [x] 3.1 Tap the export / share button on the record
- [x] 3.2 Confirm the export progress indicator appears
- [x] 3.3 Export completes without error
- [x] 3.4 Share sheet OR download prompt appears (depending on browser capability)
- [x] 3.5 On share sheet: the file is offered as a document (`.mbibundle.zip`), not as gallery media
- [x] 3.6 File name matches the expected `<scanId>.mbibundle.zip` pattern

## 4. Aborted export retry

- [x] 4.1 Begin another export on the same (or a new) record
- [x] 4.2 Dismiss / cancel the share sheet mid-flow
- [x] 4.3 Return to the app — record still shows correct state (not permanently marked as exported/failed)
- [x] 4.4 Re-trigger export — it succeeds without error

## 5. Bundle validation

> Transfer the `.mbibundle.zip` to a desktop machine for inspection (Drive, USB, or download via Chrome to laptop).

- [x] 5.1 Unzip the bundle
- [x] 5.2 `manifest.json` exists at the archive root
- [x] 5.3 `manifest.json` fields present: `formatVersion`, `appVersion`, `scanId`, `exportedAt`, `artifactCount`, `totalBytes`
- [x] 5.4 Each file entry in `manifest.json` has: `path`, `type`, `size`, `sha256`
- [x] 5.5 Actual file count matches `artifactCount` (12/12)
- [x] 5.6 Sum of actual file sizes matches `totalBytes` (1,963,206 bytes — exact)
- [x] 5.7 Spot-check sha256: `6bf202f3b370...` matches manifest entry
- [x] 5.8 Image files present under `images/session-*/`
- [x] 5.9 Thumbnail files present under `thumbnails/session-*/`

## 6. Transfer without recompression

- [x] 6.1 File offered as document via Chrome download (preserved as `.mbibundle.zip`)
- [x] 6.2 Bundle opened on desktop
- [x] 6.3 Image file sizes match manifest entries (no recompression)

---

## Notes

- **Section 3**: First export showed share sheet; second export (retry) showed Chrome's native download dialog instead — browser-level behavior, not an app bug.
- **Section 5.9**: All 12 thumbnails are byte-for-byte identical to their source images (same sha256, same size). Thumbnail generation is not running — they are copies. Not a blocker for format validity but doubles image storage. Filed as a separate follow-up.
- **Section 4**: On retry, Chrome banner "Browser storage is not protected from eviction. Keep this tab open until uploads finish." — expected Chrome warning for PWA storage (not an app bug).
- **Field names**: manifest uses `recordCount` (not `artifactCount`) and file entries use `logicalType`/`mimeType`/`sizeBytes` (not `type`/`size`) — checklist template predates final field names. Results are correct.
