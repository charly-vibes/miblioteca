import { renderHook, act } from '@testing-library/react'
import { useInstallPrompt } from './useInstallPrompt'

function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome })
  })
  act(() => { window.dispatchEvent(event) })
  return event
}

describe('useInstallPrompt', () => {
  it('canInstall is false before beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
  })

  it('canInstall becomes true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireInstallPrompt()
    expect(result.current.canInstall).toBe(true)
  })

  it('install() calls prompt() on the captured event', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = fireInstallPrompt('accepted')
    await act(async () => { await result.current.install() })
    expect(event.prompt).toHaveBeenCalled()
  })

  it('canInstall becomes false after accepted outcome', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireInstallPrompt('accepted')
    await act(async () => { await result.current.install() })
    expect(result.current.canInstall).toBe(false)
  })

  it('canInstall stays true after dismissed outcome', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireInstallPrompt('dismissed')
    await act(async () => { await result.current.install() })
    expect(result.current.canInstall).toBe(true)
  })

  it('install() is a no-op when canInstall is false', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    await act(async () => { await result.current.install() })
    expect(result.current.canInstall).toBe(false)
  })

  it('install() clears event on AbortError', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new DOMException('prompt not shown', 'AbortError')),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const })
    })
    act(() => { window.dispatchEvent(event) })
    expect(result.current.canInstall).toBe(true)
    await act(async () => { await result.current.install() })
    expect(result.current.canInstall).toBe(false)
  })
})
