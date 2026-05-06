export type ReadTextFile = (path: string) => string

export function loadDevHttpsConfig(readTextFile: ReadTextFile) {
  try {
    return {
      key: readTextFile('localhost-key.pem'),
      cert: readTextFile('localhost.pem')
    }
  } catch {
    throw new Error('Missing mkcert localhost certificates. Run `just setup` before `just dev`.')
  }
}
