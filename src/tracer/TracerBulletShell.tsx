import { useEffect, useMemo, useRef, useState } from 'react'
import { initCamera } from '../camera/cameraInit'
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

async function defaultUploadFetch(
  _input: RequestInfo | URL,
  _init?: RequestInit
): Promise<Pick<Response, 'ok' | 'status'>> {
  return new Response(null, { status: 200 })
}

export default function TracerBulletShell({
  captureSnapshot,
  uploadFetch = defaultUploadFetch,
}: TracerBulletShellProps) {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ kind: 'idle' })
  const [cameraState, setCameraState] = useState<CameraState>({ kind: 'idle' })
  const [captureState, setCaptureState] = useState<CaptureState>({ kind: 'idle' })

  const hasCameraSupport =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

  const store = useMemo(() => createLocalStorageTracerBulletStore(window.localStorage), [])
  const mockFetch = useMemo(() => createMockScanFetch(() => Date.now()), [])

  const captureIndexRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => {
      if (cameraState.kind === 'granted') {
        cameraState.stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [cameraState])

  useEffect(() => {
    if (cameraState.kind === 'granted' && videoRef.current) {
      videoRef.current.srcObject = cameraState.stream
    }
  }, [cameraState])

  useEffect(() => {
    if (!window.isSecureContext) {
      setBootstrapState({
        kind: 'error',
        message: 'Secure context required. Use HTTPS.',
      })
      return
    }
    if (!hasCameraSupport) {
      setBootstrapState({
        kind: 'error',
        message: 'Camera unavailable in this browser.',
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
        message: error instanceof Error ? error.message : 'Bootstrap failed.',
      })
    }
  }

  async function captureFromLiveVideo(): Promise<CaptureSnapshotResult> {
    const video = videoRef.current
    if (!video || !video.videoWidth) throw new Error('Video not ready')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(video, 0, 0)
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas capture returned null blob')); return }
        resolve({ imageBlob: blob, thumbnailBlob: blob, width: canvas.width, height: canvas.height })
      }, 'image/jpeg', 0.92)
    })
  }

  async function requestCamera() {
    setCameraState({ kind: 'requesting' })
    const result = await initCamera({ getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c) })
    if (result.ok) {
      setCameraState({ kind: 'granted', stream: result.stream })
    } else {
      setCameraState({ kind: 'denied' })
    }
  }

  async function takePhoto() {
    if (bootstrapState.kind !== 'ready') return
    setCaptureState({ kind: 'capturing' })

    try {
      const { session, scan } = bootstrapState.result
      const snapshot = await (captureSnapshot ?? captureFromLiveVideo)()

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

      const displayState = uploadState === 'uploaded' ? 'uploaded' : 'failed'
      setCaptureState({ kind: 'done', savedLocally: true, uploadState: displayState })
    } catch (error) {
      setCaptureState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Capture failed.',
      })
    }
  }

  const statusText = (() => {
    if (bootstrapState.kind === 'error') return bootstrapState.message
    if (bootstrapState.kind === 'loading') return 'Starting…'
    if (cameraState.kind === 'denied') return 'Camera denied — check browser settings'
    if (captureState.kind === 'capturing') return 'Capturing…'
    if (captureState.kind === 'done')
      return captureState.uploadState === 'uploaded' ? 'Saved ✓' : 'Saved locally'
    if (captureState.kind === 'error') return captureState.message
    if (cameraState.kind === 'granted') return 'Ready'
    if (cameraState.kind === 'requesting') return 'Opening camera…'
    return 'Tap to open camera'
  })()

  const cameraReady = cameraState.kind === 'granted'

  return (
    <div className="camera-app">
      <div className="camera-viewfinder">
        {cameraReady ? (
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        ) : (
          <div className="camera-onboarding">
            <svg className="camera-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <p className="camera-onboarding-title">miblioteca</p>
            <p className="camera-onboarding-sub">Point your camera at a bookshelf</p>
          </div>
        )}
      </div>

      <div className="camera-controls">
        {cameraReady ? (
          <button
            type="button"
            className="shutter-btn"
            onClick={() => void takePhoto()}
            disabled={captureState.kind === 'capturing'}
            aria-label="Take photo"
          />
        ) : bootstrapState.kind === 'ready' || bootstrapState.kind === 'loading' ? (
          <button
            type="button"
            onClick={() => void requestCamera()}
            disabled={cameraState.kind === 'requesting' || bootstrapState.kind === 'loading'}
          >
            {cameraState.kind === 'requesting' ? 'Opening…' : 'Open camera'}
          </button>
        ) : (
          <button type="button" onClick={() => void startBootstrap()}>
            Retry
          </button>
        )}
        <p className="camera-status">{statusText}</p>
      </div>
    </div>
  )
}
