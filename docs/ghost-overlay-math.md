# Ghost Overlay — How it Works

The **ghost overlay** is a semi-transparent copy of the previous photo that stays "glued" to the real world while you sweep the camera to take the next photo. It lets you see where the previous frame ended so you can pick up exactly where you left off, like a film strip splice guide.

---

## The Big Idea (ELI5)

Imagine you took a photo of page 1 of a book. Now you want to photograph page 2 without a gap. You slide the phone sideways. The ghost overlay shows the old photo — but instead of moving with your phone, it slides in the *opposite* direction, at exactly the right speed to look pinned to the table in front of you.

If you sweep right, the ghost drifts left. If you tilt up, the ghost drops down. When the ghost exactly lines up with the real world, you're in the right position to take the next photo with no gap and no overlap.

---

## Step 1 — Taking the Reference Frame

When you press the shutter button, two things happen simultaneously:

1. The camera takes the photo (saved to the bundle).
2. A copy of the video frame is **drawn into a `<canvas>` element** that sits on top of the live video feed.

The canvas is sized to match the viewfinder's CSS dimensions (e.g., 390 × 844 px on an iPhone). The bitmap from the camera sensor is typically larger and a different aspect ratio (e.g., 1280 × 960 px, landscape). To make the ghost match the live feed exactly, we use **object-fit: cover** math in the 2D canvas context — we scale the bitmap up until it fills the canvas, then center-crop the overflow. This is the same thing the CSS `object-fit: cover` rule does to the `<video>` element, so the ghost and the live feed show the same crop.

```
scale = max(canvas_w / bitmap_w,  canvas_h / bitmap_h)

src_w  = canvas_w / scale       ← the crop window inside the bitmap
src_h  = canvas_h / scale
src_x  = (bitmap_w - src_w) / 2 ← centered
src_y  = (bitmap_h - src_h) / 2

ctx.drawImage(bitmap, src_x, src_y, src_w, src_h,
                       0,     0,     canvas_w, canvas_h)
```

After drawing, **all motion accumulators are reset to zero**. Every number below is measured relative to the moment of the last capture.

---

## Step 2 — Measuring Phone Movement (Gyroscope)

The phone's gyroscope reports angular velocity — how fast the phone is rotating around each axis — in **radians per second**. We receive a new sample roughly every 16–20 ms.

| Gyro axis | Physical meaning (portrait) |
|---|---|
| `gx` | Tilting the top of the phone toward/away from you (pitch) |
| `gy` | Rotating left/right around the vertical axis (yaw / pan) |
| `gz` | Rolling (rotating the phone clockwise in your hand) |

> **Note on landscape**: when the device is in landscape orientation, the physical yaw axis maps to `gx`, not `gy`. The code reads `screen.orientation.type` on every sample and swaps the axes automatically.

### Integration

To know *how much* the phone has rotated since the last capture, we integrate (accumulate) the angular velocity over time using simple Euler integration:

```
Δt = time since last sample (seconds, capped at 0.5 s to ignore long pauses)

yawIntegral   += -yawOmega   × Δt   ← sign flip explained below
pitchIntegral +=  pitchOmega × Δt
```

The result, `yawIntegral` and `pitchIntegral`, is the total angle rotated since the last capture, in radians.

#### Why is yaw negated?

When you sweep the phone to the **right**, the gyroscope reports a **negative** `gy` (right-hand rule — thumb points up, fingers curl from front toward right, which is the negative-y direction). To make the ghost move **left** (toward the real-world position of the previous frame), we need a negative CSS translation. So we negate the integral so that:

- Phone sweeps right → `gy < 0` → `yawIntegral > 0` → CSS `translateX < 0` (ghost goes left ✓)
- Phone sweeps left  → `gy > 0` → `yawIntegral < 0` → CSS `translateX > 0` (ghost goes right ✓)

For pitch, phone tilts top away (you look up):

- `gx > 0` → `pitchIntegral > 0` → CSS `translateY > 0` (ghost drops down ✓)

---

## Step 3 — Converting Angle to Pixels (Pinhole Camera Model)

