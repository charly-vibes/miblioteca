import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the camera onboarding UI', () => {
    render(<App />)
    expect(screen.getByText(/point your camera at a bookshelf/i)).toBeInTheDocument()
  })

  it('bootstraps and persists the tracer-bullet session in a supported secure context', async () => {
    const storage = new Map<string, string>()

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        }
      },
      configurable: true
    })
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.resolve(undefined) },
      configurable: true
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument()
    })
    expect(storage.get('miblioteca.tracer-bullet')).toContain('"sessions"')
  })
})
