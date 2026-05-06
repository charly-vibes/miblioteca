import { useEffect, useMemo, useRef, useState } from 'react'
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

type TracerBulletShellProps = {
  captureSnapshot?: () => Promise<CaptureSnapshotResult>
  uploadFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
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

const tracerBulletPath = '/tracer-bullet'

async function defaultCaptureSnapshot(): Promise<CaptureSnapshotResult> {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#888'
    ctx.fillRect(0, 0, 640, 480)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas capture returned null blob'))
        return
      }
      resolve({
        imageBlob: blob,
        thumbnailBlob: blob,
        width: 640,
        height: 480,
      })
    }, 'image/jpeg')
  })
}

async function defaultUploadFetch(
  _input: RequestInfo | URL,
  _init?: RequestInit
): Promise<Pick<Response, 'ok' | 'status'>> {
  return new Response(null, { status: 200 })
}

export default function TracerBulletShell({
  captureSnapshot = defaultCaptureSnapshot,
  uploadFetch = defaultUploadFetch,
}: TracerBulletShellProps) {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ kind: 'idle' })
  const [cameraState, setCameraState] = useState<CameraState>({ kind: 'idle' })
  const [captureState, setCaptureState] = useState<CaptureState>({ kind: 'idle' })

  const secureContextLabel = window.isSecureContext ? 'secure context ready' : 'secure context required'
  const hasCameraSupport =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

  const store = useMemo(() => createLocalStorageTracerBulletStore(window.localStorage), [])
  const mockFetch = useMemo(() => createMockScanFetch(() => Date.now()), [])

  const captureIndexRef = useRef(0)

  useEffect(() => {
    return () => {
      if (cameraState.kind === 'granted') {
        cameraState.stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [cameraState])

  useEffect(() => {
    if (!window.isSecureContext) {
      setBootstrapState({
        kind: 'error',
        message: 'Secure context required. Run the dev server over HTTPS before continuing.',
      })
      return
    }
    if (!hasCameraSupport) {
      setBootstrapState({
        kind: 'error',
        message: 'Camera access is unavailable in this browser.',
      })
      return
    }
    void startBootstrap()
  }, [hasCameraSupport])

  async function startBootstrap() {
    setBootstrapState({ kind: 'loading' })
    try {
      const result = await bootstrapTracerBullet({ now: () => Date.now(), fetch: mockFetch, store })
      setBootstrapState({ kind: 'ready', result })
    } catch (error) {
      setBootstrapState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Tracer bullet bootstrap failed.',
      })
    }
  }

  async function requestCamera() {
    setCameraState({ kind: 'requesting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraState({ kind: 'granted', stream })
    } catch {
      setCameraState({ kind: 'denied' })
    }
  }

  async function takePhoto() {
    if (bootstrapState.kind !== 'ready') return
    setCaptureState({ kind: 'capturing' })

    try {
      const { session, scan } = bootstrapState.result
      const snapshot = await captureSnapshot()

      const db = await openShelfwalkDb()
      const record = createCaptureRecord(
        {
          sessionId: session.id,
          scanId: scan.id,
          userId: session.userId,
          index: captureIndexRef.current++,
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
        fetch: uploadFetch,
        db,
      })

      setCaptureState({ kind: 'done', savedLocally: true, uploadState })
    } catch (error) {
      setCaptureState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Capture failed.',
      })
    }
  }

  const bootstrapLabel =
    bootstrapState.kind === 'loading'
      ? 'Starting mock scan handshake…'
      : bootstrapState.kind === 'ready'
        ? bootstrapState.result.resumed
          ? 'Resumed session ready'
          : 'Fresh session ready'
        : bootstrapState.kind === 'error'
          ? bootstrapState.message
          : 'Ready for mock scan bootstrap'

  return (
    <main className="shell">
      <p className="eyebrow">HTTPS dev shell</p>
      <h1>Tracer bullet capture flow</h1>
      <p className="lede">
        This route is the narrow end-to-end shell for the first capture, persistence, and upload slice.
      </p>

      <dl className="status-grid">
        <div>
          <dt>Route</dt>
          <dd>{tracerBulletPath}</dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>{secureContextLabel}</dd>
        </div>
        <div>
          <dt>Bootstrap</dt>
          <dd>{bootstrapLabel}</dd>
        </div>
        {bootstrapState.kind === 'ready' ? (
          <>
            <div>
              <dt>Scan</dt>
              <dd>{bootstrapState.result.scan.shortCode}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{bootstrapState.result.session.id}</dd>
            </div>
          </>
        ) : null}

        {cameraState.kind === 'denied' ? (
          <div>
            <dt>Camera</dt>
            <dd>Camera permission denied. Grant camera access in browser settings and retry.</dd>
          </div>
        ) : cameraState.kind === 'granted' ? (
          <div>
            <dt>Camera</dt>
            <dd>Camera ready</dd>
          </div>
        ) : null}

        {captureState.kind === 'done' ? (
          <>
            <div>
              <dt>Save</dt>
              <dd>Saved locally</dd>
            </div>
            <div>
              <dt>Upload</dt>
              <dd>
                {captureState.uploadState === 'uploaded' ? 'Upload succeeded' : 'Upload failed'}
              </dd>
            </div>
          </>
        ) : captureState.kind === 'error' ? (
          <div>
            <dt>Capture</dt>
            <dd>{captureState.message}</dd>
          </div>
        ) : null}
      </dl>

      {bootstrapState.kind === 'error' || bootstrapState.kind === 'idle' ? (
        <button type="button" onClick={() => void startBootstrap()}>
          Retry bootstrap
        </button>
      ) : null}

      {bootstrapState.kind === 'ready' &&
       (cameraState.kind === 'idle' || cameraState.kind === 'denied') ? (
        <button type="button" onClick={() => void requestCamera()}>
          Request camera access
        </button>
      ) : null}

      {cameraState.kind === 'granted' && captureState.kind !== 'capturing' ? (
        <button type="button" onClick={() => void takePhoto()}>
          Take photo
        </button>
      ) : null}
    </main>
  )
}
