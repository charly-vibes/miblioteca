import { useEffect, useMemo, useState } from 'react'
import { bootstrapTracerBullet, type BootstrapResult } from './tracer/bootstrap'
import { createMockScanFetch } from './tracer/mockScanApi'
import { createLocalStorageTracerBulletStore } from './tracer/storage'
import './styles.css'

const tracerBulletPath = '/tracer-bullet'

type BootstrapState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: BootstrapResult }

function TracerBulletShell() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ kind: 'idle' })
  const secureContextLabel = window.isSecureContext ? 'secure context ready' : 'secure context required'
  const hasCameraSupport =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  const store = useMemo(() => createLocalStorageTracerBulletStore(window.localStorage), [])
  const fetch = useMemo(() => createMockScanFetch(() => Date.now()), [])

  useEffect(() => {
    if (!window.isSecureContext) {
      setBootstrapState({
        kind: 'error',
        message: 'Secure context required. Run the dev server over HTTPS before continuing.'
      })
      return
    }

    if (!hasCameraSupport) {
      setBootstrapState({
        kind: 'error',
        message: 'Camera access is unavailable in this browser. Open the tracer bullet in a supported runtime.'
      })
      return
    }

    void startBootstrap()
  }, [hasCameraSupport])

  async function startBootstrap() {
    setBootstrapState({ kind: 'loading' })

    try {
      const result = await bootstrapTracerBullet({
        now: () => Date.now(),
        fetch,
        store
      })
      setBootstrapState({ kind: 'ready', result })
    } catch (error) {
      setBootstrapState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Tracer bullet bootstrap failed.'
      })
    }
  }

  const statusLabel =
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
        This route is the narrow end-to-end shell for the first capture, persistence,
        and upload slice.
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
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
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
      </dl>
      <button type="button" onClick={() => void startBootstrap()}>
        Retry tracer bullet bootstrap
      </button>
    </main>
  )
}

function LandingPage() {
  return (
    <main className="shell">
      <p className="eyebrow">miblioteca</p>
      <h1>Bookshelf capture PWA</h1>
      <p className="lede">Open the dedicated tracer-bullet route to exercise the first vertical slice.</p>
      <a className="link-button" href={tracerBulletPath}>
        Open tracer bullet shell
      </a>
    </main>
  )
}

export default function App() {
  return window.location.pathname === tracerBulletPath ? <TracerBulletShell /> : <LandingPage />
}
