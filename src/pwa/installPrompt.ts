interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallPromptController {
  canInstall(): boolean
  install(): Promise<void>
  onChange(handler: () => void): () => void
  destroy(): void
}

export function createInstallPrompt(): InstallPromptController {
  let promptEvent: BeforeInstallPromptEvent | null = null
  const handlers = new Set<() => void>()

  const handler = (e: Event) => {
    e.preventDefault()
    promptEvent = e as BeforeInstallPromptEvent
    handlers.forEach((h) => h())
  }
  window.addEventListener('beforeinstallprompt', handler)

  return {
    canInstall: () => promptEvent !== null,
    install: async () => {
      if (!promptEvent) return
      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        if (outcome === 'accepted') promptEvent = null
      } catch {
        promptEvent = null
      }
      handlers.forEach((h) => h())
    },
    onChange: (h) => {
      handlers.add(h)
      return () => handlers.delete(h)
    },
    destroy: () => window.removeEventListener('beforeinstallprompt', handler),
  }
}
