import { useOnlineStatus } from './pwa/useOnlineStatus'
import { useInstallPrompt } from './pwa/useInstallPrompt'

export function AppHeader() {
  const online = useOnlineStatus()
  const { canInstall, install } = useInstallPrompt()

  return (
    <header className="app-header">
      <span aria-live="polite">
        {!online && <span className="app-header__offline">Offline — uploads queued</span>}
      </span>
      {canInstall && (
        <button className="app-header__install" onClick={install}>
          Install app
        </button>
      )}
    </header>
  )
}
