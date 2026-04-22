'use client'

import { PageTransition } from '@/components/motion/page-transition'
import { StaggerItem, StaggerList } from '@/components/motion/stagger-list'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { t } from '@/lib/i18n'
import { ArrowUpRight, Building2, HardHat, ShieldCheck } from 'lucide-react'

/**
 * Welcome placeholder. B3-UI-1 shipment — shell работает, но функциональных
 * кабинетов ещё нет. Роль-специфичные dashboard'ы появятся в B3-UI-2/3/4.
 */
export default function WelcomePage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <PageTransition>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl md:text-[32px] md:leading-[40px] font-semibold tracking-tight text-text-primary">
            {t('auth.welcome.title', { name: user.name || 'Пользователь' })}
          </h1>
          <Badge variant="approved" withDot>
            {t(`roles.${user.role}`)}
          </Badge>
        </div>
        <p className="text-text-secondary max-w-xl">
          {t('auth.welcome.subtitle', { role: t(`roles.${user.role}`).toLowerCase() })}
        </p>
      </div>

      <StaggerList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StaggerItem>
          <StatusCard
            icon={<ShieldCheck className="size-5 text-brand-500" strokeWidth={1.5} />}
            title="Авторизация"
            value="Работает"
            description="SMS + пароль + refresh rotation."
          />
        </StaggerItem>
        <StaggerItem>
          <StatusCard
            icon={<HardHat className="size-5 text-brand-500" strokeWidth={1.5} />}
            title="API"
            value="614 тестов"
            description="9 миграций · 5 ADR · backend MVP."
          />
        </StaggerItem>
        <StaggerItem>
          <StatusCard
            icon={<Building2 className="size-5 text-brand-500" strokeWidth={1.5} />}
            title="Веб-портал"
            value="Foundation"
            description="Design system, auth flow, mobile-first shell."
          />
        </StaggerItem>
      </StaggerList>

      <Card
        variant="elevated"
        className="flex flex-col md:flex-row items-start md:items-center gap-4"
      >
        <div className="flex-1">
          <div className="text-sm font-semibold text-text-primary mb-1">Следующая веха</div>
          <p className="text-sm text-text-secondary">
            Функциональные кабинеты (superadmin · owner · operator) реализуются в B3-UI-2/3/4.
            Текущий релиз — scaffold + auth flow.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
          Roadmap скоро
          <ArrowUpRight className="size-4" aria-hidden />
        </span>
      </Card>
    </PageTransition>
  )
}

function StatusCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode
  title: string
  value: string
  description: string
}) {
  return (
    <Card variant="default" className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-9 rounded-md bg-layer-3 border border-border-subtle">
            {icon}
          </span>
          <CardTitle className="text-sm font-medium text-text-secondary">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-text-primary mb-1">{value}</div>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  )
}
