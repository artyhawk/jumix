import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { formatActionLabel, getActionIcon } from './audit'

describe('getActionIcon', () => {
  it('returns success accent for approve-actions', () => {
    expect(getActionIcon('crane_profile.approve').accent).toBe('success')
    expect(getActionIcon('crane_profile.approve').icon).toBe(CheckCircle2)
    expect(getActionIcon('crane.approve').accent).toBe('success')
    expect(getActionIcon('organization_operator.approve').accent).toBe('success')
  })

  it('returns danger accent for reject-actions', () => {
    expect(getActionIcon('crane_profile.reject').accent).toBe('danger')
    expect(getActionIcon('crane_profile.reject').icon).toBe(XCircle)
  })

  it('returns warning accent for license.warning_sent', () => {
    expect(getActionIcon('license.warning_sent').accent).toBe('warning')
    expect(getActionIcon('license.warning_sent').icon).toBe(AlertTriangle)
  })

  it('returns default (Clock, neutral) for unknown action', () => {
    const result = getActionIcon('unknown.mystery_action')
    expect(result.accent).toBe('neutral')
    expect(result.icon).toBe(Clock)
  })

  it('site.complete renders как success (CheckCircle2)', () => {
    expect(getActionIcon('site.complete').accent).toBe('success')
    expect(getActionIcon('site.complete').icon).toBe(CheckCircle2)
  })
})

describe('formatActionLabel', () => {
  it('returns Russian label for known actions', () => {
    expect(formatActionLabel({ action: 'crane_profile.approve' })).toBe('Одобрил кранового')
    expect(formatActionLabel({ action: 'organization.create' })).toBe('Создал организацию')
    expect(formatActionLabel({ action: 'license.warning_sent' })).toBe(
      'Напоминание об удостоверении',
    )
  })

  it('returns raw action string for unknown action', () => {
    expect(formatActionLabel({ action: 'some.new_unmapped_action' })).toBe(
      'some.new_unmapped_action',
    )
  })

  it('site action labels', () => {
    expect(formatActionLabel({ action: 'site.create' })).toBe('Создал объект')
    expect(formatActionLabel({ action: 'site.complete' })).toBe('Сдал объект')
    expect(formatActionLabel({ action: 'site.archive' })).toBe('Архивировал объект')
    expect(formatActionLabel({ action: 'site.activate' })).toBe('Вернул объект в работу')
  })
})
