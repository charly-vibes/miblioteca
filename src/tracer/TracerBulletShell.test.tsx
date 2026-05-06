import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TracerBulletShell from './TracerBulletShell'
import type { CaptureSnapshotResult } from './TracerBulletShell'

const MOCK_SNAPSHOT: CaptureSnapshotResult = {
  imageBlob: new Blob(['img'], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
  width: 1280,
  height: 720,
}
const mockCaptureSnapshot = vi.fn().mockResolvedValue(MOCK_SNAPSHOT)

const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
}

let mockGetUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  storage.clear()
  mockGetUserMedia = vi.fn()
  mockCaptureSnapshot.mockResolvedValue(MOCK_SNAPSHOT)

  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    configurable: true,
  })
})

function makeFakeStream(): MediaStream {
  const fakeTrack = {
    getSettings: () => ({ deviceId: 'fake-device', facingMode: 'environment' }),
    stop: () => {},
  } as unknown as MediaStreamTrack
  return {
    getTracks: () => [fakeTrack],
    getVideoTracks: () => [fakeTrack],
  } as unknown as MediaStream
}

function mockUploadFetch(status: number) {
  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Pick<Response, 'ok' | 'status'>> =>
    ({ ok: status >= 200 && status < 300, status })
}

describe('TracerBulletShell — bootstrap', () => {
  it('renders camera onboarding state', () => {
    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={mockUploadFetch(200)} />
    )
    expect(screen.getByText(/point your camera at a bookshelf/i)).toBeInTheDocument()
  })

  it('shows Open camera button after successful bootstrap', async () => {
    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={mockUploadFetch(200)} />
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
    })
  })

  it('re-triggers bootstrap when Retry is clicked from error state', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const user = userEvent.setup()

    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={mockUploadFetch(200)} />
    )
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))

    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
    })
  })
})

describe('TracerBulletShell — camera permission', () => {
  it('shows Take photo button when camera permission is granted', async () => {
    const fakeStream = makeFakeStream()
    mockGetUserMedia.mockResolvedValue(fakeStream)
    const user = userEvent.setup()

    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={mockUploadFetch(200)} />
    )
    await waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument()
    })
  })

  it('shows a recovery message when camera permission is denied', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const user = userEvent.setup()

    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={mockUploadFetch(200)} />
    )
    await waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await waitFor(() => {
      expect(screen.getByText(/camera denied/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /take photo/i })).not.toBeInTheDocument()
  })

  it('keeps Open camera button visible after denial so the user can retry', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const user = userEvent.setup()

    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={mockUploadFetch(200)} />
    )
    await waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))

    await waitFor(() => screen.getByText(/camera denied/i))
    expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
  })
})

describe('TracerBulletShell — capture and upload', () => {
  async function bootstrapAndGrantCamera(uploadFetch: ReturnType<typeof mockUploadFetch>) {
    mockGetUserMedia.mockResolvedValue(makeFakeStream())
    const user = userEvent.setup()

    render(
      <TracerBulletShell captureSnapshot={mockCaptureSnapshot} uploadFetch={uploadFetch} />
    )
    await waitFor(() => screen.getByRole('button', { name: /open camera/i }))
    await user.click(screen.getByRole('button', { name: /open camera/i }))
    await waitFor(() => screen.getByRole('button', { name: /take photo/i }))
    return user
  }

  it('shows saved locally status when upload fails', async () => {
    const user = await bootstrapAndGrantCamera(mockUploadFetch(503))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await waitFor(() => {
      expect(screen.getByText(/saved locally/i)).toBeInTheDocument()
    })
  })

  it('shows saved confirmation after successful upload', async () => {
    const user = await bootstrapAndGrantCamera(mockUploadFetch(200))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument()
    })
  })

  it('shows upload failed status on non-2xx response', async () => {
    const user = await bootstrapAndGrantCamera(mockUploadFetch(503))
    await user.click(screen.getByRole('button', { name: /take photo/i }))

    await waitFor(() => {
      expect(screen.getByText(/saved locally/i)).toBeInTheDocument()
    })
  })
})
