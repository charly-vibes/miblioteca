import { initCamera } from '../camera/cameraInit'
import { BundleExportPanel } from '../bundle/BundleExportPanel'
import { DebugPanel } from '../debug/DebugPanel'
import { debugLogger } from '../debug/logger'
import type { DebugLogger } from '../debug/logger'
import { checkStorageBudget } from '../pwa/storageBudget'
import type { StorageBudgetManager, StorageBudgetStatus } from '../pwa/storageBudget'
import { requestUploadSync } from '../pwa/syncRegistration'
import { GhostOverlayCanvas } from '../sensors/ghostOverlayCanvas'
import type { GyroLike } from '../sensors/ghostOverlayCanvas'
import type { AccelerometerLike } from '../sensors/imuRecorder'
import { feedAccel, initialSteadinessState } from '../sensors/steadiness'
import type { SteadinessState } from '../sensors/steadiness'
import { bootstrapTracerBullet, type BootstrapResult } from './bootstrap'
import { createCaptureRecord } from './capture'
import { makeThumbnail, laplacianVariance } from './imageProcessing'
import { createMockScanFetch } from './mockScanApi'
import { getAllRecords, loadThumbnail, openShelfwalkDb, saveCapture } from './persistence'
import { qualityWarnings, qualityChecksFromMetrics, exposureFractions } from './qualityChecks'
import type { QualityWarning } from './qualityChecks'
import { createLocalStorageTracerBulletStore } from './storage'
import { uploadCapture } from './upload'

export type CaptureSnapshotResult = {
  imageBlob: Blob
  thumbnailBlob: Blob
  width: number
  height: number
}

export type CaptureViewOptions = {
  bootstrapResult?: BootstrapResult
  appVersion?: string
  captureSnapshot?: () => Promise<CaptureSnapshotResult>
  uploadFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  storageManager?: Partial<StorageBudgetManager>
  gyro?: GyroLike | null
  accel?: AccelerometerLike | null
  createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>
  /** Returns a low-res frame for quality checks, or null when unavailable. */
  getQualityFrame?: () => ImageData | null
  /** Interval between quality frame polls in ms. Default: 100. */
  pollIntervalMs?: number
  /** Called when user taps the back button to return to sessions list. */
  onBack?: () => void
  logger?: DebugLogger
}

type BootstrapState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: BootstrapResult }

type CameraState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'granted'; stream: MediaStream }
  | { kind: 'denied' }

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'capturing' }
  | { kind: 'done'; savedLocally: true; uploadState: 'uploaded' | 'failed' }
  | { kind: 'error'; message: string }

export class CaptureView {
  private bootstrapState: BootstrapState = { kind: 'idle' }
  private cameraState: CameraState = { kind: 'idle' }
  private captureState: CaptureState = { kind: 'idle' }
  private storageBudget: StorageBudgetStatus = { kind: 'ok' }
  private captureIndex = 0

  private readonly store
  private readonly mockFetch
  private readonly opts: CaptureViewOptions
  private readonly logger: DebugLogger
  private ghostOverlay: GhostOverlayCanvas | null = null
  private steadinessState: SteadinessState = initialSteadinessState()
  private activeWarnings: QualityWarning[] = []
  private pollId: ReturnType<typeof setInterval> | null = null

  private readonly root: HTMLDivElement
  private readonly viewfinder: HTMLDivElement
  private readonly video: HTMLVideoElement
  private readonly onboarding: HTMLDivElement
  private readonly controls: HTMLDivElement
  private readonly storageWarningEl: HTMLDivElement
  private readonly statusEl: HTMLParagraphElement
  private readonly shutterBtn: HTMLButtonElement
  private readonly openCameraBtn: HTMLButtonElement
  private readonly retryBtn: HTMLButtonElement
  private readonly steadinessEl: HTMLDivElement
  private readonly warningsEl: HTMLDivElement
  private readonly backBtn: HTMLButtonElement | null
  private bundleExportPanel: BundleExportPanel | null = null
  private debugPanel: DebugPanel | null = null
  private onVisibilityChange: (() => void) | null = null
  private onUnhandledRejection: ((ev: PromiseRejectionEvent) => void) | null = null
  private onWindowError: ((ev: ErrorEvent) => void) | null = null
  private readonly galleryEl: HTMLDivElement
  private thumbnailUrls: string[] = []
  private gallerySeq = 0
  private destroyed = false

