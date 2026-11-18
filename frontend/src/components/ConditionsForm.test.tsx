import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EXAMPLE_CONDITIONS } from '@/lib/parameters'
import { ConditionsForm } from './ConditionsForm'

function setup(defaults = EXAMPLE_CONDITIONS) {
  const onSubmit = vi.fn()
  render(
    <ConditionsForm
      id="test"
      defaultValues={defaults}
      onSubmit={onSubmit}
      footer={<button type="submit">Go</button>}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

describe('ConditionsForm', () => {
  it('submits numeric values', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(EXAMPLE_CONDITIONS)
  })

  it('blocks out-of-range and empty values with messages', async () => {
    const { onSubmit, user } = setup()
    const ph = screen.getByLabelText('Soil pH')
    await user.clear(ph)
    await user.type(ph, '15')
    await user.clear(screen.getByLabelText('Rainfall'))
    await user.click(screen.getByRole('button', { name: 'Go' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText('Must be at most 14')).toBeInTheDocument()
    expect(screen.getByText('Enter a number')).toBeInTheDocument()
    expect(ph).toHaveAttribute('aria-invalid', 'true')
  })
})
