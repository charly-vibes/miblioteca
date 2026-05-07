import JSZip from 'jszip'
import {
  getAllRecords,
  getAllSessions,
  getScan,
  loadBlob,
  loadThumbnail,
  getTrace,
} from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import type { BundleFileEntry, BundleFileLogicalType, BundleManifest } from './types'
import {
  recordImagePath,
  recordThumbnailPath,
  recordSidecarPath,
  sessionTracePath,
  scanMetadataPath,
  sessionMetadataPath,
  bundleFilename,
} from './paths'

export type BundleAssemblyInput = {
  db: ShelfwalkDatabase
  scanId: string
  appVersion: string
}

export type BundleAssemblyResult =
  | { ok: true; blob: Blob; manifest: BundleManifest; filename: string }
  | { ok: false; error: string }

async function blobToBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Response(blob).arrayBuffer()
}

async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

type FilePayload = { entry: BundleFileEntry; data: ArrayBuffer | Uint8Array }

async function makeFileEntry(
  path: string,
  mimeType: string,
  logicalType: BundleFileLogicalType,
  data: ArrayBuffer | Uint8Array
): Promise<FilePayload> {
  const sha256 = await sha256Hex(data)
  const sizeBytes = data.byteLength
  return { entry: { path, mimeType, logicalType, sizeBytes, sha256 }, data }
}

function encodeJson(value: unknown): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  const buffer = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(buffer).set(encoded)
  return buffer
}

export async function assembleBundle(input: BundleAssemblyInput): Promise<BundleAssemblyResult> {
  const { db, scanId, appVersion } = input

  const scan = await getScan(db, scanId)
  if (!scan) return { ok: false, error: `Scan not found: ${scanId}` }

  const allSessions = await getAllSessions(db)
  const sessions = allSessions.filter((s) => s.scanId === scanId)
  if (sessions.length === 0) return { ok: false, error: `No sessions found for scan: ${scanId}` }

  const allRecords = await getAllRecords(db)
  const records = allRecords.filter((r) => r.scanId === scanId)

  const payloads: FilePayload[] = []

  payloads.push(await makeFileEntry(scanMetadataPath(), 'application/json', 'scan-metadata', encodeJson(scan)))

  for (const session of sessions) {
    payloads.push(
      await makeFileEntry(
        sessionMetadataPath(session.id),
        'application/json',
        'session-metadata',
        encodeJson(session)
      )
    )
  }

  for (const record of records) {
    const { recordId, sessionId } = record

    const imageBlob = await loadBlob(db, recordId)
    if (!imageBlob) return { ok: false, error: `Image blob missing for record: ${recordId}` }

    const thumbBlob = await loadThumbnail(db, recordId)
    if (!thumbBlob) return { ok: false, error: `Thumbnail blob missing for record: ${recordId}` }

    payloads.push(
      await makeFileEntry(
        recordSidecarPath(sessionId, recordId),
        'application/json',
        'record-sidecar',
        encodeJson(record)
      )
    )

    payloads.push(
      await makeFileEntry(
        recordImagePath(sessionId, recordId, record.image.mimeType),
        record.image.mimeType,
        'image',
        await blobToBuffer(imageBlob)
      )
    )

    payloads.push(
      await makeFileEntry(
        recordThumbnailPath(sessionId, recordId, record.image.mimeType),
        record.image.mimeType,
        'thumbnail',
        await blobToBuffer(thumbBlob)
      )
    )
  }

  for (const session of sessions) {
    const trace = await getTrace(db, session.id)
    if (!trace) continue

    let binary = ''
    for (const b of new Uint8Array(trace.data)) binary += String.fromCharCode(b)

    payloads.push(
      await makeFileEntry(
        sessionTracePath(session.id),
        'application/json',
        'trace',
        encodeJson({ sessionId: trace.sessionId, rowCount: trace.rowCount, data: btoa(binary), pauseGaps: trace.pauseGaps })
      )
    )
  }

  const exportedAt = new Date().toISOString()
  const totalBytes = payloads.reduce((sum, p) => sum + p.entry.sizeBytes, 0)
  const manifest: BundleManifest = {
    formatVersion: 1,
    appVersion,
    scanId,
    sessionIds: sessions.map((s) => s.id),
    exportedAt,
    recordCount: records.length,
    sessionCount: sessions.length,
    totalBytes,
    files: payloads.map((p) => p.entry),
  }

  const zip = new JSZip()
  for (const { entry, data } of payloads) {
    zip.file(entry.path, data)
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

  const validationError = await validateArchive(blob, manifest)
  if (validationError) return { ok: false, error: validationError }

  const date = exportedAt.slice(0, 10)
  const filename = bundleFilename(scan.shortCode, scan.shortCode, date)

  return { ok: true, blob, manifest, filename }
}

async function validateArchive(blob: Blob, manifest: BundleManifest): Promise<string | null> {
  const zip = await JSZip.loadAsync(blob)

  if (!zip.file('manifest.json')) return 'manifest.json missing from archive'

  for (const entry of manifest.files) {
    const zipFile = zip.file(entry.path)
    if (!zipFile) return `Missing file in archive: ${entry.path}`

    const data = await zipFile.async('arraybuffer')
    if (data.byteLength !== entry.sizeBytes) {
      return `Size mismatch for ${entry.path}: expected ${entry.sizeBytes}, got ${data.byteLength}`
    }

    const actualHash = await sha256Hex(data)
    if (actualHash !== entry.sha256) return `SHA256 mismatch for ${entry.path}`
  }

  return null
}
