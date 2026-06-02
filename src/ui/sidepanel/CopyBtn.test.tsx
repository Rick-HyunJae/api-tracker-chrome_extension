import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyBtn } from './CopyBtn'

describe('CopyBtn', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })
  it('writes the text to the clipboard and shows the done label', async () => {
    render(<CopyBtn text="hello" label="복사" />)
    fireEvent.click(screen.getByRole('button'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('복사됨'))
  })
})
