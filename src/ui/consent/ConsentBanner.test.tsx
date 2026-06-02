import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentBanner } from './ConsentBanner'
import * as storage from '../../shared/storage'

describe('ConsentBanner', () => {
  beforeEach(() => {
    vi.spyOn(storage, 'grantConsent').mockResolvedValue(undefined)
  })

  it('renders the consent dialog with correct title', () => {
    render(<ConsentBanner />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('API Tracker 데이터 수집 동의')).toBeInTheDocument()
  })

  it('has correct accessibility attributes', () => {
    render(<ConsentBanner />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-describedby', 'consent-desc')
    expect(document.getElementById('consent-desc')).not.toBeNull()
  })

  it('calls grantConsent when button clicked', async () => {
    const spy = vi.spyOn(storage, 'grantConsent').mockResolvedValue(undefined)
    render(<ConsentBanner />)
    await userEvent.click(screen.getByRole('button', { name: /동의하고 시작/ }))
    expect(spy).toHaveBeenCalledOnce()
  })

  it('shows warning about sensitive data collection', () => {
    render(<ConsentBanner />)
    expect(screen.getByText(/요청 헤더/)).toBeInTheDocument()
  })
})
