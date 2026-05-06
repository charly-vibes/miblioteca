export type TracerBulletScan = {
  id: string
  shortCode: string
  joinToken: string
  createdAt: string
}

export type TracerBulletSession = {
  id: string
  scanId: string
  userId: string
  startedAt: string
  endedAt?: string
  clockOffsetMs: number
  status: 'active' | 'completed'
}

export type TracerBulletSnapshot = {
  scans: TracerBulletScan[]
  sessions: TracerBulletSession[]
}

export interface TracerBulletStore {
  read(): TracerBulletSnapshot
  write(snapshot: TracerBulletSnapshot): void
}

export function createInMemoryTracerBulletStore(
  initial: TracerBulletSnapshot = { scans: [], sessions: [] }
): TracerBulletStore {
  let snapshot = cloneSnapshot(initial)

  return {
    read() {
      return cloneSnapshot(snapshot)
    },
    write(nextSnapshot) {
      snapshot = cloneSnapshot(nextSnapshot)
    }
  }
}

export function createLocalStorageTracerBulletStore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key = 'miblioteca.tracer-bullet'
): TracerBulletStore {
  return {
    read() {
      const raw = storage.getItem(key)
      if (!raw) {
        return { scans: [], sessions: [] }
      }

      return cloneSnapshot(JSON.parse(raw) as TracerBulletSnapshot)
    },
    write(snapshot) {
      storage.setItem(key, JSON.stringify(snapshot))
    }
  }
}

function cloneSnapshot(snapshot: TracerBulletSnapshot): TracerBulletSnapshot {
  return {
    scans: snapshot.scans.map((scan) => ({ ...scan })),
    sessions: snapshot.sessions.map((session) => ({ ...session }))
  }
}
