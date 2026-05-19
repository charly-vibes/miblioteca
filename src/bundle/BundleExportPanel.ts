import { getAllSessions, getSessionBundleDeliveryState, type ShelfwalkDatabase } from '../tracer'
import type { BundleAssemblyInput, BundleAssemblyResult } from './assemble'
import { assembleBundle } from './assemble'
import type { BundleShareCapability, SessionBundleDeliveryState } from './types'
import { detectShareCapability, downloadBundle, shareBundle, transferGuidance } from './share'

export type BundleExportPanelOptions = {
  db: ShelfwalkDatabase
  scanId: string
  appVersion: string
  storage?: Pick<StorageManager, 'estimate'>
  shareCapability?: BundleShareCapability
  assemble?: (input: BundleAssemblyInput) => Promise<BundleAssemblyResult>
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'exporting'; controller: AbortController }
  | { kind: 'exported'; blob: Blob | null; filename: string; totalBytes: number; shareBlocked?: true }
  | { kind: 'failed'; error: string }
  | { kind: 'aborted' }

export class BundleExportPanel {
  private state: PanelState = { kind: 'loading' }
  private destroyed = false
  private readonly opts: BundleExportPanelOptions
  private readonly capability: BundleShareCapability

  private readonly root: HTMLDivElement
  private readonly statusEl: HTMLParagraphElement
  private readonly guidanceEl: HTMLParagraphElement
  private readonly recompressEl: HTMLParagraphElement
  private readonly exportBtn: HTMLButtonElement
  private readonly cancelBtn: HTMLButtonElement
  private readonly retryBtn: HTMLButtonElement
  private readonly transferBtn: HTMLButtonElement

  constructor(container: HTMLElement, opts: BundleExportPanelOptions) {
    this.opts = opts
    this.capability = opts.shareCapability ?? detectShareCapability()

    this.root = document.createElement('div')
    this.root.className = 'bundle-export-panel'
    this.root.setAttribute('role', 'group')
    this.root.setAttribute('aria-label', 'Bundle export')

    this.statusEl = document.createElement('p')
    this.statusEl.className = 'bundle-export-status'
    this.statusEl.setAttribute('role', 'status')
    this.statusEl.setAttribute('aria-live', 'polite')

    this.guidanceEl = document.createElement('p')
    this.guidanceEl.className = 'bundle-export-guidance'
    this.guidanceEl.hidden = true

    this.recompressEl = document.createElement('p')
    this.recompressEl.className = 'bundle-export-recompress-warning'
    this.recompressEl.hidden = true

    this.exportBtn = this.makeBtn('Export bundle', () => void this.startExport())
    this.cancelBtn = this.makeBtn('Cancel', () => this.cancel())
    this.retryBtn = this.makeBtn('Retry', () => void this.startExport())
    this.transferBtn = this.makeBtn('…', () => void this.transfer())

    this.root.append(this.statusEl, this.guidanceEl, this.recompressEl, this.exportBtn, this.cancelBtn, this.retryBtn, this.transferBtn)
    container.append(this.root)

    this.render()
    void this.init()
  }

