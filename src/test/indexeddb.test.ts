import { describe, expect, it } from 'vitest'

describe('indexedDB test harness', () => {
  it('supports an integration-style read/write cycle', async () => {
    const dbName = `miblioteca-test-${Date.now()}`
    const request = indexedDB.open(dbName, 1)

    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('captures')
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })

    const db = request.result
    const tx = db.transaction('captures', 'readwrite')
    tx.objectStore('captures').put({ id: 'capture-1' }, 'capture-1')

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    const readTx = db.transaction('captures', 'readonly')
    const getRequest = readTx.objectStore('captures').get('capture-1')
    const result = await new Promise<unknown>((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result)
      getRequest.onerror = () => reject(getRequest.error)
    })

    expect(result).toEqual({ id: 'capture-1' })
    db.close()
    indexedDB.deleteDatabase(dbName)
  })
})
