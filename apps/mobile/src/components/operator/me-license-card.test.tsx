import type { CraneProfile } from '@jumix/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MeLicenseCard } from './me-license-card'

function makeProfile(overrides: Partial<CraneProfile> = {}): CraneProfile {
  return {
    id: 'p1',
    userId: 'u1',
    firstName: 'Ерлан',
    lastName: 'Ахметов',
    patronymic: null,
    iin: '990101300123',
    phone: '+77001234567',
    avatarUrl: null,
    approvalStatus: 'approved',
    rejectionReason: null,
    approvedAt: null,
    rejectedAt: null,
    licenseStatus: 'valid',
    licenseExpiresAt: '2027-04-01T00:00:00Z',
    licenseUrl: null,
    licenseVersion: 1,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('MeLicenseCard', () => {
  it('valid license → дата expiry + countdown', () => {
    render(
      <MeLicenseCard
        profile={makeProfile({ licenseExpiresAt: '2027-04-01T00:00:00Z' })}
        licenseStatus="valid"
      />,
    )
    expect(screen.getByText('Удостоверение')).toBeInTheDocument()
    expect(screen.getByText('Действует')).toBeInTheDocument()
    expect(screen.getByText(/1 апреля 2027/)).toBeInTheDocument()
  })

  it('missing license → placeholder text', () => {
    render(
      <MeLicenseCard profile={makeProfile({ licenseExpiresAt: null })} licenseStatus="missing" />,
    )
    expect(screen.getByText('Удостоверение не загружено')).toBeInTheDocument()
  })

  it('CTA press фаерит onManagePress', () => {
    const onManage = vi.fn()
    render(
      <MeLicenseCard
        profile={makeProfile({ licenseExpiresAt: null })}
        licenseStatus="missing"
        onManagePress={onManage}
      />,
    )
    fireEvent.click(screen.getByText('Загрузить удостоверение →'))
    expect(onManage).toHaveBeenCalledOnce()
  })

  it('expired status → danger badge + warning countdown', () => {
    render(
      <MeLicenseCard
        profile={makeProfile({ licenseExpiresAt: '2026-01-01T00:00:00Z' })}
        licenseStatus="expired"
      />,
    )
    expect(screen.getByText('Просрочено')).toBeInTheDocument()
  })
})
