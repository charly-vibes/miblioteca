import {
  getAllRecords,
  getAllSessions,
  getSessionBundleDeliveryState,
  type ShelfwalkDatabase,
  type TracerBulletSession,
} from '../tracer'
import { navigateToSession } from '../router'
import type { SessionBundleDeliveryState } from '../bundle/types'

export type SessionsListViewDeps = {
  openDb: () => Promise<ShelfwalkDatabase>
  onStartScan: () => void
  onMoreOptions: () => void
  quickStartPending?: boolean
  quickStartError?: string
}

export function mountSessionsListView(
  container: HTMLElement,
  deps: SessionsListViewDeps
): () => void {
  const root = document.createElement('main')
  root.className = 'sessions-list'

  const header = document.createElement('header')
  header.className = 'sessions-list-header'

  const title = document.createElement('h1')
  title.textContent = 'Sessions'

  const startScanBtn = document.createElement('button')
  startScanBtn.type = 'button'
  startScanBtn.textContent = deps.quickStartPending ? 'Starting camera…' : 'Start scanning'
  startScanBtn.className = 'sessions-new-btn'
  startScanBtn.disabled = deps.quickStartPending ?? false
  startScanBtn.addEventListener('click', deps.onStartScan)

  const moreOptionsBtn = document.createElement('button')
  moreOptionsBtn.type = 'button'
  moreOptionsBtn.textContent = 'More options'
  moreOptionsBtn.className = 'sessions-more-options-btn'
  moreOptionsBtn.addEventListener('click', deps.onMoreOptions)

  header.append(title, startScanBtn, moreOptionsBtn)

  const quickStartErrorEl = document.createElement('p')
  quickStartErrorEl.className = 'sessions-start-error'
  quickStartErrorEl.setAttribute('role', 'alert')
  quickStartErrorEl.hidden = !deps.quickStartError
  quickStartErrorEl.textContent = deps.quickStartError ?? ''

  const listHeading = document.createElement('h2')
  listHeading.textContent = 'Previous scans'

  const listEl = document.createElement('ul')
  listEl.className = 'sessions-items'
  listEl.setAttribute('aria-busy', 'true')

  const emptyEl = document.createElement('p')
  emptyEl.className = 'sessions-empty'
  emptyEl.hidden = true
  emptyEl.textContent = 'No sessions yet. Start a new scan to begin.'

  root.append(header, quickStartErrorEl, listHeading, listEl, emptyEl)
  container.append(root)

  void load()

  async function load() {
    let db: ShelfwalkDatabase
    try {
      db = await deps.openDb()
    } catch {
      listEl.setAttribute('aria-busy', 'false')
      listEl.textContent = 'Could not load sessions.'
      return
    }
    const [sessions, records] = await Promise.all([getAllSessions(db), getAllRecords(db)])

    const countBySession = new Map<string, number>()
    for (const record of records) {
      countBySession.set(record.sessionId, (countBySession.get(record.sessionId) ?? 0) + 1)
    }

    sessions.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))

    listEl.setAttribute('aria-busy', 'false')
    listEl.replaceChildren()

    if (sessions.length === 0) {
      emptyEl.hidden = false
      return
    }

    const deliveryStates = await Promise.all(
      sessions.map((s) => getSessionBundleDeliveryState(db, s.id))
    )

    sessions.forEach((session, i) => {
      const count = countBySession.get(session.id) ?? 0
      const deliveryState = deliveryStates[i]
      listEl.append(renderSessionRow(session, count, deliveryState))
    })
  }

  return () => root.remove()
}

function renderSessionRow(
  session: TracerBulletSession,
  captureCount: number,
  deliveryState: SessionBundleDeliveryState | undefined
): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'session-row'
  li.setAttribute('role', 'button')
  li.setAttribute('tabindex', '0')

  const date = new Date(session.startedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
  const time = new Date(session.startedAt).toLocaleTimeString(undefined, { timeStyle: 'short' })

  const dateEl = document.createElement('span')
  dateEl.className = 'session-row-date'
  dateEl.textContent = `${date} ${time}`

  const countEl = document.createElement('span')
  countEl.className = 'session-row-count'
  countEl.textContent = `${captureCount} capture${captureCount !== 1 ? 's' : ''}`

  const exported = deliveryState?.status === 'exported'
  const statusEl = document.createElement('span')
  statusEl.className = `session-row-status session-row-status--${exported ? 'exported' : 'pending'}`
  statusEl.textContent = exported ? 'Exported' : 'Pending'

  const meta = document.createElement('div')
  meta.className = 'session-row-meta'
  meta.append(countEl, statusEl)

  li.append(dateEl, meta)

  const navigate = () => navigateToSession(session.id)
  li.addEventListener('click', navigate)
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate()
    }
  })

  return li
}
