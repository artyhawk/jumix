'use client'

import { cn } from '@/lib/utils'

export interface RadiusSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

/**
 * Slider для выбора радиуса геозоны. Native `<input type=range>` чтобы не
 * тянуть Radix Slider ради одной точки. Touch-friendly — native elements
 * работают на phone из коробки.
 */
export function RadiusSlider({
  value,
  onChange,
  min = 50,
  max = 1000,
  step = 50,
  className,
}: RadiusSliderProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-text-tertiary">Радиус геозоны</span>
        <span className="font-mono-numbers text-sm text-text-primary">{value} м</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Радиус геозоны в метрах"
        className="w-full accent-brand-500 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-text-tertiary font-mono-numbers">
        <span>{min} м</span>
        <span>{max} м</span>
      </div>
    </div>
  )
}
