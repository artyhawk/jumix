'use client'

/**
 * Hidden bot trap (B3-SURVEY). Real users не видят / не tab'ятся / screen
 * readers пропускают. Bots auto-fill all named inputs → server marks the
 * response as honeypot_filled и silently drops в analytics.
 *
 * Field name 'website_url' — innocuous, привлекательное для form-fillers.
 */
export function HoneypotField({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <label htmlFor="website_url">Website URL (do not fill)</label>
      <input
        type="text"
        id="website_url"
        name="website_url"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
