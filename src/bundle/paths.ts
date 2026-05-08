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

export function bundleFilename(shortCode: string, exportedAt: string): string {
  const date = exportedAt.slice(0, 10)
  const time = exportedAt.slice(11, 16).replace(':', '-')
  return `${shortCode}_${date}_${time}.mbibundle.zip`
}
