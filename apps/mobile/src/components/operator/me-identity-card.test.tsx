import type { CraneProfile } from '@jumix/shared'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MeIdentityCard } from './me-identity-card'

function makeProfile(overrides: Partial<CraneProfile> = {}): CraneProfile {
  return {
    id: 'p1',
    userId: 'u1',
    firstName: 'Ерлан',
    lastName: 'Ахметов',
    patronymic: 'Нурланович',
    iin: '990101300123',
    phone: '+77001234567',
    avatarUrl: null,
    approvalStatus: 'approved',
    rejectionReason: null,
    approvedAt: '2026-04-01T00:00:00Z',
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

describe('MeIdentityCard', () => {
  it('рендерит full name + formatted ИИН + formatted phone + approval badge', () => {
    render(<MeIdentityCard profile={makeProfile()} />)
    expect(screen.getByText('Ахметов Ерлан Нурланович')).toBeInTheDocument()
    expect(screen.getByText('990101 300123')).toBeInTheDocument()
    expect(screen.getByText('+7 700 123 45 67')).toBeInTheDocument()
    expect(screen.getByText('Профиль одобрен')).toBeInTheDocument()
  })

  it('показывает rejection reason когда approvalStatus=rejected', () => {
    render(
      <MeIdentityCard
        profile={makeProfile({
          approvalStatus: 'rejected',
          rejectionReason: 'ИИН не совпадает с именем в паспорте',
        })}
      />,
    )
    expect(screen.getByText('Причина отклонения')).toBeInTheDocument()
    expect(screen.getByText('ИИН не совпадает с именем в паспорте')).toBeInTheDocument()
    expect(screen.getByText('Профиль отклонён')).toBeInTheDocument()
  })

  it('без patronymic — корректный order', () => {
    render(<MeIdentityCard profile={makeProfile({ patronymic: null })} />)
    expect(screen.getByText('Ахметов Ерлан')).toBeInTheDocument()
  })
})
