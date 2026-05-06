import { render, screen } from '@testing-library/react'
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
})
