import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { LicenseStatusBadge } from '@/components/ui/license-status-badge'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Building2, HardHat } from 'lucide-react'
import { describe, expect, it } from 'vitest'

expect.extend(toHaveNoViolations)

/**
 * Accessibility audit baseline (B3-UI-5a). Сканирует primitives + key
 * composition patterns axe-core'ом; violations → tests fail. Если axe
 * находит новую violation при добавлении UI — надо либо исправить, либо
 * добавить explicit rationale комментарием и исключить правило здесь.
 *
 * Page-level a11y тесты не добавлены — они требуют сложного mocking
 * (auth provider, query client, next/navigation). Primitives + shared
 * components покрывают 90% UI surface; violations в page composition —
 * backlog для отдельной инфраструктуры.
 */
describe('a11y — primitives', () => {
  it('Button — varying variants + sizes', async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button aria-label="Удалить">
          <HardHat className="size-4" aria-hidden />
        </Button>
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('Badge — all variants', async () => {
    const { container } = render(
      <div>
        <Badge variant="pending">Pending</Badge>
        <Badge variant="approved">Approved</Badge>
        <Badge variant="rejected">Rejected</Badge>
        <Badge variant="expired">Expired</Badge>
        <Badge variant="neutral">Neutral</Badge>
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('LicenseStatusBadge — compact + enriched', async () => {
    const { container } = render(
      <div>
        <LicenseStatusBadge status="valid" />
        <LicenseStatusBadge status="missing" />
        <LicenseStatusBadge status="expired" enriched expiresAt="2024-01-01" />
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('Input with associated label', async () => {
    const { container } = render(
      // biome-ignore lint/a11y/noLabelWithoutControl: associated via htmlFor + id
      <label htmlFor="t-phone" className="flex flex-col gap-1.5">
        <span>Телефон</span>
        <Input id="t-phone" placeholder="+7" />
      </label>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('EmptyState with icon and CTA', async () => {
    const { container } = render(
      <EmptyState
        icon={Building2}
        title="Нет организаций"
        description="Создайте первую"
        action={<Button variant="primary">Создать</Button>}
      />,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('Card with heading structure', async () => {
    const { container } = render(
      <Card>
        <h2>Заголовок</h2>
        <p>Параграф внутри карточки</p>
      </Card>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('Avatar has accessible name', async () => {
    const { container } = render(
      <div>
        <Avatar name="Иван Иванов" userId="u-1" />
        <Avatar src="https://placehold.co/40" name="Петров" userId="u-2" />
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
