import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SeverityButton } from './severity-button'

describe('SeverityButton', () => {
  it('renders label for each severity', () => {
    const r1 = render(<SeverityButton severity="info" selected={false} onPress={() => {}} />)
    expect(r1.getByText('Информационно')).toBeTruthy()
    r1.unmount()
    const r2 = render(<SeverityButton severity="warning" selected={false} onPress={() => {}} />)
    expect(r2.getByText('Внимание')).toBeTruthy()
    r2.unmount()
    const r3 = render(<SeverityButton severity="critical" selected={false} onPress={() => {}} />)
    expect(r3.getByText('Критично')).toBeTruthy()
  })

  it('triggers onPress on click', () => {
    const onPress = vi.fn()
    const { getByText } = render(
      <SeverityButton severity="warning" selected={false} onPress={onPress} />,
    )
    fireEvent.click(getByText('Внимание'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders accessible label for selected critical', () => {
    const { getByLabelText } = render(
      <SeverityButton severity="critical" selected={true} onPress={() => {}} />,
    )
    expect(getByLabelText('Критично')).toBeTruthy()
  })
})
