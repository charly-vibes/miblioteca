export const LOW_STORAGE_AVAILABLE_BYTES = 500 * 1024 * 1024

export type StorageBudgetStatus =
  | { kind: 'ok'; persisted?: boolean; availableBytes?: number }
  | { kind: 'warning'; reason: 'persist-denied' | 'low-storage'; message: string; persisted?: boolean; availableBytes?: number }
  | { kind: 'blocking'; reason: 'quota-exhausted'; message: string; persisted?: boolean; availableBytes: number }

export type StorageBudgetManager = Pick<StorageManager, 'persist' | 'estimate'>

export type CheckStorageBudgetOptions = {
  lowStorageBytes?: number
  requestPersist?: boolean
}

export async function checkStorageBudget(
  storage: Partial<StorageBudgetManager> | undefined,
  opts: CheckStorageBudgetOptions = {}
): Promise<StorageBudgetStatus> {
  const lowStorageBytes = opts.lowStorageBytes ?? LOW_STORAGE_AVAILABLE_BYTES
  const persisted = opts.requestPersist && storage?.persist
    ? await storage.persist().catch(() => false)
    : undefined
  const estimate = storage?.estimate
    ? await storage.estimate().catch(() => undefined)
    : undefined
  const availableBytes = availableFromEstimate(estimate)

  if (availableBytes !== undefined && availableBytes <= 0) {
    return {
      kind: 'blocking',
      reason: 'quota-exhausted',
      message: 'Storage is full. Free space before taking more photos.',
      persisted,
      availableBytes,
    }
  }

  if (availableBytes !== undefined && availableBytes < lowStorageBytes) {
    return {
      kind: 'warning',
      reason: 'low-storage',
      message: 'Less than 500 MB of browser storage is available. Upload or free space soon.',
      persisted,
      availableBytes,
    }
  }

  if (persisted === false) {
    return {
      kind: 'warning',
      reason: 'persist-denied',
      message: 'Browser storage is not protected from eviction. Keep this tab open until uploads finish.',
      persisted,
      availableBytes,
    }
  }

  return { kind: 'ok', persisted, availableBytes }
}

function availableFromEstimate(estimate: StorageEstimate | undefined): number | undefined {
  if (estimate?.quota === undefined || estimate.usage === undefined) return undefined
  if (!Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return undefined
  return estimate.quota - estimate.usage
}
