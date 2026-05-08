# Ghost Overlay — How it Works

The **ghost overlay** is a semi-transparent copy of the previous photo that stays "glued" to the real world while you sweep the camera to take the next photo. It lets you see where the previous frame ended so you can pick up exactly where you left off, like a film strip splice guide.

---

## The Big Idea (ELI5)

Imagine you took a photo of page 1 of a book. Now you want to photograph page 2 without a gap. You slide the phone sideways. The ghost overlay shows the old photo — but instead of moving with your phone, it slides in the *opposite* direction, at exactly the right speed to look pinned to the table in front of you.

If you sweep right, the ghost drifts left. If you tilt up, the ghost drops down. When the ghost exactly lines up with the real world, you're in the right position to take the next photo with no gap and no overlap.

<svg viewBox="0 0 540 200" xmlns="http://www.w3.org/2000/svg" style="max-width:540px;width:100%;display:block;margin:1.5rem auto">
  <!-- book / table surface -->
  <rect x="20" y="120" width="500" height="60" rx="4" fill="#2a2a2a" stroke="#555" stroke-width="1"/>
  <text x="270" y="158" font-family="monospace" font-size="13" fill="#888" text-anchor="middle">book / table surface</text>

  <!-- page 1 region -->
  <rect x="30" y="128" width="160" height="44" rx="2" fill="#1a3a5c" stroke="#4a90d9" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="110" y="155" font-family="monospace" font-size="11" fill="#4a90d9" text-anchor="middle">page 1 (captured)</text>

  <!-- page 2 region -->
  <rect x="190" y="128" width="160" height="44" rx="2" fill="#1a3a1a" stroke="#5cb85c" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="270" y="155" font-family="monospace" font-size="11" fill="#5cb85c" text-anchor="middle">page 2 (target)</text>

  <!-- phone 1 (over page 1) -->
  <rect x="55" y="40" width="110" height="68" rx="8" fill="#333" stroke="#aaa" stroke-width="2"/>
  <rect x="63" y="48" width="94" height="52" rx="3" fill="#1a3a5c"/>
  <text x="110" y="76" font-family="monospace" font-size="9" fill="#4a90d9" text-anchor="middle">📷 capture 1</text>
  <text x="110" y="90" font-family="monospace" font-size="8" fill="#666" text-anchor="middle">press shutter</text>

  <!-- phone 2 (over page 2) -->
  <rect x="215" y="40" width="110" height="68" rx="8" fill="#333" stroke="#aaa" stroke-width="2"/>
  <!-- ghost frame inside phone 2 -->
  <rect x="223" y="48" width="94" height="52" rx="3" fill="#111"/>
  <rect x="223" y="48" width="47" height="52" rx="3" fill="#1a3a5c" opacity="0.55"/>
  <text x="223" y="76" font-family="monospace" font-size="8" fill="#4a90d9" dx="4">ghost</text>
  <text x="270" y="90" font-family="monospace" font-size="8" fill="#5cb85c" text-anchor="middle">align edges →</text>

  <!-- sweep arrow -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#f5a623"/>
    </marker>
    <marker id="arr-left" markerWidth="8" markerHeight="6" refX="2" refY="3" orient="auto">
      <path d="M8,0 L0,3 L8,6 Z" fill="#e74c3c"/>
    </marker>
  </defs>
  <line x1="175" y1="74" x2="205" y2="74" stroke="#f5a623" stroke-width="2" marker-end="url(#arr)"/>
  <text x="190" y="68" font-family="monospace" font-size="10" fill="#f5a623" text-anchor="middle">phone →</text>

  <!-- ghost counter-arrow -->
  <line x1="246" y1="86" x2="224" y2="86" stroke="#e74c3c" stroke-width="1.5" marker-end="url(#arr-left)"/>
  <text x="235" y="99" font-family="monospace" font-size="9" fill="#e74c3c" text-anchor="middle">ghost ←</text>

  <!-- caption -->
  <text x="270" y="14" font-family="monospace" font-size="11" fill="#aaa" text-anchor="middle">phone sweeps RIGHT → ghost drifts LEFT, staying pinned to the page</text>
