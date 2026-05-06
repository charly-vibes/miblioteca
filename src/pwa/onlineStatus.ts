export interface OnlineStatusController {
  isOnline(): boolean
  onChange(handler: (online: boolean) => void): () => void
  destroy(): void
}

export function createOnlineStatus(): OnlineStatusController {
  let _online = navigator.onLine
  const handlers = new Set<(online: boolean) => void>()

  const handleOnline = () => { _online = true; handlers.forEach((h) => h(true)) }
  const handleOffline = () => { _online = false; handlers.forEach((h) => h(false)) }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return {
    isOnline: () => _online,
    onChange: (handler) => {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    destroy: () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    },
  }
}
