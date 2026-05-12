import { describe, it, expect } from 'vitest'
import { createQrInvite } from './QrInvite'

const SCAN = {
  id: 'scan-abc',
  shortCode: 'ABCD-234',
  joinToken: 'deadbeef'.repeat(8),
  createdAt: new Date().toISOString(),
}

describe('createQrInvite', () => {
  it('renders an svg element', () => {
    const el = createQrInvite({ scan: SCAN, baseUrl: 'https://example.com/miblioteca' })
    expect(el.querySelector('svg')).not.toBeNull()
  })

  it('shows the shortCode', () => {
    const el = createQrInvite({ scan: SCAN, baseUrl: 'https://example.com/miblioteca' })
    expect(el.textContent).toContain('ABCD-234')
  })

  it('encodes joinToken in the QR url', () => {
    const el1 = createQrInvite({ scan: SCAN, baseUrl: 'https://example.com' })
    const el2 = createQrInvite({ scan: { ...SCAN, joinToken: 'different-token' }, baseUrl: 'https://example.com' })
    // Different joinTokens must produce different QR matrices — proves the token is encoded
    expect(el1.querySelector('svg')!.outerHTML).not.toBe(el2.querySelector('svg')!.outerHTML)
  })

  it('applies a custom size', () => {
    const el = createQrInvite({ scan: SCAN, baseUrl: 'https://example.com/miblioteca', size: 200 })
    const svg = el.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('200')
    expect(svg?.getAttribute('height')).toBe('200')
  })
})
