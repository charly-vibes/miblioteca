## Context
Users scan a bookshelf by walking along it, taking consecutive captures. Without visual
feedback, it's easy to mis-align shots (gap or excessive overlap). A ghost overlay shows
the previous frozen frame under the live view so the user can align edges visually.

## Goals / Non-Goals
- Goals: near-zero runtime cost, immediate visual feedback, no backend dependency
- Non-Goals: sub-pixel accuracy, vertical alignment, blend-mode compositing (post-MVP)

## Decisions

### Rendering approach: CSS transform (chosen)
Three options were evaluated:

| Approach | Pros | Cons |
|---|---|---|
| **CSS `translate3d`** (chosen) | GPU composited, zero JS per frame, simplest | Rotation-only shift; translation along shelf produces near-zero shift (correct for this use case) |
| Canvas redraw | Flexible blend modes, can composite with `globalAlpha` | Per-frame CPU pixel copy, adds 5–10 ms/frame |
| WebGL Sobel edge ghost | Reduces visual clutter (edges only), cool UX | ~200 lines of GLSL, complex lifecycle, hard to maintain |

CSS transform wins for MVP: the dominant user motion (walking along shelf) produces near-zero
horizontal shift, which is correct — the ghost only moves when the user rotates (yaw), exactly
the alignment cue needed.

### hFOV default: 65°
Android wide-angle lenses cluster around 60–75°. 65° gives ≤20% error in shift magnitude
across this range. A future calibration API can refine this per-device.

### Steadiness gate: |ω| > 0.5 rad/s
Reuses the existing ZUPT steadiness gate constant. Hiding the overlay during rapid motion
avoids disorienting visual jitter while the user repositions between shelves.

## Risks / Trade-offs
- `grabFrame()` is asynchronous — ghost canvas update may lag 1–2 frames behind shutter.
  Acceptable: the ghost is a guide, not a pixel-perfect overlay.
- `AbsoluteOrientationSensor` uses magnetometer internally; metal shelving can bias heading.
  Mitigation: use `RelativeOrientationSensor` quaternion for yaw-only shift (no magnetometer dependency).

## Open Questions
- Should ghost opacity be configurable by the user (slider)? Deferred to post-MVP.
- Should yaw be clamped to a maximum shift (e.g., ±videoWidth) to prevent the ghost from
  flying off-screen during large rotations? Recommend yes — clamp to ±videoWidth/2.
