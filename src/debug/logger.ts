export interface DebugEntry {
  seq: number
  t: number
  type: string
  payload: unknown
}

const CAPACITY = 1000

export class DebugLogger {
  readonly enabled: boolean

  private buf: DebugEntry[] = []
  private head = 0
  private count = 0
  private seq = 0
  private startTime = performance.now()

  constructor(params?: URLSearchParams) {
    const p = params ?? new URLSearchParams(location.search)
    this.enabled = p.has('debug')
    if (this.enabled) {
      this.buf = new Array(CAPACITY)
    }
  }

  log(type: string, payload: unknown): void {
    if (!this.enabled) return
    const entry: DebugEntry = { seq: ++this.seq, t: performance.now(), type, payload }
    this.buf[this.head] = entry
    this.head = (this.head + 1) % CAPACITY
    if (this.count < CAPACITY) this.count++
  }

  get size(): number {
    return this.count
  }

  clear(): void {
    this.count = 0
    this.head = 0
    this.seq = 0
  }

  export(): string {
    if (!this.enabled) return JSON.stringify({ meta: {}, events: [] })

    const events: DebugEntry[] = []
    if (this.count < CAPACITY) {
      for (let i = 0; i < this.count; i++) events.push(this.buf[i])
    } else {
      for (let i = 0; i < CAPACITY; i++) events.push(this.buf[(this.head + i) % CAPACITY])
    }

    return JSON.stringify({
      meta: {
        exportedAt: new Date().toISOString(),
        commit: __GIT_COMMIT__,
        userAgent: navigator.userAgent,
        url: location.href,
        sessionMs: performance.now() - this.startTime,
      },
      events,
    })
  }
}

export const debugLogger = new DebugLogger()
