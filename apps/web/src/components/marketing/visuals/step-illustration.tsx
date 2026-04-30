/**
 * Three abstract SVG illustrations for the "How it works" section.
 * Variant 1: registration (devices + connect arc)
 * Variant 2: site-assignment (map circle + crane)
 * Variant 3: digital-tracking (clock + checkmarks)
 *
 * B3-THEME-3: SVG-цвета через CSS classes + inline `<style>` блок, классы
 * читают `--m-mockup-*` (theme-aware) из marketing.css. На смену темы
 * рисунок перекрашивается без re-render компонента.
 */

type Variant = 1 | 2 | 3

const STYLES = /* css */ `
  .m-svg-card { fill: var(--m-mockup-elevated); stroke: var(--m-mockup-border); }
  .m-svg-screen { fill: var(--m-mockup-surface); }
  .m-svg-line-strong { fill: var(--m-mockup-text-tertiary); }
  .m-svg-line-subtle { fill: var(--m-mockup-border); }
  .m-svg-text-bg { fill: var(--m-mockup-border); }
  .m-svg-marker-muted { fill: var(--m-mockup-text-tertiary); }
  .m-svg-text-primary { fill: var(--m-mockup-text); }
  .m-svg-text-muted { fill: var(--m-mockup-text-muted); }
  .m-svg-road { stroke: var(--m-mockup-border); }
  .m-svg-progress-rail { fill: var(--m-mockup-border); }
  .m-svg-brand-fill { fill: #f97b10; }
  .m-svg-brand-stroke { stroke: #f97b10; }
`

export function StepIllustration({
  variant,
  className,
}: {
  variant: Variant
  className?: string
}) {
  return (
    <div
      className={className}
      role="img"
      aria-label={
        variant === 1
          ? 'Иллюстрация шага регистрации'
          : variant === 2
            ? 'Иллюстрация назначения объектов с геозоной'
            : 'Иллюстрация цифрового учёта смен'
      }
    >
      {variant === 1 ? <Registration /> : null}
      {variant === 2 ? <SiteAssignment /> : null}
      {variant === 3 ? <DigitalTracking /> : null}
    </div>
  )
}

function Registration() {
  return (
    <svg
      viewBox="0 0 220 140"
      className="w-full h-auto"
      role="img"
      aria-label="Ноутбук и телефон, соединённые пунктирной линией"
    >
      <title>Регистрация компании и крановых</title>
      <defs>
        <style>{STYLES}</style>
        <linearGradient id="reg-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(249,123,16,0.18)" />
          <stop offset="100%" stopColor="rgba(249,123,16,0.02)" />
        </linearGradient>
      </defs>
      {/* Laptop */}
      <rect className="m-svg-card" x="20" y="42" width="100" height="62" rx="6" />
      <rect className="m-svg-screen" x="26" y="48" width="88" height="48" rx="2" />
      <rect className="m-svg-line-strong" x="32" y="54" width="36" height="3" rx="1.5" />
      <rect className="m-svg-line-subtle" x="32" y="62" width="60" height="2" rx="1" />
      <rect className="m-svg-line-subtle" x="32" y="68" width="52" height="2" rx="1" />
      <rect className="m-svg-brand-fill" x="32" y="80" width="24" height="10" rx="3" />
      <rect className="m-svg-line-subtle" x="14" y="104" width="112" height="4" rx="2" />

      {/* Phone */}
      <rect className="m-svg-card" x="146" y="32" width="48" height="86" rx="9" />
      <rect className="m-svg-screen" x="151" y="40" width="38" height="68" rx="4" />
      <circle className="m-svg-line-strong" cx="170" cy="46" r="1" />
      <rect className="m-svg-line-strong" x="155" y="52" width="28" height="3" rx="1.5" />
      <rect className="m-svg-line-subtle" x="155" y="60" width="22" height="2" rx="1" />
      <rect className="m-svg-line-subtle" x="155" y="66" width="26" height="2" rx="1" />
      <rect className="m-svg-brand-fill" x="155" y="92" width="28" height="8" rx="3" />

      {/* Connect arc */}
      <path
        d="M 122 60 Q 134 30, 148 50"
        stroke="url(#reg-grad)"
        strokeWidth="2"
        fill="none"
        strokeDasharray="3 3"
      />
      <circle className="m-svg-brand-fill" cx="148" cy="50" r="2.5" />
      <circle className="m-svg-brand-fill" cx="122" cy="60" r="2.5" />
    </svg>
  )
}

