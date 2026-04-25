import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IncidentRow } from './incident-row'

import type { IncidentWithRelations } from '@jumix/shared'

function makeIncident(overrides: Partial<IncidentWithRelations> = {}): IncidentWithRelations {
  return {
    id: 'inc-1',
    reporter: { id: 'u-1', name: 'Op', phone: '+77000000000' },
    organizationId: 'org-1',
    shiftId: null,
    siteId: null,
    craneId: null,
    type: 'crane_malfunction',
    severity: 'warning',
    status: 'submitted',
    description: 'Шум при подъёме стрелы',
    reportedAt: '2026-04-25T10:00:00Z',
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionNotes: null,
    latitude: null,
    longitude: null,
    photos: [],
    shift: null,
    site: null,
    crane: null,
    createdAt: '2026-04-25T10:00:00Z',
    updatedAt: '2026-04-25T10:00:00Z',
    ...overrides,
  }
}

describe('IncidentRow', () => {
  it('renders type label + description', () => {
    const { getByText } = render(<IncidentRow incident={makeIncident()} onPress={() => {}} />)
    expect(getByText('Неисправность крана')).toBeTruthy()
    expect(getByText(/Шум при подъёме/)).toBeTruthy()
  })

  it('renders status badge', () => {
    const { getByText } = render(
      <IncidentRow incident={makeIncident({ status: 'acknowledged' })} onPress={() => {}} />,
    )
    expect(getByText('Принято в работу')).toBeTruthy()
  })

  it('renders severity badge', () => {
    const { getByText } = render(
      <IncidentRow incident={makeIncident({ severity: 'critical' })} onPress={() => {}} />,
    )
    expect(getByText('Критично')).toBeTruthy()
  })

  it('triggers onPress when clicked', () => {
    const onPress = vi.fn()
    const { getByText } = render(<IncidentRow incident={makeIncident()} onPress={onPress} />)
    fireEvent.click(getByText('Неисправность крана'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders all 4 status labels', () => {
    const submitted = render(
      <IncidentRow incident={makeIncident({ status: 'submitted' })} onPress={() => {}} />,
    )
    expect(submitted.getByText('Подано')).toBeTruthy()
    submitted.unmount()
    const ack = render(
      <IncidentRow incident={makeIncident({ status: 'acknowledged' })} onPress={() => {}} />,
    )
    expect(ack.getByText('Принято в работу')).toBeTruthy()
    ack.unmount()
    const res = render(
      <IncidentRow incident={makeIncident({ status: 'resolved' })} onPress={() => {}} />,
    )
    expect(res.getByText('Решено')).toBeTruthy()
    res.unmount()
    const esc = render(
      <IncidentRow incident={makeIncident({ status: 'escalated' })} onPress={() => {}} />,
    )
    expect(esc.getByText('Эскалировано')).toBeTruthy()
  })
})
