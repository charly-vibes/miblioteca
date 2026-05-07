# Image Quality Scoring for Captured Frames (320×240)

## What Already Exists in the Codebase

The app already implements quality scoring:

- `src/tracer/imageProcessing.ts` — `laplacianVariance()`: true variance of 5-tap Laplacian, **allocates ~600KB (`responses[]`) per call** — GC pressure on 100ms polling.
- `src/tracer/CaptureView.ts` — `laplacianVarianceOf()`: Mean Squared Laplacian (MSL), **zero-allocation**, used for live preview polling at 100ms interval.
- `src/tracer/qualityChecks.ts` — `exposureFractions()`: single-pass luma scan, flags >250 as overexposed, <5 as underexposed, 5% threshold.

Both Laplacian variants converge on natural images (where mean(L)≈0), so they're comparable against the same threshold (`THRESHOLDS.blurry = 80`).

## Algorithm Comparison

| Algorithm | Alloc | ~ms at 320×240 | ROC AUC (Pertuz 2013) |
|---|---|---|---|
| Laplacian Variance (`imageProcessing.ts`) | ~600 KB | 12–15 ms | 0.85 |
| Mean Squared Laplacian / MSL (`CaptureView`) | 0 | 8–10 ms | ~0.85 |
| **Tenengrad / Sobel MSE** | **0** | **8–12 ms** | **0.87** |
| FFT high-freq energy | ~2 MB | 40–80 ms | 0.86 |

FFT excluded by 50ms budget. Tenengrad offers 2% AUC gain over Laplacian for text/book-spine content and is less sensitive to JPEG 8×8 DCT block artifacts (first derivative vs second derivative). No practical allocation difference.

## Blur Thresholds

Noise floor at 320×240: ~3 variance units (downscale averages out sensor noise). Current `THRESHOLDS.blurry = 80` is 25× above noise floor — safe, but conservative.

Estimated score ranges:
- Strong blur (sigma ~10px): 5–20
- Soft focus / slight hand-shake (sigma ~3px): 40–80
- Sharp bookshelf with visible text: 100–500

Threshold of 80 is at the "soft-but-might-be-readable" boundary. **Empirical calibration recommended**: capture 20–30 frames at known focus distances, use ROC inflection point. Range 50–100 is the relevant window.

## Exposure Threshold Improvements

Current: `luma > 250` (over), `luma < 5` (under), fraction > 5%.

Suggested adjustments:
- Overexposed: raise clip to **240** (catches near-blown highlights that lose detail)
- Underexposed: raise floor to **15** (catches crushed-shadow range; current <5 is too strict)
- Add **mean luma < 50** as a global-darkness flag (dim rooms where no single cluster is near 0)

```js
function exposureScore(imageData) {
  const { data } = imageData
  const total = data.length / 4
  let over = 0, under = 0, lumaSum = 0
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    lumaSum += luma
    if (luma > 240) over++
    if (luma < 15) under++
  }
  return { overexposed: over / total, underexposed: under / total, meanLuma: lumaSum / total }
}
```

Cost: ~1.9ms on Snapdragon 680 (5 flops/pixel × 76,800 pixels).

## WASM vs Pure JS

**Pure JS is sufficient.** Total quality check (MSL + exposure): 12–15ms at 320×240. Leaves 35ms headroom. No purpose-built lightweight WASM blur library exists in npm. OpenCV.js at ~8MB gzip is unacceptable. WASM advantage only materializes at >500K pixels (720p+). Revisit only if quality checks move to full-resolution frames.

**The main concern is the 600KB allocation in `imageProcessing.ts`** — this triggers GC pauses of 5–20ms on Android. Fix: rewrite `laplacianVariance()` to accumulate directly (match `CaptureView.laplacianVarianceOf()` pattern).

## Threading

Current design (setInterval 100ms on main thread) works. Risk: GC during `laplacianVariance()` causes visible stutter.

**Worker thread path** (worthwhile follow-up):
1. `grabFrame()` → `ImageBitmap` (non-blocking)
2. Transfer to Worker via `postMessage()` (zero-copy, transferable)
3. Worker: draw to `OffscreenCanvas` → `getImageData()` → blur + exposure
4. `postMessage()` score back

Moves 12ms of compute off main thread. OffscreenCanvas + transferable ImageBitmap supported on Android Chrome 69+. Note: after `postMessage` transfer, the original `ImageBitmap` is neutered — don't call `.close()`.

## Mobile Chrome / Android Gotchas

- `grabFrame()` returns `ImageBitmap`, not `ImageData` — must draw to canvas first before `getImageData()`.
- `getImageData()` runs on live `grabFrame()` pixels, not JPEG blob — JPEG DCT-block artifact issue does not apply to the live preview quality check path.
- `setInterval` throttles to 1Hz in background tabs on Android — acceptable since camera stream is also paused.
- No SharedArrayBuffer needed for 320×240 (complexity + header requirements not worth it).

## Key Files

- `src/tracer/imageProcessing.ts` — `laplacianVariance()`: fix the 600KB allocation (high value, low effort)
- `src/tracer/qualityChecks.ts` — exposure thresholds to adjust
- `src/tracer/CaptureView.ts:286–311` — live-poll MSL (zero-alloc, keep as reference pattern)
- `src/tracer/shutter.ts` — quality check application at capture time