Knowing that the phone rotated `θ` radians doesn't tell us how many pixels to move the ghost. We need a **focal length** — the relationship between angle and pixels.

We use the **pinhole camera model**: a camera with a horizontal field of view of `hFov` degrees projects an angle of `hFov/2` onto the left or right edge of the sensor, which covers `displayWidth/2` pixels.

```
focalLength = (displayWidth / 2) / tan(hFov / 2)
```

For `hFov = 65°` (a typical rear camera) and `displayWidth = 390 px`:

```
focalLength = 195 / tan(32.5°) ≈ 195 / 0.637 ≈ 306 px/rad
```

Now the shift in pixels is just:

```
shiftX = -focalLength × yawIntegral
shiftY =  focalLength × pitchIntegral
```

Both values are clamped to `±displayWidth/2` and `±displayHeight/2` to prevent the ghost from flying off screen entirely.

The canvas is then moved using a GPU-composited CSS transform (no layout reflow):

```css
transform: translate3d(shiftX px, shiftY px, 0)
```

### Example: sweeping right by 20°

```
θ = 20° × π/180 = 0.349 rad

shiftX = -306 × 0.349 = -107 px   ← ghost moves 107px to the left
```

On a 390 px wide screen, 107 px is about 27% of the screen width, which is roughly the right shift for a typical page-to-page scan.

---

## Step 4 — Motion Gate (Show / Hide Logic)

The ghost is only useful when the phone is nearly still — if it were shown while you're sweeping, it would show a blurry smear and confuse more than it helps.

### Hysteresis (two thresholds, not one)

A naive single threshold causes **flicker**: at `0.5 rad/s`, any tiny hand tremor makes the ghost flash on and off many times per second.

We use two thresholds instead:

| Threshold | Value | Meaning |
|---|---|---|
| `SHOW` | 0.40 rad/s | Ghost appears when movement drops **below** this |
| `HIDE` | 0.55 rad/s | Ghost disappears when movement rises **above** this |

The dead zone between 0.40 and 0.55 is the hysteresis band — movement within the band doesn't change the ghost's visibility.

```
omegaMag = sqrt(gx² + gy² + gz²)   ← total rotation speed, all axes

if currently hidden:  show if omegaMag ≤ 0.40
if currently shown:   hide if omegaMag >  0.55
```

**0.40 rad/s ≈ 23°/s** — about the speed of a slow, deliberate hand sway.

### Example: motion gate in action

```
Time  omegaMag  State    Event
 0 ms   0.80    hidden   (just captured, phone still moving)
 200ms  0.55    hidden   (above SHOW threshold, stays hidden)
 350ms  0.38    shown    ← drops below 0.40, ghost appears
 600ms  0.41    shown    (in hysteresis band, stays shown)
 800ms  0.60    hidden   ← rises above 0.55, ghost disappears
```

---

## Coordinate Reference

```
Portrait phone, top of phone up:

    ↑  tilt top away from you (gx > 0)
    │
    │   [front camera]
  ←─────────────→  sweep right (gy < 0)
    │   [screen]
    │
    ↓  tilt top toward you (gx < 0)

Ghost shift when sweeping RIGHT:
  yawIntegral > 0 → shiftX < 0 → ghost moves LEFT (pinned in space ✓)

Ghost shift when tilting TOP AWAY (looking up):
  pitchIntegral > 0 → shiftY > 0 → ghost moves DOWN (pinned in space ✓)
```

---

## Use Cases

### Scanning a book page by page

1. Photograph page 1. Ghost shows page 1 on screen.
2. Slide phone right. Ghost slides left. Stop when the ghost's right edge lines up with the book's current left edge.
3. Shoot page 2. Ghost updates to show page 2. Repeat.

Because you're aligning on **content** (text, page edge) rather than pixel counts, the scanner adapts to any book size automatically.

### Scanning a wide poster or whiteboard

Same as above but you may tilt up and down between rows. The vertical pitch tracking keeps the ghost pinned in 2D space, not just horizontal.

### Expected ghost behavior at a glance

