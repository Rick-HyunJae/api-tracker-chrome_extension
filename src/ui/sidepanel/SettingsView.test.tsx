import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsView } from './SettingsView'
import { DEFAULT_SETTINGS } from '../../shared/types'

describe('SettingsView', () => {
  it('edits the endpoint and emits a patch', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('업로드 엔드포인트'), { target: { value: 'https://c/api' } })
    expect(onChange).toHaveBeenCalledWith({ serverUrl: 'https://c/api' })
  })

  it('toggles a method chip off', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'GET' }))
    expect(onChange).toHaveBeenCalledWith({ captureMethods: ['POST', 'PUT', 'PATCH', 'DELETE'] })
  })

  it('toggles saveBody', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={DEFAULT_SETTINGS} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('sw-saveBody'))
    expect(onChange).toHaveBeenCalledWith({ saveBody: false })
  })
})
