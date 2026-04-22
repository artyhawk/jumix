import type { Organization } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
}))

import * as orgsApi from '@/lib/api/organizations'
import { OrganizationsOverview } from './organizations-overview'

const list = vi.mocked(orgsApi.listOrganizations)

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'o-1',
    name: 'ТОО «Альфа»',
    bin: '123456789013',
    status: 'active',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  list.mockReset()
})

describe('OrganizationsOverview', () => {
  it('renders organizations with status badge', async () => {
    list.mockResolvedValueOnce({ items: [makeOrg()], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationsOverview />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(screen.getByText('ТОО «Альфа»')).toBeInTheDocument()
    })
    expect(screen.getByText('123456789013')).toBeInTheDocument()
    expect(screen.getByText('Активна')).toBeInTheDocument()
  })

  it('shows empty state when list is empty', async () => {
    list.mockResolvedValueOnce({ items: [], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationsOverview />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(screen.getByText('Организаций пока нет')).toBeInTheDocument()
    })
  })

  it('link to full list points to /organizations', async () => {
    list.mockResolvedValueOnce({ items: [makeOrg()], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationsOverview />, { wrapper: Wrapper })
    const link = await screen.findByRole('link', { name: /Все/ })
    expect(link).toHaveAttribute('href', '/organizations')
  })

  it('row link opens detail drawer via ?open query', async () => {
    list.mockResolvedValueOnce({ items: [makeOrg()], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    render(<OrganizationsOverview />, { wrapper: Wrapper })
    const rowLink = await screen.findByRole('link', { name: /ТОО «Альфа»/ })
    expect(rowLink).toHaveAttribute('href', '/organizations?open=o-1')
  })
})