| Phone movement | Ghost movement | Why |
|---|---|---|
| Sweep right | Ghost drifts left | Pinned to world |
| Sweep left | Ghost drifts right | Pinned to world |
| Tilt top away | Ghost drops down | Pinned to world |
| Tilt top toward you | Ghost rises up | Pinned to world |
| Shake / fast movement | Ghost disappears | Motion gate |
| Stops moving | Ghost reappears | Motion gate |
| Capture taken | Ghost resets, shows new frame at center | Integral reset |

---

## Known Limitations

### Roll (gz) is ignored

If you rotate the phone clockwise in your hand (like twisting a steering wheel), the ghost doesn't rotate with it. Roll is not measured. This is intentional for now — most scanning is done with the phone held steady and swiped horizontally.

### Field of view is approximate

The default `hFov = 65°` is a typical wide-angle rear camera. Different phones and zoom levels have different FOVs. If the ghost moves too little or too much, the FOV constant is the variable to tune.

### Integral drift over long sessions

The gyroscope has a small DC bias (offset that doesn't average to zero). Over many seconds this causes the `yawIntegral` to drift slowly even with the phone perfectly still. The reset on each capture prevents this from accumulating across captures.

---

## Debug Signals to Watch

Every 500 ms (and at every shutter press) the debug log records:

| Signal | What it tells you |
|---|---|
| `sensor:orientation-sample.omegaMag` | How fast the phone is moving right now |
| `sensor:orientation-sample.scanAxis` | Whether yaw is mapped to `gx` or `gy` (landscape vs portrait) |
| `ghost:visibility-changed.visible` | When the gate opened or closed |
| `ghost:shift.shiftPx / shiftPy` | Ghost offset in CSS pixels at that moment |
| `ghost:shift.yawIntegral` | Accumulated yaw in radians |
| `capture:shutter.ghost.shiftPx` | **Exact** ghost position at the moment you took the photo |

Load a `miblioteca-debug-*.json` file into `/debug-replay.html` to see these on a timeline with charts.

---

## How to Use Debug Mode

### Step 1 — Enable debug mode

Add `?debug` to the app URL before loading the camera screen:

```
https://<your-app-host>/?debug
```

When debug mode is active, a small **"Export logs"** button appears in the bottom-right corner of the screen (fixed, above all other UI). No other visual change — the camera and ghost overlay work exactly as normal.

> Debug mode is activated by the presence of the `debug` query parameter. It does not matter what value you give it (`?debug`, `?debug=1`, `?debug=true` all work).

### Step 2 — Take photos as normal

Use the app normally. Every sensor sample, ghost visibility change, ghost shift tick, and shutter press is recorded in memory. Nothing is written to disk until you export.

### Step 3 — Export the log

Tap **"Export logs"**. The browser downloads a file named:

```
miblioteca-debug-<timestamp>.json
```

The file is a JSON array of timestamped events. You can open it in any text editor or load it into the debug replay page.

### Step 4 — Open the debug replay page

Navigate to:

```
https://<your-app-host>/debug-replay.html
```

This is a standalone page (no framework, no build step). It works in any browser.

Drag and drop your `miblioteca-debug-*.json` file onto the drop zone, or click the drop zone to pick the file. The page shows:

- **Master timeline** — captures (orange markers), `|ω|` sparkline, ghost visibility bands (blue = visible, red = hidden)
- **Per-section cards** — one card per inter-capture gap, each with:
  - Gyro chart (`gx` pitch in green, `gy` yaw in blue), with gate thresholds shown as dashed lines
  - Ghost shift chart (`shiftPx` in white, `shiftPy` in green)
  - "Ghost at shutter" row — exact position, integrals, and visibility state at the moment you pressed the shutter
  - AR overlap estimate and any automatic issue flags (teleports, flicker, low overlap)

### Bundled export

Every `.mbibundle.zip` already includes the debug log for that session at `debug.json` inside the archive. You do not need to export separately if you exported the bundle — unzip the bundle and drag `debug.json` into the replay page.

### Quick reference

| What | How |
|---|---|
| Enable debug mode | Add `?debug` to the app URL |
| Export log | Tap "Export logs" button (bottom-right corner) |
| Replay page | `/debug-replay.html` |
| Debug log in bundle | `debug.json` inside the `.mbibundle.zip` |
