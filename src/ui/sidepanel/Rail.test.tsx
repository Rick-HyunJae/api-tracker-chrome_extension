import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Rail } from './Rail'

describe('Rail', () => {
  it('switches to the send view', () => {
    const onView = vi.fn()
    render(<Rail view="list" onView={onView} count={3} />)
    fireEvent.click(screen.getByRole('button', { name: /전송/ }))
    expect(onView).toHaveBeenCalledWith('send')
  })

  it('shows the capture count badge', () => {
    render(<Rail view="list" onView={vi.fn()} count={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders MCP and 히스토리 as disabled tabs that do not navigate', () => {
    const onView = vi.fn()
    render(<Rail view="list" onView={onView} count={0} />)
    const mcp = screen.getByRole('button', { name: /MCP/ })
    expect(mcp).toBeDisabled()
    fireEvent.click(mcp)
    expect(onView).not.toHaveBeenCalled()
  })
})