</svg>

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

<svg viewBox="0 0 560 180" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;width:100%;display:block;margin:1.5rem auto">
  <!-- sensor bitmap -->
  <rect x="10" y="30" width="140" height="105" rx="4" fill="#1c2a1c" stroke="#5cb85c" stroke-width="1.5"/>
  <text x="80" y="20" font-family="monospace" font-size="11" fill="#5cb85c" text-anchor="middle">camera sensor</text>
  <text x="80" y="85" font-family="monospace" font-size="10" fill="#5cb85c" text-anchor="middle">1280 × 960 px</text>
  <text x="80" y="100" font-family="monospace" font-size="9" fill="#555" text-anchor="middle">(landscape, 4:3)</text>

  <!-- crop box inside bitmap -->
  <rect x="42" y="47" width="76" height="71" rx="2" fill="none" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="3,2"/>
  <text x="80" y="128" font-family="monospace" font-size="9" fill="#f5a623" text-anchor="middle">src crop (cover)</text>

  <!-- arrow -->
  <defs>
    <marker id="a2" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#aaa"/>
    </marker>
  </defs>
  <line x1="155" y1="82" x2="195" y2="82" stroke="#aaa" stroke-width="1.5" marker-end="url(#a2)"/>
  <text x="175" y="75" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">drawImage</text>

  <!-- canvas -->
  <rect x="200" y="20" width="76" height="135" rx="4" fill="#1a1a3a" stroke="#4a90d9" stroke-width="1.5"/>
  <text x="238" y="13" font-family="monospace" font-size="11" fill="#4a90d9" text-anchor="middle">canvas</text>
  <text x="238" y="85" font-family="monospace" font-size="9" fill="#4a90d9" text-anchor="middle">390 × 844</text>
  <text x="238" y="100" font-family="monospace" font-size="9" fill="#555" text-anchor="middle">portrait</text>

  <!-- equals sign -->
  <text x="295" y="90" font-family="monospace" font-size="18" fill="#aaa" text-anchor="middle">=</text>

  <!-- viewfinder preview -->
  <rect x="310" y="20" width="76" height="135" rx="4" fill="#1a1a3a" stroke="#4a90d9" stroke-width="1.5"/>
  <text x="348" y="13" font-family="monospace" font-size="11" fill="#4a90d9" text-anchor="middle">live view</text>
  <text x="348" y="85" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">same crop</text>
  <text x="348" y="100" font-family="monospace" font-size="9" fill="#555" text-anchor="middle">as video</text>

  <!-- annotation -->
  <line x1="238" y1="158" x2="348" y2="158" stroke="#5cb85c" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="293" y="172" font-family="monospace" font-size="10" fill="#5cb85c" text-anchor="middle">ghost pixels align with live video pixels</text>

  <!-- formula on right -->
  <text x="420" y="45" font-family="monospace" font-size="10" fill="#aaa">scale =</text>
  <text x="420" y="60" font-family="monospace" font-size="10" fill="#f5a623">  max(w/bw, h/bh)</text>
  <text x="420" y="80" font-family="monospace" font-size="10" fill="#aaa">src_w = w / scale</text>
  <text x="420" y="95" font-family="monospace" font-size="10" fill="#aaa">src_h = h / scale</text>
  <text x="420" y="110" font-family="monospace" font-size="10" fill="#aaa">src_x = (bw−src_w)/2</text>
  <text x="420" y="125" font-family="monospace" font-size="10" fill="#aaa">src_y = (bh−src_h)/2</text>
</svg>

---

## Step 2 — Measuring Phone Movement (Gyroscope)

