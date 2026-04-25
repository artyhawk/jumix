import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IncidentTypeCard } from './type-card'

describe('IncidentTypeCard', () => {
  it('renders label for each type', () => {
    const { getByText, unmount } = render(
      <IncidentTypeCard type="crane_malfunction" selected={false} onPress={() => {}} />,
    )
    expect(getByText('Неисправность крана')).toBeTruthy()
    unmount()
    const r2 = render(<IncidentTypeCard type="material_fall" selected={false} onPress={() => {}} />)
    expect(r2.getByText('Падение груза')).toBeTruthy()
  })

  it('triggers onPress on click', () => {
    const onPress = vi.fn()
    const { getByText } = render(
      <IncidentTypeCard type="other" selected={false} onPress={onPress} />,
    )
    fireEvent.click(getByText('Другое'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
