import { createScan, ScanApiError } from './createScan'
import { joinScan, JoinScanError } from './joinScan'
import { createQrInvite } from './QrInvite'
import { openShelfwalkDb, type BootstrapResult, type ShelfwalkDatabase } from '../tracer'

export type ScanManagementViewDeps = {
  openDb?: () => Promise<ShelfwalkDatabase>
  fetch?: typeof globalThis.fetch
  now?: () => number
  baseUrl?: string
  search?: string
  onReady: (result: BootstrapResult) => void
  onBack?: () => void
}

export function mountScanManagementView(container: HTMLElement, deps: ScanManagementViewDeps): () => void {
  let dbPromise: Promise<ShelfwalkDatabase> | null = null
  const root = document.createElement('main')
  root.className = 'scan-management'

  if (deps.onBack) {
    const backBtn = document.createElement('button')
    backBtn.type = 'button'
    backBtn.className = 'scan-back-btn'
    backBtn.setAttribute('aria-label', 'Back to sessions')
    backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
    backBtn.addEventListener('click', deps.onBack)
    root.append(backBtn)
  }

  const fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const now = deps.now ?? Date.now
  const baseUrl = deps.baseUrl ?? defaultBaseUrl()
  const initialToken = new URLSearchParams(deps.search ?? window.location.search).get('t') ?? ''
  const getDb = () => {
    dbPromise ??= (deps.openDb ?? (() => openShelfwalkDb()))()
    return dbPromise
  }

  const createSection = document.createElement('section')
  createSection.className = 'scan-card'
  const joinSection = document.createElement('section')
  joinSection.className = 'scan-card'

  const createTitle = document.createElement('h1')
  createTitle.textContent = 'Start a shelf scan'
  const createCopy = document.createElement('p')
  createCopy.textContent = 'Create a scan, then share the QR code or short code with helpers.'

  const createForm = document.createElement('form')
  const nameLabel = document.createElement('label')
  nameLabel.textContent = 'Scan name'
  const nameInput = document.createElement('input')
  nameInput.name = 'scanName'
  nameInput.required = true
  nameInput.autocomplete = 'off'
  nameInput.placeholder = 'Main library, west wall'
  nameLabel.append(nameInput)
  const createButton = document.createElement('button')
  createButton.type = 'submit'
  createButton.textContent = 'Create scan'
  const createError = statusParagraph('alert')
  const createSuccess = document.createElement('p')
  createSuccess.className = 'scan-form-success'
  createSuccess.setAttribute('aria-live', 'polite')
  const inviteSlot = document.createElement('div')
  inviteSlot.className = 'scan-invite-slot'
  createForm.append(nameLabel, createButton)
  createSection.append(createTitle, createCopy, createForm, createError, createSuccess, inviteSlot)

  const joinTitle = document.createElement('h2')
  joinTitle.textContent = 'Join a scan'
  const joinForm = document.createElement('form')
  const codeLabel = document.createElement('label')
  codeLabel.textContent = 'Short code'
  const codeInput = document.createElement('input')
  codeInput.name = 'shortCode'
  codeInput.required = true
  codeInput.autocomplete = 'one-time-code'
  codeInput.placeholder = 'BARN-7K9'
  codeLabel.append(codeInput)
  const tokenLabel = document.createElement('label')
  tokenLabel.textContent = 'Invite token'
  const tokenInput = document.createElement('input')
  tokenInput.name = 'joinToken'
  tokenInput.required = true
  tokenInput.autocomplete = 'off'
  tokenInput.value = initialToken
  tokenLabel.append(tokenInput)
  const displayNameLabel = document.createElement('label')
  displayNameLabel.textContent = 'Your name'
  const displayNameInput = document.createElement('input')
  displayNameInput.name = 'displayName'
  displayNameInput.required = true
  displayNameInput.autocomplete = 'name'
  displayNameInput.placeholder = 'Alice'
  displayNameLabel.append(displayNameInput)
  const joinButton = document.createElement('button')
  joinButton.type = 'submit'
  joinButton.textContent = 'Join scan'
  const joinError = statusParagraph('alert')
  joinForm.append(codeLabel, tokenLabel, displayNameLabel, joinButton)
  joinSection.append(joinTitle, joinForm, joinError)

  createForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitCreate()
  })
  joinForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitJoin()
  })

  root.append(createSection, joinSection)
  container.append(root)

  async function submitCreate() {
    createError.textContent = ''
    createSuccess.textContent = ''
    inviteSlot.replaceChildren()
    const scanName = nameInput.value.trim()
    if (!scanName) {
      createError.textContent = 'Enter a scan name.'
      return
    }

    createButton.disabled = true
    try {
      const result = await createScan({
        fetch,
        db: await getDb(),
        now,
        scanName,
      })
      const continueButton = document.createElement('button')
      continueButton.type = 'button'
      continueButton.textContent = 'Continue to camera'
      continueButton.addEventListener('click', () => {
        deps.onReady({ resumed: false, scan: result.scan, session: result.session })
      })
      createSuccess.textContent = 'Scan created — share this invite, then continue when ready.'
      createButton.disabled = true
      nameInput.disabled = true
      inviteSlot.append(createQrInvite({ scan: result.scan, baseUrl }), continueButton)
    } catch (error) {
      createError.textContent = createScanMessage(error)
      createButton.disabled = false
    }
  }

  async function submitJoin() {
    joinError.textContent = ''
    const shortCode = codeInput.value.trim()
    const joinToken = tokenInput.value.trim()
    const displayName = displayNameInput.value.trim()
    if (!shortCode || !joinToken || !displayName) {
      joinError.textContent = 'Enter the short code, invite token, and your name.'
      return
    }

    joinButton.disabled = true
    try {
      const result = await joinScan({
        fetch,
        db: await getDb(),
        now,
        shortCode,
        joinToken,
        displayName,
      })
      deps.onReady({ resumed: false, scan: result.scan, session: result.session })
    } catch (error) {
      joinError.textContent = joinScanMessage(error)
    } finally {
      joinButton.disabled = false
    }
  }

  return () => root.remove()
}

function statusParagraph(role: 'alert') {
  const p = document.createElement('p')
  p.className = 'scan-form-error'
  p.setAttribute('role', role)
  return p
}

function defaultBaseUrl(): string {
  const path = window.location.pathname.replace(/\/$/, '').replace(/\/join$/, '')
  return `${window.location.origin}${path}`
}

function createScanMessage(error: unknown): string {
  if (error instanceof ScanApiError && error.code === 'conflict') return 'Name already taken.'
  if (error instanceof ScanApiError && error.code === 'bad-request') return 'Check the scan details and try again.'
  return 'Could not create scan. Try again.'
}

function joinScanMessage(error: unknown): string {
  if (error instanceof JoinScanError && error.code === 'invalid-token') return 'Link has expired, ask for a new QR code.'
  if (error instanceof JoinScanError && error.code === 'not-found') return 'Scan not found.'
  return 'Could not join scan. Try again.'
}
