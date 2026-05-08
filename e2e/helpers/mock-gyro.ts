import type { Page } from '@playwright/test'

export async function mockGyro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let active: {
      x: number | null
      y: number | null
      z: number | null
      timestamp: number | null
      onreading: (() => void) | null
      onerror: ((e: Event) => void) | null
      start(): void
      stop(): void
    } | null = null

    class MockGyroscope {
      x: number | null = 0
      y: number | null = 0
      z: number | null = 0
      timestamp: number | null = null
      onreading: (() => void) | null = null
      onerror: ((e: Event) => void) | null = null

      start() {
        active = this
      }

      stop() {
        if (active === this) active = null
      }
    }

    ;(window as Record<string, unknown>)['Gyroscope'] = MockGyroscope
    ;(window as Record<string, unknown>)['__triggerGyroReading'] = (gz: number) => {
      if (!active?.onreading) return
      active.z = gz
      active.timestamp = performance.now()
      active.onreading()
    }
  })
}

/** Fire a gyro reading and wait one animation frame for the RAF loop to react. */
export async function triggerGyroReading(page: Page, gz: number): Promise<void> {
  await page.evaluate((g) => {
    ;(window as Record<string, unknown>)['__triggerGyroReading'](g)
  }, gz)
  // Wait one RAF tick so the ghost overlay loop can process the reading
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}
