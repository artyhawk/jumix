import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QueueSkeleton } from './queue-skeleton'

describe('QueueSkeleton', () => {
  it('defaults to 3 skeleton rows', () => {
    render(<QueueSkeleton />)
    // each row has 4 skeletons (avatar + 2 lines + 2 buttons) = at least count=3 rows × multiple skeletons
    const statuses = screen.getAllByRole('status')
    // 3 rows × 5 skeletons each = 15
    expect(statuses.length).toBe(15)
  })

  it('renders custom count of rows', () => {
    render(<QueueSkeleton count={5} />)
    // 5 rows × 5 skeletons = 25
    expect(screen.getAllByRole('status').length).toBe(25)
  })
})
