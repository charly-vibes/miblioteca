import type { BundleShareCapability, BundleTransferGuidance } from './types'

const MB = 1024 * 1024

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
    }
  }
  if (sizeBytes >= 100 * MB) {
    return {
      level: 'warning',
      message: 'Bundle exceeds 100 MB — email may fail or be slow. Try Drive or USB for reliability.',
      thresholdBytes: 100 * MB,
    }
  }
  return { level: 'normal', message: 'Ready to share or download.' }
}

export async function shareBundle(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/zip' })
  await navigator.share({ files: [file], title: filename })
}

export function downloadBundle(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
