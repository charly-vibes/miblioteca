// Suffix alphabet: alphanumeric with I, O, 0, 1 removed to avoid visual confusion
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateShortCode(random: () => number = Math.random): string {
  const prefix = Array.from({ length: 4 }, () =>
    String.fromCharCode(65 + Math.floor(random() * 26))
  ).join('')

  const suffix = Array.from({ length: 3 }, () =>
    SUFFIX_ALPHABET[Math.floor(random() * SUFFIX_ALPHABET.length)]
  ).join('')

  return `${prefix}-${suffix}`
}

export function clockOffsetMs(serverTimeMs: number, now: () => number = Date.now): number {
  return now() - serverTimeMs
}
