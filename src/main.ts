import './styles.css'
import { mountAppHeader } from './pwa/AppHeader'
import { mountScanManagementView } from './scan/ScanManagementView'
import { CaptureView } from './tracer/CaptureView'
import { createMockScanFetch } from './tracer/mockScanApi'

const root = document.getElementById('root')!
mountAppHeader(root)

let unmountScanManagement: (() => void) | null = null
unmountScanManagement = mountScanManagementView(root, {
  fetch: createMockScanFetch(() => Date.now()) as typeof globalThis.fetch,
  onReady: (result) => {
    unmountScanManagement?.()
    new CaptureView(root, { bootstrapResult: result })
  },
})