  private makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = label
    btn.addEventListener('click', onClick)
    return btn
  }

  private async init() {
    const sessions = (await getAllSessions(this.opts.db)).filter((s) => s.scanId === this.opts.scanId)
    if (sessions.length === 0) {
      this.setState({ kind: 'idle' })
      return
    }

    const states = await Promise.all(
      sessions.map((s) => getSessionBundleDeliveryState(this.opts.db, s.id))
    )

    const persisted = this.mergeDeliveryStates(states)
    if (persisted.status === 'exported') {
      this.setState({ kind: 'exported', blob: null, filename: persisted.bundleFilename, totalBytes: persisted.sizeBytes })
    } else if (persisted.status === 'failed') {
      this.setState({ kind: 'failed', error: persisted.error })
    } else if (persisted.status === 'aborted') {
      this.setState({ kind: 'aborted' })
    } else {
      this.setState({ kind: 'idle' })
    }
  }

  private mergeDeliveryStates(states: (SessionBundleDeliveryState | undefined)[]): SessionBundleDeliveryState {
    const defined = states.filter((s): s is SessionBundleDeliveryState => s !== undefined)
    if (defined.length === 0) return { status: 'idle' }

    const failed = defined.find((s) => s.status === 'failed')
    if (failed) return failed

    const aborted = defined.find((s) => s.status === 'aborted')
    if (aborted) return aborted

    const exported = defined.find((s) => s.status === 'exported')
    if (exported) return exported

    return { status: 'idle' }
  }

  private setState(s: PanelState) {
    if (this.destroyed) return
    this.state = s
    this.render()
  }

  private async startExport() {
    const controller = new AbortController()
    this.setState({ kind: 'exporting', controller })

    const fn = this.opts.assemble ?? assembleBundle
    const result = await fn({
      db: this.opts.db,
      scanId: this.opts.scanId,
      appVersion: this.opts.appVersion,
      storage: this.opts.storage ?? (navigator.storage as Pick<StorageManager, 'estimate'>),
      signal: controller.signal,
    })

    if (this.state.kind === 'aborted') return

    if (result.ok) {
      this.setState({
        kind: 'exported',
        blob: result.blob,
        filename: result.filename,
        totalBytes: result.manifest.totalBytes,
      })
    } else {
      this.setState({ kind: 'failed', error: result.error })
    }
  }

  private cancel() {
    if (this.state.kind !== 'exporting') return
    this.state.controller.abort()
    this.setState({ kind: 'aborted' })
  }

  private async transfer() {
    if (this.state.kind !== 'exported' || !this.state.blob) return
    this.transferBtn.disabled = true
    const capturedState = this.state
    const { blob: blobOrNull, filename, shareBlocked } = capturedState
    const blob = blobOrNull!
    try {
      if (this.capability.status !== 'supported' || shareBlocked) {
        downloadBundle(blob, filename)
        return
      }
      await shareBundle(blob, filename)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        // Sharing blocked by the browser — surface a Download button so the user can
        // trigger the download themselves (fresh user gesture, reliable on Android).
        if (this.state === capturedState) this.setState({ ...capturedState, shareBlocked: true })
        return
      }
      if (this.state === capturedState) {
        this.setState({ kind: 'failed', error: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      if (!this.destroyed) this.transferBtn.disabled = false
    }
  }

  private get statusText(): string {
    switch (this.state.kind) {
      case 'loading': return 'Loading…'
      case 'idle': return 'Data is on-device only'
      case 'exporting': return 'Exporting…'
      case 'exported':
        if (this.state.shareBlocked) return 'Sharing not available — select Download to save'
        return this.state.blob ? 'Exported' : 'Previously exported — re-export to download again'
      case 'failed': return `Export failed: ${this.state.error}`
      case 'aborted': return 'Export aborted'
    }
  }

  private render() {
    this.statusEl.textContent = this.statusText

    const isLoading = this.state.kind === 'loading'
    const isIdle = this.state.kind === 'idle'
    const isExporting = this.state.kind === 'exporting'
    const isExported = this.state.kind === 'exported'
    const isFailed = this.state.kind === 'failed'
    const isAborted = this.state.kind === 'aborted'

    const hasLiveBlob = this.state.kind === 'exported' && this.state.blob !== null

    this.exportBtn.hidden = !isIdle
    this.cancelBtn.hidden = !isExporting
    this.retryBtn.hidden = !(isFailed || isAborted || (isExported && !hasLiveBlob))
    this.transferBtn.hidden = !hasLiveBlob
    if (this.state.kind === 'exported') {
      const useDownload = this.capability.status !== 'supported' || this.state.shareBlocked
      this.transferBtn.textContent = useDownload ? 'Download' : 'Share'
    }

    if (this.state.kind === 'exported') {
      const guidance = transferGuidance(this.state.totalBytes)
      if (guidance.level !== 'normal') {
        this.guidanceEl.textContent = guidance.message
        this.guidanceEl.hidden = false
      } else {
        this.guidanceEl.hidden = true
      }
      this.recompressEl.textContent = guidance.recompressWarning
      this.recompressEl.hidden = false
    } else {
      this.guidanceEl.hidden = true
      this.recompressEl.hidden = true
    }

    this.root.hidden = isLoading
  }

  destroy() {
    this.destroyed = true
    if (this.state.kind === 'exporting') this.state.controller.abort()
    this.root.remove()
  }
}
