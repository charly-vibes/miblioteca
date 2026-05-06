import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppHeader } from './AppHeader'
import * as onlineStatus from './pwa/useOnlineStatus'
import * as installPrompt from './pwa/useInstallPrompt'

vi.mock('./pwa/useOnlineStatus')
vi.mock('./pwa/useInstallPrompt')

const mockOnlineStatus = vi.mocked(onlineStatus.useOnlineStatus)
const mockInstallPrompt = vi.mocked(installPrompt.useInstallPrompt)

describe('AppHeader', () => {
  it('shows no offline indicator when online', () => {
    mockOnlineStatus.mockReturnValue(true)
    mockInstallPrompt.mockReturnValue({ canInstall: false, install: vi.fn() })
    render(<AppHeader />)
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
  })

  it('shows offline indicator when not online', () => {
    mockOnlineStatus.mockReturnValue(false)
    mockInstallPrompt.mockReturnValue({ canInstall: false, install: vi.fn() })
    render(<AppHeader />)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('shows no install button when canInstall is false', () => {
    mockOnlineStatus.mockReturnValue(true)
    mockInstallPrompt.mockReturnValue({ canInstall: false, install: vi.fn() })
    render(<AppHeader />)
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('shows install button when canInstall is true', () => {
    mockOnlineStatus.mockReturnValue(true)
    mockInstallPrompt.mockReturnValue({ canInstall: true, install: vi.fn() })
    render(<AppHeader />)
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
  })

  it('calls install() when install button is clicked', async () => {
    const install = vi.fn()
    mockOnlineStatus.mockReturnValue(true)
    mockInstallPrompt.mockReturnValue({ canInstall: true, install })
    render(<AppHeader />)
    await userEvent.click(screen.getByRole('button', { name: /install/i }))
    expect(install).toHaveBeenCalled()
  })
})
