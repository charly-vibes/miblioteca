import { drainUploadQueue } from '../tracer/uploadQueue'
import { loadUploadStatus, retryFailedUploads, UPLOAD_STATES } from '../tracer/uploadStatus'
import { openShelfwalkDb } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'

export type UploadStatusPanelDeps = {
  openDb?: () => Promise<ShelfwalkDatabase>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
}

export function mountUploadStatusPanel(
  container: HTMLElement,
  {
    openDb = () => openShelfwalkDb(),
    fetch = (input, init) => globalThis.fetch(input, init),
  }: UploadStatusPanelDeps = {}
): () => void {
  let dbPromise: Promise<ShelfwalkDatabase> | null = null
  let open = false
  let loading = false
  let retrying = false

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'app-header__uploads'
  button.textContent = 'Uploads'
  button.setAttribute('aria-expanded', 'false')

  const panel = document.createElement('section')
  panel.className = 'upload-status-panel'
  panel.hidden = true
  panel.setAttribute('aria-label', 'Upload status')
  panel.setAttribute('aria-live', 'polite')

  const getDb = () => {
    dbPromise ??= openDb()
    return dbPromise
  }

  async function refresh() {
    loading = true
    renderLoading()
    try {
      const snapshot = await loadUploadStatus(await getDb())
      loading = false
      renderSnapshot(snapshot)
    } catch (error) {
      loading = false
      panel.textContent = error instanceof Error ? error.message : 'Could not load upload status.'
    }
  }

  async function retryFailed() {
    retrying = true
    renderLoading('Retrying failed uploads…')
    try {
      const db = await getDb()
      await retryFailedUploads(db)
      await drainUploadQueue({ db, fetch })
      retrying = false
      await refresh()
    } catch (error) {
      retrying = false
      panel.textContent = error instanceof Error ? error.message : 'Retry failed.'
    }
  }

  function renderLoading(message = loading ? 'Loading upload status…' : 'Working…') {
    panel.replaceChildren()
    const p = document.createElement('p')
    p.className = 'upload-status-panel__loading'
    p.textContent = message
    panel.append(p)
  }

  function renderSnapshot(snapshot: Awaited<ReturnType<typeof loadUploadStatus>>) {
    panel.replaceChildren()

    const title = document.createElement('h2')
    title.textContent = 'Upload queue'

    const counts = document.createElement('dl')
    counts.className = 'upload-status-panel__counts'
    for (const state of UPLOAD_STATES) {
      const dt = document.createElement('dt')
      dt.textContent = state
      const dd = document.createElement('dd')
      dd.textContent = String(snapshot.counts[state])
      counts.append(dt, dd)
    }

    const retryButton = document.createElement('button')
    retryButton.type = 'button'
    retryButton.textContent = `Retry failed (${snapshot.counts.failed})`
    retryButton.disabled = retrying || snapshot.counts.failed === 0
    retryButton.addEventListener('click', () => void retryFailed())

    const rejectedTitle = document.createElement('h3')
    rejectedTitle.textContent = 'Rejected uploads'
    const rejectedList = document.createElement('ul')
    rejectedList.className = 'upload-status-panel__rejected'
    if (snapshot.rejected.length === 0) {
      const empty = document.createElement('li')
      empty.textContent = 'None'
      rejectedList.append(empty)
    } else {
      for (const record of snapshot.rejected) {
        const item = document.createElement('li')
        item.textContent = `${record.recordId} — ${record.uploadAttempts} attempts`
        rejectedList.append(item)
      }
    }

    panel.append(title, counts, retryButton, rejectedTitle, rejectedList)
  }

  button.addEventListener('click', () => {
    open = !open
    panel.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    if (open) void refresh()
  })

  container.append(button, panel)

  return () => {
    button.remove()
    panel.remove()
  }
}
