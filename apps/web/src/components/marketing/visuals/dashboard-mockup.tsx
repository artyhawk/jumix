'use client'

import { useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'

/**
 * Synthesized dashboard mockup (NOT a real screenshot). SVG built из примитивов
 * design-system'a — browser frame, sidebar nav, 4 stat cards, animated chart, table preview,
 * map pin overlay. Mouse parallax (max 14px). Animations on entrance: chart bars rise +
 * pulsing live dot.
 */
export function DashboardMockup({ className }: { className?: string }) {
  const t = useT()
  const reduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 80, damping: 14 })
  const sy = useSpring(my, { stiffness: 80, damping: 14 })

  const tx = useTransform(sx, (v) => `${v * 14}px`)
  const ty = useTransform(sy, (v) => `${v * 14}px`)
  const txInverse = useTransform(sx, (v) => `${-v * 8}px`)
  const tyInverse = useTransform(sy, (v) => `${-v * 8}px`)

  useEffect(() => {
    if (reduceMotion) return
    const node = containerRef.current
    if (!node) return
    const onMove = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      mx.set(x)
      my.set(y)
    }
    const onLeave = () => {
      mx.set(0)
      my.set(0)
    }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [mx, my, reduceMotion])

  return (
    <div
      ref={containerRef}
      className={cn('relative isolate', className)}
      style={{ perspective: 1400 }}
      role="img"
      aria-label={t('marketing.mockup.ariaLabel')}
    >
      {/* Glow halo behind */}
      <div
        className="absolute -inset-8 -z-10 rounded-[40px] opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(249,123,16,0.22) 0%, transparent 65%)',
        }}
        aria-hidden
      />

      <motion.div
        style={{ x: tx, y: ty }}
        className="relative rounded-[20px] overflow-hidden border border-[var(--m-border-strong)] bg-[var(--m-surface)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--m-border)] bg-[var(--m-surface-elevated)]">
          <span className="size-3 rounded-full bg-[var(--m-border-strong)]" />
          <span className="size-3 rounded-full bg-[var(--m-border-strong)]" />
          <span className="size-3 rounded-full bg-[var(--m-border-strong)]" />
          <div className="flex-1 mx-4 h-6 rounded-md bg-[var(--m-bg)] flex items-center justify-center">
            <span className="text-[10px] text-[var(--m-fg-tertiary)] tracking-wide">
              app.jumix.kz/dashboard
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] min-h-[420px]">
          {/* Sidebar */}
          <aside className="border-r border-[var(--m-border)] bg-[var(--m-surface-elevated)] p-3 sm:p-4 space-y-1">
            <div className="flex items-center gap-2 mb-5">
              <div className="size-6 rounded-md bg-[var(--m-brand)]" />
              <span className="text-[12px] font-semibold text-[var(--m-fg)]">Jumix</span>
            </div>
            {[
              { key: 'dashboard', label: t('marketing.mockup.nav.dashboard'), active: true },
              { key: 'sites', label: t('marketing.mockup.nav.sites') },
              { key: 'cranes', label: t('marketing.mockup.nav.cranes') },
              { key: 'operators', label: t('marketing.mockup.nav.operators') },
              { key: 'approvals', label: t('marketing.mockup.nav.approvals') },
              { key: 'incidents', label: t('marketing.mockup.nav.incidents') },
            ].map((item) => (
              <div
                key={item.key}
                className={cn(
                  'relative flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px]',
                  item.active
                    ? 'bg-[color:var(--m-brand-glow)] text-[var(--m-fg)]'
                    : 'text-[var(--m-fg-secondary)]',
                )}
              >
                {item.active ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--m-brand)] rounded-r" />
                ) : null}
                <span className="size-3 rounded-sm bg-[var(--m-border-strong)]" />
                {item.label}
              </div>
            ))}
          </aside>

          {/* Main content */}
          <motion.div
            style={{ x: txInverse, y: tyInverse }}
            className="p-3 sm:p-5 space-y-4 min-w-0"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[var(--m-fg)]">
                {t('marketing.mockup.overview')}
              </h4>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--m-success)] m-pulse-dot" />
                <span className="text-[10px] text-[var(--m-fg-tertiary)] uppercase tracking-wider">
                  {t('marketing.mockup.live')}
                </span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
              {[
                { key: 'sites', value: '12', label: t('marketing.mockup.stats.sites') },
                { key: 'cranes', value: '8', label: t('marketing.mockup.stats.cranes') },
                { key: 'operators', value: '24', label: t('marketing.mockup.stats.operators') },
                {
                  key: 'approvals',
                  value: '3',
                  label: t('marketing.mockup.stats.approvals'),
                  accent: true,
                },
              ].map((stat) => (
                <div
                  key={stat.key}
                  className="rounded-lg border border-[var(--m-border)] bg-[var(--m-bg)] p-2.5"
                >
                  <div
                    className={cn(
                      'text-[18px] font-semibold leading-none',
                      stat.accent ? 'text-[var(--m-brand)]' : 'text-[var(--m-fg)]',
                    )}
                  >
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[9px] text-[var(--m-fg-tertiary)] uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-lg border border-[var(--m-border)] bg-[var(--m-bg)] p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-[var(--m-fg-secondary)]">
                  {t('marketing.mockup.chart.title')}
                </span>
                <span className="text-[10px] text-[var(--m-fg-tertiary)]">+18%</span>
              </div>
              <ChartBars />
            </div>

            {/* Mini table */}
            <div className="rounded-lg border border-[var(--m-border)] bg-[var(--m-bg)]">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-b border-[var(--m-border)] text-[9px] uppercase tracking-wider text-[var(--m-fg-tertiary)]">
                <span>{t('marketing.mockup.table.site')}</span>
                <span>{t('marketing.mockup.table.crane')}</span>
                <span>{t('marketing.mockup.table.status')}</span>
              </div>
              {[
                {
                  site: t('marketing.mockup.table.rows.almatyPark'),
                  crane: 'MCT-88',
                  status: 'active' as const,
                },
                {
                  site: t('marketing.mockup.table.rows.esentaiTower'),
                  crane: 'POT-160',
                  status: 'active' as const,
                },
                {
                  site: t('marketing.mockup.table.rows.nurlyZhol'),
                  crane: 'LM-520',
                  status: 'paused' as const,
                },
              ].map((row) => (
                <div
                  key={row.crane}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-b border-[var(--m-border)]/60 last:border-0 items-center text-[10px]"
                >
                  <span className="text-[var(--m-fg)] font-medium truncate">{row.site}</span>
                  <span className="text-[var(--m-fg-secondary)] font-mono">{row.crane}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]',
                      row.status === 'active'
                        ? 'bg-[color:var(--m-success)]/15 text-[var(--m-success)]'
                        : 'bg-[var(--m-border-strong)] text-[var(--m-fg-secondary)]',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1 rounded-full',
                        row.status === 'active'
                          ? 'bg-[var(--m-success)]'
                          : 'bg-[var(--m-fg-tertiary)]',
                      )}
                    />
                    {row.status === 'active'
                      ? t('marketing.mockup.table.active')
                      : t('marketing.mockup.table.paused')}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Floating "live shift" card overlay (right edge) */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12, x: 12 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, x: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.6, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute -right-3 md:-right-6 top-[58%] hidden sm:block w-[200px] rounded-xl border border-[var(--m-border-strong)] bg-[var(--m-surface-elevated)] p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--m-success)] m-pulse-dot" />
          <span className="text-[10px] uppercase tracking-wider text-[var(--m-fg-tertiary)]">
            {t('marketing.mockup.shiftCard.label')}
          </span>
        </div>
        <div className="mt-2 text-[20px] font-semibold tabular-nums text-[var(--m-fg)] leading-none">
          06:42:11
        </div>
        <div className="mt-1 text-[10px] text-[var(--m-fg-secondary)]">
          {t('marketing.mockup.shiftCard.operator')}
        </div>
        <div className="mt-2 text-[10px] text-[var(--m-success)]">
          {t('marketing.mockup.shiftCard.geofence')}
        </div>
      </motion.div>
    </div>
  )
}

function ChartBars() {
  const reduceMotion = useReducedMotion()
  const bars = [
    { id: 'd1', h: 38 },
    { id: 'd2', h: 52 },
    { id: 'd3', h: 28 },
    { id: 'd4', h: 64 },
    { id: 'd5', h: 48 },
    { id: 'd6', h: 72 },
    { id: 'd7', h: 90 },
  ]
  return (
    <div className="flex items-end gap-1.5 h-[80px]">
      {bars.map((bar, i) => {
        const isLast = i === bars.length - 1
        return (
          <motion.div
            key={bar.id}
            initial={reduceMotion ? false : { scaleY: 0 }}
            whileInView={reduceMotion ? undefined : { scaleY: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              delay: 0.15 + i * 0.06,
              duration: 0.7,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ height: `${bar.h}%`, transformOrigin: 'bottom' }}
            className={cn(
              'flex-1 rounded-t-[3px]',
              isLast
                ? 'bg-[var(--m-brand)]'
                : 'bg-gradient-to-t from-[var(--m-border)] to-[var(--m-border-strong)]',
            )}
          />
        )
      })}
    </div>
  )
}