The phone's gyroscope reports angular velocity — how fast the phone is rotating around each axis — in **radians per second**. We receive a new sample roughly every 16–20 ms.

| Gyro axis | Physical meaning (portrait) |
|---|---|
| `gx` | Tilting the top of the phone toward/away from you (pitch) |
| `gy` | Rotating left/right around the vertical axis (yaw / pan) |
| `gz` | Rolling (rotating the phone clockwise in your hand) |

<svg viewBox="0 0 320 280" xmlns="http://www.w3.org/2000/svg" style="max-width:320px;width:100%;display:block;margin:1.5rem auto">
  <!-- phone body -->
  <rect x="100" y="40" width="120" height="200" rx="14" fill="#222" stroke="#888" stroke-width="2"/>
  <rect x="110" y="56" width="100" height="170" rx="4" fill="#111"/>
  <!-- screen grid lines to suggest book page -->
  <line x1="110" y1="100" x2="210" y2="100" stroke="#333" stroke-width="0.5"/>
  <line x1="110" y1="140" x2="210" y2="140" stroke="#333" stroke-width="0.5"/>
  <line x1="110" y1="180" x2="210" y2="180" stroke="#333" stroke-width="0.5"/>
  <line x1="160" y1="56" x2="160" y2="226" stroke="#333" stroke-width="0.5"/>
  <!-- home button area -->
  <circle cx="160" cy="232" r="6" fill="#333"/>

  <!-- gx axis — tilt (pitch): points toward viewer along x -->
  <defs>
    <marker id="ax" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#e74c3c"/>
    </marker>
    <marker id="ay" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#f5a623"/>
    </marker>
    <marker id="az" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#4a90d9"/>
    </marker>
  </defs>

  <!-- gx: tilt (up arrow from top of phone) -->
  <line x1="160" y1="40" x2="160" y2="6" stroke="#e74c3c" stroke-width="2" marker-end="url(#ax)"/>
  <text x="165" y="18" font-family="monospace" font-size="11" fill="#e74c3c">gx (pitch)</text>
  <text x="165" y="30" font-family="monospace" font-size="9" fill="#e74c3c">tilt top away</text>

  <!-- gy: yaw (right arrow from side) -->
  <line x1="220" y1="141" x2="260" y2="141" stroke="#f5a623" stroke-width="2" marker-end="url(#ay)"/>
  <text x="265" y="138" font-family="monospace" font-size="11" fill="#f5a623">gy</text>
  <text x="265" y="150" font-family="monospace" font-size="9" fill="#f5a623">(yaw/pan)</text>
  <text x="265" y="162" font-family="monospace" font-size="9" fill="#f5a623">sweep right</text>
  <text x="265" y="174" font-family="monospace" font-size="9" fill="#999">negative →</text>

  <!-- gz: roll (circular arrow around phone center) -->
  <path d="M 90,141 A 30,30 0 0,1 90,111" stroke="#4a90d9" stroke-width="2" fill="none" marker-end="url(#az)"/>
  <text x="28" y="120" font-family="monospace" font-size="11" fill="#4a90d9">gz</text>
  <text x="18" y="132" font-family="monospace" font-size="9" fill="#4a90d9">(roll)</text>
  <text x="12" y="144" font-family="monospace" font-size="9" fill="#999">ignored</text>

  <!-- center crosshair -->
  <circle cx="160" cy="141" r="4" fill="none" stroke="#aaa" stroke-width="1"/>
  <line x1="153" y1="141" x2="167" y2="141" stroke="#aaa" stroke-width="0.8"/>
  <line x1="160" y1="134" x2="160" y2="148" stroke="#aaa" stroke-width="0.8"/>
</svg>

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

