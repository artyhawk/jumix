import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from './progress-bar'

describe('ProgressBar', () => {
  it('рендерит label + percent', () => {
    render(<ProgressBar value={0.45} label="Загрузка..." />)
    expect(screen.getByText('Загрузка...')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
  })

  it('clamp 0..1: input > 1 → 100%', () => {
    render(<ProgressBar value={1.5} label="x" />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('clamp < 0 → 0%', () => {
    render(<ProgressBar value={-0.5} label="x" />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('showPercent=false скрывает counter', () => {
    render(<ProgressBar value={0.5} label="x" showPercent={false} />)
    expect(screen.queryByText('50%')).not.toBeInTheDocument()
  })
})