function SiteAssignment() {
  return (
    <svg
      viewBox="0 0 220 140"
      className="w-full h-auto"
      role="img"
      aria-label="Карта с обозначением геозоны объекта"
    >
      <title>Назначение объектов с геозоной</title>
      <defs>
        <style>{STYLES}</style>
        <radialGradient id="geo-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(249,123,16,0.32)" />
          <stop offset="60%" stopColor="rgba(249,123,16,0.08)" />
          <stop offset="100%" stopColor="rgba(249,123,16,0)" />
        </radialGradient>
      </defs>
      {/* Map base */}
      <rect className="m-svg-card" x="14" y="14" width="192" height="112" rx="10" />
      {/* Roads */}
      <path
        className="m-svg-road"
        d="M 14 60 Q 80 50, 130 70 T 206 80"
        strokeWidth="6"
        fill="none"
      />
      <path
        className="m-svg-road"
        d="M 60 14 Q 70 60, 110 90 T 140 126"
        strokeWidth="4"
        fill="none"
      />
      <path className="m-svg-road" d="M 14 110 L 206 100" strokeWidth="3" fill="none" />

      {/* Geofence */}
      <circle cx="110" cy="76" r="36" fill="url(#geo-grad)" />
      <circle
        className="m-svg-brand-stroke"
        cx="110"
        cy="76"
        r="36"
        fill="none"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />

      {/* Crane pin */}
      <g transform="translate(102 60)">
        <path className="m-svg-brand-stroke" d="M 8 0 L 8 26" strokeWidth="2" />
        <rect className="m-svg-brand-fill" x="0" y="0" width="22" height="3" />
        <rect className="m-svg-brand-fill" x="6" y="-2" width="4" height="4" />
        <circle className="m-svg-brand-fill" cx="8" cy="28" r="3" />
      </g>

      {/* Other markers */}
      <circle className="m-svg-marker-muted" cx="46" cy="40" r="3" />
      <circle className="m-svg-marker-muted" cx="178" cy="36" r="3" />
      <circle className="m-svg-marker-muted" cx="60" cy="108" r="3" />
      <circle className="m-svg-marker-muted" cx="172" cy="104" r="3" />
    </svg>
  )
}

function DigitalTracking() {
  return (
    <svg
      viewBox="0 0 220 140"
      className="w-full h-auto"
      role="img"
      aria-label="Карточка с таймером и чек-лист с отметками"
    >
      <title>Цифровой учёт смен</title>
      <defs>
        <style>{STYLES}</style>
      </defs>
      {/* Clock card */}
      <rect className="m-svg-card" x="18" y="20" width="92" height="100" rx="10" />
      <text
        className="m-svg-text-muted"
        x="64"
        y="58"
        fontSize="11"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
      >
        ВРЕМЯ
      </text>
      <text
        className="m-svg-text-primary"
        x="64"
        y="82"
        fontSize="22"
        fontWeight="700"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo"
      >
        06:42
      </text>
      <rect className="m-svg-progress-rail" x="30" y="98" width="68" height="3" rx="1.5" />
      <rect className="m-svg-brand-fill" x="30" y="98" width="44" height="3" rx="1.5" />

      {/* Checklist */}
      <rect className="m-svg-card" x="124" y="20" width="78" height="100" rx="10" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(132 ${30 + i * 22})`}>
          <rect width="14" height="14" rx="3" fill="rgba(34,197,94,0.18)" />
          <path
            d="M 3 7.5 L 6 10.5 L 11 4.5"
            stroke="#22c55e"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect className="m-svg-line-strong" x="20" y="3" width="46" height="3" rx="1.5" />
          <rect className="m-svg-line-subtle" x="20" y="9" width="32" height="2" rx="1" />
        </g>
      ))}
    </svg>
  )
}
