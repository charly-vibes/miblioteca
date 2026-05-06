import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('tracer bullet shell', () => {
  it('renders the dedicated tracer-bullet route', () => {
    window.history.replaceState({}, '', '/tracer-bullet')

    render(<App />)

    expect(
      screen.getByRole('heading', { name: /tracer bullet capture flow/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/https dev shell/i)).toBeInTheDocument()
  })

  it('bootstraps and persists the tracer-bullet session in a supported secure context', async () => {
    const storage = new Map<string, string>()

    window.history.replaceState({}, '', '/tracer-bullet')
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
      expect(screen.getByText(/fresh session ready/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/TB-/i)).toBeInTheDocument()
    expect(storage.get('miblioteca.tracer-bullet')).toContain('"sessions"')
  })
})