<svg viewBox="0 0 520 200" xmlns="http://www.w3.org/2000/svg" style="max-width:520px;width:100%;display:block;margin:1.5rem auto">
  <!-- focal point (camera) -->
  <circle cx="60" cy="100" r="6" fill="#f5a623"/>
  <text x="20" y="100" font-family="monospace" font-size="10" fill="#f5a623">lens</text>

  <!-- sensor / canvas plane -->
  <line x1="160" y1="30" x2="160" y2="170" stroke="#4a90d9" stroke-width="2"/>
  <text x="130" y="22" font-family="monospace" font-size="10" fill="#4a90d9">canvas</text>

  <!-- center ray -->
  <line x1="60" y1="100" x2="480" y2="100" stroke="#555" stroke-width="1" stroke-dasharray="4,3"/>

  <!-- hFov/2 upper ray -->
  <defs>
    <marker id="p1" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#e74c3c"/>
    </marker>
    <marker id="p2" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#5cb85c"/>
    </marker>
  </defs>
  <line x1="60" y1="100" x2="480" y2="30" stroke="#e74c3c" stroke-width="1.5" marker-end="url(#p1)"/>
  <!-- θ ray (after sweep) -->
  <line x1="60" y1="100" x2="480" y2="68" stroke="#5cb85c" stroke-width="1.5" stroke-dasharray="6,3" marker-end="url(#p2)"/>

  <!-- hFov/2 angle arc -->
  <path d="M 120,100 A 60,60 0 0,0 120,76" stroke="#e74c3c" fill="none" stroke-width="1"/>
  <text x="125" y="88" font-family="monospace" font-size="10" fill="#e74c3c">hFov/2</text>

  <!-- θ angle arc -->
  <path d="M 100,100 A 40,40 0 0,0 100,83" stroke="#5cb85c" fill="none" stroke-width="1"/>
  <text x="105" y="95" font-family="monospace" font-size="10" fill="#5cb85c">θ</text>

  <!-- focal length bracket -->
  <line x1="60" y1="170" x2="160" y2="170" stroke="#aaa" stroke-width="1"/>
  <line x1="60" y1="165" x2="60" y2="175" stroke="#aaa" stroke-width="1"/>
  <line x1="160" y1="165" x2="160" y2="175" stroke="#aaa" stroke-width="1"/>
  <text x="110" y="185" font-family="monospace" font-size="10" fill="#aaa" text-anchor="middle">focalLength</text>

  <!-- displayWidth/2 bracket -->
  <line x1="165" y1="30" x2="165" y2="100" stroke="#4a90d9" stroke-width="1" stroke-dasharray="2,2"/>
  <text x="180" y="60" font-family="monospace" font-size="10" fill="#4a90d9">display</text>
  <text x="180" y="72" font-family="monospace" font-size="10" fill="#4a90d9">Width/2</text>

  <!-- shiftX bracket on canvas -->
  <line x1="155" y1="68" x2="155" y2="100" stroke="#5cb85c" stroke-width="2"/>
  <line x1="150" y1="68" x2="160" y2="68" stroke="#5cb85c" stroke-width="1"/>
  <line x1="150" y1="100" x2="160" y2="100" stroke="#5cb85c" stroke-width="1"/>
  <text x="100" y="145" font-family="monospace" font-size="10" fill="#5cb85c">shiftX =</text>
  <text x="100" y="158" font-family="monospace" font-size="10" fill="#5cb85c">−focal × tan(θ)</text>
</svg>

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

