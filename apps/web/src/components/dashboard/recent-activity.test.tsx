import type { RecentAuditEvent, RecentAuditResponse } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentActivity } from './recent-activity'

vi.mock('@/lib/api/audit', () => ({
  listRecentAudit: vi.fn(),
}))

import { listRecentAudit } from '@/lib/api/audit'

const list = vi.mocked(listRecentAudit)

function makeEvent(overrides: Partial<RecentAuditEvent> = {}): RecentAuditEvent {
  return {
    id: 'a-1',
    actor: { userId: 'u-1', name: 'Ербол', role: 'superadmin' },
    action: 'organization.create',
    target: { type: 'organization', id: 'o-1' },
    organizationId: 'o-1',
    organizationName: 'ТОО «Альфа»',
    metadata: {},
    ipAddress: null,
    createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ...overrides,
  }
}

function renderIt() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <RecentActivity />
    </Wrapper>,
  )
}

beforeEach(() => {
  list.mockReset()
})

describe('RecentActivity', () => {
  it('renders event rows with label + actor + organization', async () => {
    const payload: RecentAuditResponse = {
      events: [
        makeEvent(),
        makeEvent({
          id: 'a-2',
          action: 'crane_profile.approve',
          actor: { userId: 'u-2', name: 'Админ', role: 'superadmin' },
          organizationName: null,
          organizationId: null,
        }),
      ],
    }
    list.mockResolvedValueOnce(payload)
    renderIt()
    await waitFor(() => expect(screen.getByText('Создал организацию')).toBeInTheDocument())
    expect(screen.getByText('Одобрил кранового')).toBeInTheDocument()
    expect(screen.getByText('ТОО «Альфа»')).toBeInTheDocument()
    expect(screen.getByText('Ербол')).toBeInTheDocument()
  })

  it('renders "Система" for null-actor events', async () => {
    list.mockResolvedValueOnce({
      events: [
        makeEvent({
          id: 'a-3',
          action: 'license.warning_sent',
          actor: { userId: null, name: null, role: 'system' },
          organizationName: null,
          organizationId: null,
        }),
      ],
    })
    renderIt()
    await waitFor(() =>
      expect(screen.getByText('Напоминание об удостоверении')).toBeInTheDocument(),
    )
    expect(screen.getByText('Система')).toBeInTheDocument()
  })

  it('renders empty state when list is empty', async () => {
    list.mockResolvedValueOnce({ events: [] })
    renderIt()
    await waitFor(() => expect(screen.getByText('Пока нет событий')).toBeInTheDocument())
  })

  it('renders loading skeleton while fetching', async () => {
    const resolveRef: { current: ((v: RecentAuditResponse) => void) | null } = { current: null }
    list.mockReturnValueOnce(
      new Promise<RecentAuditResponse>((r) => {
        resolveRef.current = r
      }),
    )
    const { container } = renderIt()
    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThan(0)
    resolveRef.current?.({ events: [makeEvent()] })
    await waitFor(() => expect(screen.getByText('Создал организацию')).toBeInTheDocument())
  })

  it('shows error state with retry button', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    list.mockResolvedValueOnce({ events: [makeEvent()] })
    renderIt()
    await waitFor(() => expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByText('Создал организацию')).toBeInTheDocument())
  })
})
