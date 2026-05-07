import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectShareCapability, transferGuidance, shareBundle, downloadBundle } from './share'

const MB = 1024 * 1024

describe('detectShareCapability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns supported when navigator.share and canShare files both work', () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(true),
    })
    expect(detectShareCapability()).toEqual({ status: 'supported' })
  })

  it('returns web-share-unavailable when navigator.share is missing', () => {
    vi.stubGlobal('navigator', {})
    const cap = detectShareCapability()
    expect(cap).toEqual({ status: 'unsupported', reason: 'web-share-unavailable', fallback: 'download' })
  })

  it('returns file-share-unavailable when canShare returns false for files', () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(false),
    })
    const cap = detectShareCapability()
    expect(cap).toEqual({ status: 'unsupported', reason: 'file-share-unavailable', fallback: 'download' })
  })

  it('returns file-share-unavailable when canShare is missing', () => {
    vi.stubGlobal('navigator', { share: vi.fn() })
    const cap = detectShareCapability()
    expect(cap).toEqual({ status: 'unsupported', reason: 'file-share-unavailable', fallback: 'download' })
  })
})

describe('transferGuidance', () => {
  it('returns normal for bundles under 100 MB', () => {
    const g = transferGuidance(50 * MB)
    expect(g.level).toBe('normal')
  })

  it('returns warning at exactly 100 MB', () => {
    const g = transferGuidance(100 * MB)
    expect(g.level).toBe('warning')
    expect('thresholdBytes' in g && g.thresholdBytes).toBe(100 * MB)
  })

  it('returns warning above 100 MB and below 500 MB', () => {
    const g = transferGuidance(200 * MB)
    expect(g.level).toBe('warning')
  })

  it('returns recommend-drive-or-usb at exactly 500 MB', () => {
    const g = transferGuidance(500 * MB)
    expect(g.level).toBe('recommend-drive-or-usb')
    expect('thresholdBytes' in g && g.thresholdBytes).toBe(500 * MB)
  })

  it('returns recommend-drive-or-usb above 500 MB', () => {
    const g = transferGuidance(1000 * MB)
    expect(g.level).toBe('recommend-drive-or-usb')
  })

  it('includes a recompressWarning at every level', () => {
    for (const bytes of [50 * MB, 200 * MB, 600 * MB]) {
      const g = transferGuidance(bytes)
      expect(g).toHaveProperty('recompressWarning')
      expect(typeof g.recompressWarning).toBe('string')
      expect(g.recompressWarning.length).toBeGreaterThan(0)
    }
  })
})

describe('shareBundle', () => {
  it('calls navigator.share with a File wrapping the blob', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: mockShare })
    const blob = new Blob(['data'], { type: 'application/zip' })
    await shareBundle(blob, 'test.mbibundle.zip')
    expect(mockShare).toHaveBeenCalledOnce()
    const arg = mockShare.mock.calls[0][0] as { files: File[]; title: string }
    expect(arg.files[0]).toBeInstanceOf(File)
    expect(arg.files[0].name).toBe('test.mbibundle.zip')
    expect(arg.title).toBe('test.mbibundle.zip')
  })
})

describe('downloadBundle', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    vi.restoreAllMocks()
  })

  it('creates and clicks an anchor with the correct download attribute', () => {
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock')
    const mockRevokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL })

    const clicks: string[] = []
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(() => { clicks.push((el as HTMLAnchorElement).download) })
      }
      return el
    })

    const blob = new Blob(['data'], { type: 'application/zip' })
    downloadBundle(blob, 'library.mbibundle.zip')

    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)
    expect(clicks).toContain('library.mbibundle.zip')
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})
