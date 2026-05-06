type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync: { register(tag: string): Promise<void> }
}

export async function requestUploadSync(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
  const reg = (await navigator.serviceWorker.ready) as SyncCapableRegistration
  await reg.sync.register('upload-pending')
}
