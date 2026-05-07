import { initCamera } from '../camera/cameraInit'
import { checkStorageBudget } from '../pwa/storageBudget'
import type { StorageBudgetManager, StorageBudgetStatus } from '../pwa/storageBudget'
import { requestUploadSync } from '../pwa/syncRegistration'
import { GhostOverlayCanvas } from '../sensors/ghostOverlayCanvas'
import type { GyroLike } from '../sensors/ghostOverlayCanvas'
import { bootstrapTracerBullet, type BootstrapResult } from './bootstrap'
import { createCaptureRecord } from './capture'
import { createMockScanFetch } from './mockScanApi'
import { openShelfwalkDb, saveCapture } from './persistence'
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
  captureSnapshot?: () => Promise<CaptureSnapshotResult>
  uploadFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  storageManager?: Partial<StorageBudgetManager>
  gyro?: GyroLike | null
  createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>
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
  private ghostOverlay: GhostOverlayCanvas | null = null

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

  constructor(container: HTMLElement, opts: CaptureViewOptions = {}) {
    this.opts = opts
    this.store = createLocalStorageTracerBulletStore(window.localStorage)
    this.mockFetch = createMockScanFetch(() => Date.now())

    this.root = this.mk('div', 'camera-app')
    this.viewfinder = this.mk('div', 'camera-viewfinder')

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

    this.controls.append(this.storageWarningEl, this.shutterBtn, this.openCameraBtn, this.retryBtn, this.statusEl)
    this.viewfinder.append(this.onboarding)
    this.root.append(this.viewfinder, this.controls)
    container.append(this.root)

    this.render()
    void this.init()
  }

  private mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    el.className = cls
    return el
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
    this.render()
  }

  private setCameraState(s: CameraState) {
    if (this.cameraState.kind === 'granted') {
      this.cameraState.stream.getTracks().forEach((t) => t.stop())
    }
    this.ghostOverlay?.destroy()
    this.ghostOverlay = null
    this.cameraState = s
    if (s.kind === 'granted') {
      this.video.srcObject = s.stream
      if (this.opts.gyro !== undefined) {
        this.ghostOverlay = new GhostOverlayCanvas(this.viewfinder, { gyro: this.opts.gyro ?? null })
      }
    }
    this.render()
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
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas capture returned null blob')); return }
        resolve({ imageBlob: blob, thumbnailBlob: blob, width: canvas.width, height: canvas.height })
      }, 'image/jpeg', 0.92)
    })
  }

  private async takePhoto() {
    if (this.bootstrapState.kind !== 'ready') return
    await this.refreshStorageBudget({ requestPersist: false })
    if (this.storageBudget.kind === 'blocking') return
    this.setCaptureState({ kind: 'capturing' })
    try {
      const { session, scan } = this.bootstrapState.result
      const snapshot = await (this.opts.captureSnapshot ?? (() => this.captureFromLiveVideo()))()
      const db = await openShelfwalkDb()
      const record = createCaptureRecord(
        {
          sessionId: session.id,
          scanId: scan.id,
          userId: session.userId,
          index: this.captureIndex++,
          image: {
            size: snapshot.imageBlob.size,
            thumbnailSize: snapshot.thumbnailBlob.size,
            mimeType: snapshot.imageBlob.type || 'image/jpeg',
            width: snapshot.width,
            height: snapshot.height,
            thumbnailWidth: snapshot.width,
            thumbnailHeight: snapshot.height,
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
    } catch (error) {
      this.setCaptureState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Capture failed.',
      })
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

    if (cameraReady) {
      if (!this.viewfinder.contains(this.video)) this.viewfinder.replaceChildren(this.video)
    } else {
      if (!this.viewfinder.contains(this.onboarding)) this.viewfinder.replaceChildren(this.onboarding)
    }

    this.storageWarningEl.hidden = this.storageBudget.kind === 'ok'
    this.storageWarningEl.textContent = this.storageBudget.kind === 'ok' ? '' : this.storageBudget.message

    this.shutterBtn.hidden = !cameraReady
    this.shutterBtn.disabled = this.captureState.kind === 'capturing' || this.storageBudget.kind === 'blocking'

    this.openCameraBtn.hidden = cameraReady || !bootstrapActive
    this.openCameraBtn.disabled = this.cameraState.kind === 'requesting' || this.bootstrapState.kind === 'loading'
    this.openCameraBtn.textContent =
      this.cameraState.kind === 'requesting' ? 'Opening…' : 'Open camera'

    this.retryBtn.hidden = cameraReady || bootstrapActive

    this.statusEl.textContent = this.statusText
  }

  destroy() {
    if (this.cameraState.kind === 'granted') {
      this.cameraState.stream.getTracks().forEach((t) => t.stop())
    }
    this.ghostOverlay?.destroy()
    this.root.remove()
  }
}