  constructor(container: HTMLElement, opts: CaptureViewOptions = {}) {
    this.opts = opts
    this.logger = opts.logger ?? debugLogger
    this.store = createLocalStorageTracerBulletStore(window.localStorage)
    this.mockFetch = createMockScanFetch(() => Date.now())

    this.root = this.mk('div', 'camera-app')
    this.viewfinder = this.mk('div', 'camera-viewfinder')
    this.galleryEl = this.mk('div', 'camera-gallery')
    this.galleryEl.hidden = true

    this.video = document.createElement('video')
    this.video.autoplay = true
    this.video.playsInline = true
    this.video.muted = true
    this.video.className = 'camera-video'

    this.onboarding = this.mk('div', 'camera-onboarding')
    this.onboarding.innerHTML = `
      <svg class="camera-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
      <p class="camera-onboarding-title">miblioteca</p>
      <p class="camera-onboarding-sub">Point your camera at a bookshelf</p>
    `

    this.controls = this.mk('div', 'camera-controls')
    this.storageWarningEl = this.mk('div', 'camera-storage-warning')
    this.storageWarningEl.setAttribute('role', 'status')
    this.storageWarningEl.setAttribute('aria-live', 'polite')
    this.statusEl = this.mk('p', 'camera-status')

    this.shutterBtn = document.createElement('button')
    this.shutterBtn.type = 'button'
    this.shutterBtn.className = 'shutter-btn'
    this.shutterBtn.setAttribute('aria-label', 'Take photo')
    this.shutterBtn.addEventListener('click', () => void this.takePhoto())

    this.openCameraBtn = document.createElement('button')
    this.openCameraBtn.type = 'button'
    this.openCameraBtn.addEventListener('click', () => void this.requestCamera())

    this.retryBtn = document.createElement('button')
    this.retryBtn.type = 'button'
    this.retryBtn.textContent = 'Retry'
    this.retryBtn.addEventListener('click', () => void this.startBootstrap())

    this.steadinessEl = this.mk('div', 'steadiness-indicator')
    this.steadinessEl.setAttribute('role', 'status')
    this.steadinessEl.setAttribute('aria-label', 'Steadiness')
    this.steadinessEl.hidden = true

    this.warningsEl = this.mk('div', 'camera-quality-warnings')
    this.warningsEl.setAttribute('aria-live', 'polite')

    if (opts.onBack) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'camera-back-btn'
      btn.setAttribute('aria-label', 'Back to sessions')
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
      btn.addEventListener('click', opts.onBack)
      this.backBtn = btn
    } else {
      this.backBtn = null
    }

    this.controls.append(this.storageWarningEl, this.steadinessEl, this.shutterBtn, this.openCameraBtn, this.retryBtn, this.statusEl)
    this.viewfinder.append(this.warningsEl, this.onboarding, ...(this.backBtn ? [this.backBtn] : []))
    this.root.append(this.viewfinder, this.galleryEl, this.controls)
    container.append(this.root)

