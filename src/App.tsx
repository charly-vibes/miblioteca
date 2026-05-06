import TracerBulletShell from './tracer/TracerBulletShell'
import './styles.css'

const tracerBulletPath = '/tracer-bullet'

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
