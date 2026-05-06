import { afterEach, describe, expect, it } from 'vitest'
import { createOnlineStatus } from './onlineStatus'

const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')

afterEach(() => {
  if (originalOnLine) Object.defineProperty(navigator, 'onLine', originalOnLine)
})

describe('createOnlineStatus', () => {
  it('returns true when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const ctrl = createOnlineStatus()
    expect(ctrl.isOnline()).toBe(true)
    ctrl.destroy()
  })

  it('returns false when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const ctrl = createOnlineStatus()
    expect(ctrl.isOnline()).toBe(false)
    ctrl.destroy()
  })

  it('updates to false when offline event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const ctrl = createOnlineStatus()
    window.dispatchEvent(new Event('offline'))
    expect(ctrl.isOnline()).toBe(false)
    ctrl.destroy()
  })

  it('updates to true when online event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const ctrl = createOnlineStatus()
    window.dispatchEvent(new Event('online'))
    expect(ctrl.isOnline()).toBe(true)
    ctrl.destroy()
  })

  it('calls onChange handler on state change', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const ctrl = createOnlineStatus()
    const changes: boolean[] = []
    ctrl.onChange((online) => changes.push(online))
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(changes).toEqual([false, true])
    ctrl.destroy()
  })

  it('unsubscribes when returned cleanup is called', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const ctrl = createOnlineStatus()
    const changes: boolean[] = []
    const unsub = ctrl.onChange((online) => changes.push(online))
    unsub()
    window.dispatchEvent(new Event('offline'))
    expect(changes).toHaveLength(0)
    ctrl.destroy()
  })
})