    this.render()
    if (this.logger.enabled) this.setupDebug()
    void this.init()
  }

  private mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    el.className = cls
    return el
  }

  private setupDebug(): void {
    this.logger.log('share:api-check', {
      available: typeof navigator?.share === 'function',
      canShare: typeof navigator?.canShare === 'function',
      isSecureContext: location.protocol === 'https:',
    })
    this.onVisibilityChange = () => {
      this.logger.log('lifecycle:visibility-changed', { state: document.visibilityState })
    }
    this.onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      this.logger.log('error:uncaught', { message: String(ev.reason) })
    }
    this.onWindowError = (ev: ErrorEvent) => {
      this.logger.log('error:uncaught', { message: ev.message, source: ev.filename, stack: ev.error?.stack })
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('unhandledrejection', this.onUnhandledRejection)
    window.addEventListener('error', this.onWindowError)
    this.debugPanel = new DebugPanel(document.body, this.logger)
  }

  private async init() {
    if (!window.isSecureContext) {
      this.setBootstrapState({ kind: 'error', message: 'Secure context required. Use HTTPS.' })
      return
    }
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      this.setBootstrapState({ kind: 'error', message: 'Camera unavailable in this browser.' })
      return
    }
    if (this.opts.bootstrapResult) {
      await this.refreshStorageBudget({ requestPersist: true })
      this.setBootstrapState({ kind: 'ready', result: this.opts.bootstrapResult })
      return
    }
    await this.startBootstrap()
  }

  private setBootstrapState(s: BootstrapState) {
    this.bootstrapState = s
    if (s.kind === 'ready') {
      this.mountBundlePanel(s.result)
      void this.loadGallery(s.result.session.id)
    }
    this.render()
  }

  private mountBundlePanel(result: BootstrapResult) {
    if (this.bundleExportPanel) return
    void openShelfwalkDb().then((db) => {
      if (this.bundleExportPanel) return
      this.bundleExportPanel = new BundleExportPanel(this.controls, {
        db,
        scanId: result.scan.id,
        appVersion: this.opts.appVersion ?? '0.0.0',
      })
    })
  }

  private setCameraState(s: CameraState) {
    if (this.cameraState.kind === 'granted') {
      this.cameraState.stream.getTracks().forEach((t) => t.stop())
    }
    this.ghostOverlay?.destroy()
    this.ghostOverlay = null
    this.stopQualityPoll()
    this.stopAccel()

    this.cameraState = s
    if (s.kind === 'granted') {
      this.video.srcObject = s.stream
      this.startAccel()
      this.startQualityPoll()
    }
    // render() must run before GhostOverlayCanvas is created: the first render with
    // cameraReady=true calls replaceChildren on the viewfinder, which would discard
    // any canvas already appended. Creating the overlay after render() ensures the
    // canvas is appended after the video is in the viewfinder, so subsequent renders
    // see contains(video)=true and skip replaceChildren.
    this.render()
    if (s.kind === 'granted' && this.opts.gyro) {
      this.ghostOverlay = new GhostOverlayCanvas(this.viewfinder, { gyro: this.opts.gyro })
    }
  }

  private startAccel() {
    const accel = this.opts.accel
    if (!accel) return
    this.steadinessState = initialSteadinessState()
    accel.onreading = () => {
      this.steadinessState = feedAccel(this.steadinessState, {
        t: accel.timestamp ?? performance.now(),
        ax: accel.x ?? 0,
        ay: accel.y ?? 0,
        az: accel.z ?? 0,
      })
      this.render()
    }
    accel.onerror = null
    accel.start()
  }

  private stopAccel() {
    const accel = this.opts.accel
    if (!accel) return
    accel.onreading = null
    accel.stop()
    this.steadinessState = initialSteadinessState()
  }

  private computeTiltDeg(): number {
    const { window } = this.steadinessState
    if (window.length === 0) return 0
    const n = window.length
    const meanAx = window.reduce((s, p) => s + p.ax, 0) / n
    const meanAy = window.reduce((s, p) => s + p.ay, 0) / n
    const meanAz = window.reduce((s, p) => s + p.az, 0) / n
    return Math.abs(Math.atan2(meanAx, Math.sqrt(meanAy ** 2 + meanAz ** 2)) * (180 / Math.PI))
  }

  private startQualityPoll() {
    const { getQualityFrame, pollIntervalMs = 100 } = this.opts
    if (!getQualityFrame) return
    const poll = () => {
      const frame = getQualityFrame()
      if (frame) {
        const lv = laplacianVariance(frame)
        const { overexposed: over, underexposed: under, meanLuma } = exposureFractions(frame)
        const tiltDeg = this.opts.accel ? this.computeTiltDeg() : 0
        const checks = qualityChecksFromMetrics(lv, over, under, this.steadinessState.steady, tiltDeg, meanLuma)
        this.activeWarnings = qualityWarnings(checks)
      } else {
        this.activeWarnings = []
      }
      this.renderWarnings()
    }
    poll()
    this.pollId = setInterval(poll, pollIntervalMs)
  }

  private stopQualityPoll() {
    if (this.pollId !== null) { clearInterval(this.pollId); this.pollId = null }
    this.activeWarnings = []
    this.renderWarnings()
  }

  private renderWarnings() {
    this.warningsEl.replaceChildren()
    for (const w of this.activeWarnings) {
      const badge = document.createElement('span')
      badge.className = 'quality-badge'
      badge.dataset.warning = w
      badge.textContent = w.charAt(0).toUpperCase() + w.slice(1)
      this.warningsEl.append(badge)
    }
  }

  private setCaptureState(s: CaptureState) {
    this.captureState = s
    this.render()
  }

  private async startBootstrap() {
    this.setBootstrapState({ kind: 'loading' })
    try {
      const result = await bootstrapTracerBullet({ now: () => Date.now(), fetch: this.mockFetch, store: this.store })
      await this.refreshStorageBudget({ requestPersist: true })
      this.setBootstrapState({ kind: 'ready', result })
    } catch (error) {
      this.setBootstrapState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Bootstrap failed.',
      })
    }
  }

  private async requestCamera() {
    this.setCameraState({ kind: 'requesting' })
    const result = await initCamera({ getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c) })
    if (result.ok) {
      this.setCameraState({ kind: 'granted', stream: result.stream })
    } else {
      this.setCameraState({ kind: 'denied' })
    }
  }

  private async captureFromLiveVideo(): Promise<CaptureSnapshotResult> {
    if (!this.video.videoWidth) throw new Error('Video not ready')
    const canvas = document.createElement('canvas')
    canvas.width = this.video.videoWidth
    canvas.height = this.video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(this.video, 0, 0)
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas capture returned null blob')); return }
        resolve(blob)
      }, 'image/jpeg', 0.92)
    })
    const thumbnailBlob = await makeThumbnail(imageBlob)
    return { imageBlob, thumbnailBlob, width: canvas.width, height: canvas.height }
  }

  private async takePhoto() {
    if (this.bootstrapState.kind !== 'ready') return
    await this.refreshStorageBudget({ requestPersist: false })
    if (this.storageBudget.kind === 'blocking') return
    this.setCaptureState({ kind: 'capturing' })
    try {
      const { session, scan } = this.bootstrapState.result
      const snapshot = await (this.opts.captureSnapshot ?? (() => this.captureFromLiveVideo()))()
      const MAX_THUMB_EDGE = 640
      const thumbScale = Math.min(MAX_THUMB_EDGE / snapshot.width, MAX_THUMB_EDGE / snapshot.height, 1)
      const thumbnailWidth = Math.max(1, Math.round(snapshot.width * thumbScale))
      const thumbnailHeight = Math.max(1, Math.round(snapshot.height * thumbScale))

      const qualityFrame = this.opts.getQualityFrame?.()
      let shutterQuality: ReturnType<typeof qualityChecksFromMetrics> | undefined
      if (qualityFrame) {
        const lv = laplacianVariance(qualityFrame)
        const { overexposed: over, underexposed: under, meanLuma } = exposureFractions(qualityFrame)
        const tiltDeg = this.opts.accel ? this.computeTiltDeg() : 0
        shutterQuality = qualityChecksFromMetrics(lv, over, under, this.steadinessState.steady, tiltDeg, meanLuma)
      }

      const db = await openShelfwalkDb()
      const record = createCaptureRecord(
        {
          sessionId: session.id,
          scanId: scan.id,
          userId: session.userId,
          index: this.captureIndex++,
          qualityChecks: shutterQuality,
          image: {
            size: snapshot.imageBlob.size,
            thumbnailSize: snapshot.thumbnailBlob.size,
            mimeType: snapshot.imageBlob.type || 'image/jpeg',
            width: snapshot.width,
            height: snapshot.height,
            thumbnailWidth,
            thumbnailHeight,
            sourceApi: 'CanvasSnapshot',
          },
        },
        { now: () => Date.now(), monotonic: () => performance.now(), generateId: () => crypto.randomUUID() }
      )
      await saveCapture(db, { record, imageBlob: snapshot.imageBlob, thumbnailBlob: snapshot.thumbnailBlob })
      const { uploadState } = await uploadCapture(record, snapshot.imageBlob, snapshot.thumbnailBlob, {
        fetch: this.opts.uploadFetch ?? (async () => new Response(null, { status: 200 })),
        db,
      })
      if (uploadState !== 'uploaded') void requestUploadSync()
      if (this.ghostOverlay) {
        const bitmapFn = this.opts.createImageBitmap ?? ((b) => createImageBitmap(b))
        void bitmapFn(snapshot.thumbnailBlob).then((bm) => this.ghostOverlay?.setSnapshot(bm))
      }
      this.setCaptureState({
        kind: 'done',
        savedLocally: true,
        uploadState: uploadState === 'uploaded' ? 'uploaded' : 'failed',
      })
      void this.loadGallery(session.id)
    } catch (error) {
      this.setCaptureState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Capture failed.',
      })
    }
  }

  private async loadGallery(sessionId: string) {
    const seq = ++this.gallerySeq
    try {
      const db = await openShelfwalkDb()
      if (seq !== this.gallerySeq || this.destroyed) return

      const all = await getAllRecords(db)
      if (seq !== this.gallerySeq || this.destroyed) return

      const records = all.filter((r) => r.sessionId === sessionId).sort((a, b) => a.index - b.index)

      if (records.length === 0) {
        const oldUrls = this.thumbnailUrls
        this.thumbnailUrls = []
        this.galleryEl.hidden = true
        this.galleryEl.replaceChildren()
        oldUrls.forEach((u) => URL.revokeObjectURL(u))
        return
      }

      const blobs = await Promise.all(records.map((r) => loadThumbnail(db, r.recordId)))
      if (seq !== this.gallerySeq || this.destroyed) return

      const imgs: HTMLImageElement[] = []
      const newUrls: string[] = []
      for (let i = 0; i < records.length; i++) {
        const blob = blobs[i]
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        newUrls.push(url)
        const img = document.createElement('img')
        img.src = url
        img.className = 'camera-gallery-thumb'
        img.alt = `Capture ${records[i].index + 1}`
        imgs.push(img)
      }

      // Swap URLs and update DOM before revoking old URLs to avoid broken-image flash
      const oldUrls = this.thumbnailUrls
      this.thumbnailUrls = newUrls
      this.galleryEl.replaceChildren(...imgs)
      this.galleryEl.hidden = imgs.length === 0
      this.galleryEl.scrollLeft = this.galleryEl.scrollWidth
      oldUrls.forEach((u) => URL.revokeObjectURL(u))
    } catch {
      // gallery is non-critical; leave it as-is if loading fails
    }
  }

  private get statusText(): string {
    if (this.bootstrapState.kind === 'error') return this.bootstrapState.message
    if (this.bootstrapState.kind === 'loading') return 'Starting…'
    if (this.cameraState.kind === 'denied') return 'Camera denied — check browser settings'
    if (this.captureState.kind === 'capturing') return 'Capturing…'
    if (this.captureState.kind === 'done')
      return this.captureState.uploadState === 'uploaded' ? 'Saved ✓' : 'Saved locally'
    if (this.captureState.kind === 'error') return this.captureState.message
    if (this.cameraState.kind === 'granted') return 'Ready'
    if (this.cameraState.kind === 'requesting') return 'Opening camera…'
    return 'Tap to open camera'
  }

  private async refreshStorageBudget(opts: { requestPersist: boolean }) {
    const next = await checkStorageBudget(this.opts.storageManager ?? navigator.storage, opts)
    this.storageBudget = this.mergeStorageBudget(next)
    this.render()
  }

  private mergeStorageBudget(next: StorageBudgetStatus): StorageBudgetStatus {
    if (next.kind === 'blocking') return next
    if (next.kind === 'warning') return next
    if (this.storageBudget.kind === 'warning' && this.storageBudget.reason === 'persist-denied') {
      return this.storageBudget
    }
    return next
  }

  private render() {
    const cameraReady = this.cameraState.kind === 'granted'
    const bootstrapActive =
      this.bootstrapState.kind === 'ready' || this.bootstrapState.kind === 'loading'

    const overlay = this.backBtn ? [this.backBtn] : []
    if (cameraReady) {
      if (!this.viewfinder.contains(this.video)) {
        this.viewfinder.replaceChildren(this.warningsEl, this.video, ...overlay)
      }
    } else {
      if (!this.viewfinder.contains(this.onboarding)) {
        this.viewfinder.replaceChildren(this.warningsEl, this.onboarding, ...overlay)
      }
    }

    this.storageWarningEl.hidden = this.storageBudget.kind === 'ok'
    this.storageWarningEl.textContent = this.storageBudget.kind === 'ok' ? '' : this.storageBudget.message

    this.shutterBtn.hidden = !cameraReady
    this.shutterBtn.disabled =
      this.captureState.kind === 'capturing' ||
      this.storageBudget.kind === 'blocking' ||
      (this.opts.accel !== undefined && !this.steadinessState.steady)

    this.steadinessEl.hidden = !cameraReady || this.opts.accel === undefined
    this.steadinessEl.dataset.steady = String(this.steadinessState.steady)

    this.openCameraBtn.hidden = cameraReady || !bootstrapActive
    this.openCameraBtn.disabled = this.cameraState.kind === 'requesting' || this.bootstrapState.kind === 'loading'
    this.openCameraBtn.textContent =
      this.cameraState.kind === 'requesting' ? 'Opening…' : 'Open camera'

    this.retryBtn.hidden = cameraReady || bootstrapActive

    this.statusEl.textContent = this.statusText
  }

  destroy() {
    this.destroyed = true
    if (this.cameraState.kind === 'granted') {
      this.cameraState.stream.getTracks().forEach((t) => t.stop())
    }
    this.ghostOverlay?.destroy()
    this.stopQualityPoll()
    this.stopAccel()
    this.bundleExportPanel?.destroy()
    if (this.onVisibilityChange) document.removeEventListener('visibilitychange', this.onVisibilityChange)
    if (this.onUnhandledRejection) window.removeEventListener('unhandledrejection', this.onUnhandledRejection)
    if (this.onWindowError) window.removeEventListener('error', this.onWindowError)
    this.debugPanel?.destroy()
    this.thumbnailUrls.forEach((u) => URL.revokeObjectURL(u))
    this.thumbnailUrls = []
    this.root.remove()
  }
}
