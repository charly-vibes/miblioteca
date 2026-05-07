const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

function ext(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? 'bin'
}

export function recordImagePath(sessionId: string, recordId: string, mimeType: string): string {
  return `images/${sessionId}/${recordId}.${ext(mimeType)}`
}

export function recordThumbnailPath(sessionId: string, recordId: string, mimeType: string): string {
  return `thumbnails/${sessionId}/${recordId}.${ext(mimeType)}`
}

export function recordSidecarPath(sessionId: string, recordId: string): string {
  return `records/${sessionId}/${recordId}.json`
}

export function sessionTracePath(sessionId: string): string {
  return `traces/${sessionId}.jsonl`
}

export function sessionPreviewFramePath(sessionId: string): string {
  return `previews/${sessionId}.jsonl`
}

export function scanMetadataPath(): string {
  return 'scan.json'
}

export function sessionMetadataPath(sessionId: string): string {
  return `sessions/${sessionId}.json`
}

export function bundleFilename(scanLabel: string, shortCode: string, date: string): string {
  const slug = scanLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const prefix = slug || 'scan'
  return `${prefix}_${shortCode}_${date}.mbibundle.zip`
}
