import './styles.css'

const tracerBulletPath = '/tracer-bullet'

function TracerBulletShell() {
  const secureContextLabel = window.isSecureContext ? 'secure context ready' : 'secure context required'

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
          <dd>Ready for mock scan bootstrap</dd>
        </div>
      </dl>
      <button type="button">Start tracer bullet</button>
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