<svg viewBox="0 0 540 190" xmlns="http://www.w3.org/2000/svg" style="max-width:540px;width:100%;display:block;margin:1.5rem auto">
  <!-- axes -->
  <line x1="60" y1="20" x2="60" y2="150" stroke="#555" stroke-width="1"/>
  <line x1="60" y1="150" x2="510" y2="150" stroke="#555" stroke-width="1"/>

  <!-- y-axis labels -->
  <text x="55" y="42" font-family="monospace" font-size="9" fill="#aaa" text-anchor="end">0.80</text>
  <text x="55" y="72" font-family="monospace" font-size="9" fill="#e74c3c" text-anchor="end">0.55</text>
  <text x="55" y="90" font-family="monospace" font-size="9" fill="#5cb85c" text-anchor="end">0.40</text>
  <text x="55" y="150" font-family="monospace" font-size="9" fill="#aaa" text-anchor="end">0.00</text>

  <!-- HIDE threshold line -->
  <line x1="60" y1="70" x2="510" y2="70" stroke="#e74c3c" stroke-width="1" stroke-dasharray="5,3"/>
  <text x="515" y="73" font-family="monospace" font-size="9" fill="#e74c3c">HIDE 0.55</text>

  <!-- SHOW threshold line -->
  <line x1="60" y1="88" x2="510" y2="88" stroke="#5cb85c" stroke-width="1" stroke-dasharray="5,3"/>
  <text x="515" y="91" font-family="monospace" font-size="9" fill="#5cb85c">SHOW 0.40</text>

  <!-- hysteresis band fill -->
  <rect x="60" y="70" width="450" height="18" fill="#333" opacity="0.4"/>
  <text x="285" y="82" font-family="monospace" font-size="8" fill="#aaa" text-anchor="middle">dead zone — no state change</text>

  <!-- omegaMag curve: 0ms→0.80, 200ms→0.55(stays above show), 350ms→0.38(below show), 600ms→0.41(in band), 800ms→0.60(above hide) -->
  <!-- map: x = 60 + t*(450/800), y = 150 - omega*(130/0.80) -->
  <!-- 0ms=0.80 → x=60, y=150-130=20 -->
  <!-- 200ms=0.55 → x=60+112.5=172, y=150-89=61... let me recalc properly -->
  <!-- scale: y = 150 - omega * (130/0.80) = 150 - omega * 162.5 -->
  <!-- x scale: 450px / 800ms -->
  <!-- points: (0,0.80)→(60,20), (200,0.55)→(172,61), (350,0.38)→(257,88), (600,0.41)→(337,83), (800,0.60)→(510,52) -->
  <polyline points="60,20 172,61 257,88 337,83 510,52"
            fill="none" stroke="#f5a623" stroke-width="2.5" stroke-linejoin="round"/>

  <!-- ghost visibility bands (below the chart) -->
  <!-- hidden: 0→350ms (x 60→257), shown: 350→800ms (x 257→510) -->
  <rect x="60" y="155" width="197" height="12" fill="#e74c3c" opacity="0.7" rx="2"/>
  <text x="158" y="164" font-family="monospace" font-size="8" fill="#fff" text-anchor="middle">ghost hidden</text>
  <rect x="257" y="155" width="253" height="12" fill="#4a90d9" opacity="0.7" rx="2"/>
  <text x="383" y="164" font-family="monospace" font-size="8" fill="#fff" text-anchor="middle">ghost visible</text>

  <!-- event markers -->
  <line x1="257" y1="88" x2="257" y2="155" stroke="#5cb85c" stroke-width="1" stroke-dasharray="2,2"/>
  <text x="258" y="107" font-family="monospace" font-size="8" fill="#5cb85c">appears</text>
  <text x="258" y="117" font-family="monospace" font-size="8" fill="#5cb85c">350 ms</text>

  <!-- x-axis time labels -->
  <text x="60" y="172" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">0</text>
  <text x="172" y="172" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">200ms</text>
  <text x="337" y="172" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">600ms</text>
  <text x="510" y="172" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">800ms</text>

  <!-- axis labels -->
  <text x="20" y="90" font-family="monospace" font-size="9" fill="#aaa" transform="rotate(-90,20,90)">|ω| rad/s</text>
  <text x="285" y="188" font-family="monospace" font-size="9" fill="#aaa" text-anchor="middle">time →</text>
</svg>

---

## Coordinate Reference

