import { createInstallPrompt } from './installPrompt'
import { createOnlineStatus } from './onlineStatus'

export function mountAppHeader(container: HTMLElement): () => void {
  const header = document.createElement('header')
  header.className = 'app-header'

  const offlineBadge = document.createElement('span')
  offlineBadge.setAttribute('aria-live', 'polite')

  const installBtn = document.createElement('button')
  installBtn.className = 'app-header__install'
  installBtn.textContent = 'Install app'
  installBtn.hidden = true

  header.append(offlineBadge, installBtn)
  container.prepend(header)

  const onlineStatus = createOnlineStatus()
  const installPrompt = createInstallPrompt()

  function updateOnline(online: boolean) {
    offlineBadge.innerHTML = online
      ? ''
      : '<span class="app-header__offline">Offline — uploads queued</span>'
  }

  function updateInstall() {
    installBtn.hidden = !installPrompt.canInstall()
  }

  updateOnline(onlineStatus.isOnline())
  updateInstall()

  const unsubOnline = onlineStatus.onChange(updateOnline)
  const unsubInstall = installPrompt.onChange(updateInstall)
  installBtn.addEventListener('click', () => void installPrompt.install())

  return () => {
    unsubOnline()
    unsubInstall()
    onlineStatus.destroy()
    installPrompt.destroy()
    header.remove()
  }
}
