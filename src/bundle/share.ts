import type { BundleShareCapability, BundleTransferGuidance } from './types'
import { debugLogger } from '../debug/logger'

const MB = 1024 * 1024

const RECOMPRESS_WARNING =
  'To preserve image quality, send as a file or document — not as a photo or media message.'

export function detectShareCapability(): BundleShareCapability {
  if (typeof navigator?.share !== 'function') {
    return { status: 'unsupported', reason: 'web-share-unavailable', fallback: 'download' }
  }
  if (typeof navigator?.canShare !== 'function' || !navigator.canShare({ files: [new File([], 'test.zip')] })) {
    return { status: 'unsupported', reason: 'file-share-unavailable', fallback: 'download' }
  }
  return { status: 'supported' }
}

export function transferGuidance(sizeBytes: number): BundleTransferGuidance {
  if (sizeBytes >= 500 * MB) {
    return {
      level: 'recommend-drive-or-usb',
      message: 'Bundle is large — use Drive, USB, or AirDrop. Email and most chat apps will fail.',
      thresholdBytes: 500 * MB,
      recompressWarning: RECOMPRESS_WARNING,
    }
  }
  if (sizeBytes >= 100 * MB) {
    return {
      level: 'warning',
      message: 'Bundle exceeds 100 MB — email may fail or be slow. Try Drive or USB for reliability.',
      thresholdBytes: 100 * MB,
      recompressWarning: RECOMPRESS_WARNING,
    }
  }
  return { level: 'normal', message: 'Ready to share or download.', recompressWarning: RECOMPRESS_WARNING }
}

export async function shareBundle(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/zip' })
  debugLogger.log('share:attempt', { sizeBytes: blob.size })
  try {
    await navigator.share({ files: [file], title: filename })
    debugLogger.log('share:result', { outcome: 'success' })
  } catch (err) {
    debugLogger.log('share:result', { outcome: 'error', error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export function downloadBundle(blob: Blob, filename: string): void {
  debugLogger.log('download:triggered', { sizeBytes: blob.size })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