<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;width:100%;display:block;margin:1.5rem auto">
  <!-- phone body -->
  <rect x="205" y="60" width="110" height="180" rx="12" fill="#222" stroke="#888" stroke-width="2"/>
  <rect x="215" y="74" width="90" height="152" rx="3" fill="#111"/>
  <circle cx="260" cy="238" r="5" fill="#333"/>
  <text x="260" y="90" font-family="monospace" font-size="9" fill="#555" text-anchor="middle">[camera]</text>

  <!-- gx up arrow -->
  <defs>
    <marker id="mred" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#e74c3c"/></marker>
    <marker id="myel" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#f5a623"/></marker>
    <marker id="mred2" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto-start-reverse"><path d="M0,0 L8,3 L0,6 Z" fill="#e74c3c"/></marker>
    <marker id="mblue" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#4a90d9"/></marker>
    <marker id="mblue2" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto-start-reverse"><path d="M0,0 L8,3 L0,6 Z" fill="#4a90d9"/></marker>
  </defs>

  <!-- gx: tilt axis (vertical) -->
  <line x1="260" y1="60" x2="260" y2="22" stroke="#e74c3c" stroke-width="2" marker-end="url(#mred)"/>
  <text x="268" y="30" font-family="monospace" font-size="10" fill="#e74c3c">gx &gt; 0</text>
  <text x="268" y="42" font-family="monospace" font-size="9" fill="#e74c3c">tilt top away</text>
  <line x1="260" y1="240" x2="260" y2="278" stroke="#e74c3c" stroke-width="2" marker-end="url(#mred2)"/>
  <text x="268" y="262" font-family="monospace" font-size="9" fill="#e74c3c">gx &lt; 0</text>
  <text x="268" y="274" font-family="monospace" font-size="9" fill="#e74c3c">tilt toward you</text>

  <!-- gy: pan axis (horizontal) -->
  <line x1="315" y1="150" x2="355" y2="150" stroke="#f5a623" stroke-width="2" marker-end="url(#myel)"/>
  <text x="360" y="145" font-family="monospace" font-size="10" fill="#f5a623">gy &lt; 0</text>
  <text x="360" y="157" font-family="monospace" font-size="9" fill="#f5a623">sweep right</text>

  <!-- ghost arrows (opposite direction) -->
  <!-- ghost goes left when phone goes right -->
  <line x1="200" y1="168" x2="160" y2="168" stroke="#4a90d9" stroke-width="2" marker-end="url(#mblue)"/>
  <text x="80" y="163" font-family="monospace" font-size="9" fill="#4a90d9">ghost →</text>
  <text x="80" y="175" font-family="monospace" font-size="9" fill="#4a90d9">moves LEFT</text>

  <!-- ghost goes down when phone tilts up -->
  <line x1="232" y1="245" x2="232" y2="278" stroke="#4a90d9" stroke-width="2" marker-end="url(#mblue2)"/>
  <text x="170" y="268" font-family="monospace" font-size="9" fill="#4a90d9">ghost</text>
  <text x="158" y="280" font-family="monospace" font-size="9" fill="#4a90d9">drops DOWN</text>

  <!-- center crosshair -->
  <circle cx="260" cy="150" r="5" fill="none" stroke="#aaa" stroke-width="1"/>
  <line x1="252" y1="150" x2="268" y2="150" stroke="#aaa" stroke-width="0.8"/>
  <line x1="260" y1="142" x2="260" y2="158" stroke="#aaa" stroke-width="0.8"/>

  <!-- legend -->
  <rect x="10" y="10" width="140" height="48" rx="4" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
  <line x1="18" y1="26" x2="36" y2="26" stroke="#e74c3c" stroke-width="2"/>
  <text x="40" y="29" font-family="monospace" font-size="9" fill="#e74c3c">gyro axis (input)</text>
  <line x1="18" y1="44" x2="36" y2="44" stroke="#4a90d9" stroke-width="2"/>
  <text x="40" y="47" font-family="monospace" font-size="9" fill="#4a90d9">ghost movement</text>
</svg>

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
