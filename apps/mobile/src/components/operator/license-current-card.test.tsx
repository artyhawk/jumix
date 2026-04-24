import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LicenseCurrentCard } from './license-current-card'

describe('LicenseCurrentCard', () => {
  it('missing → EmptyState с primary CTA', () => {
    const onUpload = vi.fn()
    render(
      <LicenseCurrentCard
        licenseStatus="missing"
        licenseVersion={null}
        licenseExpiresAt={null}
        licenseUrl={null}
        onUploadPress={onUpload}
      />,
    )
    expect(screen.getByText('Удостоверение не загружено')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Загрузить удостоверение'))
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it('valid → показывает версию + expiry + «Обновить»', () => {
    render(
      <LicenseCurrentCard
        licenseStatus="valid"
        licenseVersion={3}
        licenseExpiresAt="2027-04-01"
        licenseUrl="https://cdn.example.com/license.jpg"
        onUploadPress={() => {}}
      />,
    )
    expect(screen.getByText('Версия: v3')).toBeInTheDocument()
    expect(screen.getByText('Обновить')).toBeInTheDocument()
    expect(screen.getByText('Действует')).toBeInTheDocument()
  })

  it('expired → badge + «Обновить» button', () => {
    render(
      <LicenseCurrentCard
        licenseStatus="expired"
        licenseVersion={1}
        licenseExpiresAt="2024-01-01"
        licenseUrl="https://cdn.example.com/license.pdf"
        onUploadPress={() => {}}
      />,
    )
    expect(screen.getByText('Просрочено')).toBeInTheDocument()
    expect(screen.getByText('Обновить')).toBeInTheDocument()
  })
})
