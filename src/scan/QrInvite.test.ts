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
    const el = createQrInvite({ scan: SCAN, baseUrl: 'https://example.com/miblioteca' })
    expect(el.querySelector('svg')).not.toBeNull()
  })

  it('applies a custom size', () => {
    const el = createQrInvite({ scan: SCAN, baseUrl: 'https://example.com/miblioteca', size: 200 })
    const svg = el.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('200')
    expect(svg?.getAttribute('height')).toBe('200')
  })
})
