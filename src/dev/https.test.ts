import { describe, expect, it } from 'vitest'
import { loadDevHttpsConfig } from './https'

describe('loadDevHttpsConfig', () => {
  it('loads mkcert localhost files for the Vite dev server', () => {
    const files = new Map<string, string>([
      ['localhost-key.pem', 'dev-key'],
      ['localhost.pem', 'dev-cert']
    ])

    const https = loadDevHttpsConfig((path) => {
      const value = files.get(path)
      if (!value) {
        throw new Error(`missing ${path}`)
      }
      return value
    })

    expect(https).toEqual({
      key: 'dev-key',
      cert: 'dev-cert'
    })
  })

  it('raises a setup error when mkcert files are missing', () => {
    expect(() =>
      loadDevHttpsConfig(() => {
        throw new Error('missing cert')
      })
    ).toThrowError('Missing mkcert localhost certificates. Run `just setup` before `just dev`.')
  })
})
