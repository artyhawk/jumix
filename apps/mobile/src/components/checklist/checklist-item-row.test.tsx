import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChecklistItemRow } from './checklist-item-row'

describe('ChecklistItemRow', () => {
  it('renders label for given key', () => {
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="helmet"
        checked={false}
        hasPhoto={false}
        hasNotes={false}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(getByText('Каска')).toBeTruthy()
  })

  it('renders harness label when key=harness', () => {
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="harness"
        checked={true}
        hasPhoto={false}
        hasNotes={false}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(getByText('Страховочный пояс')).toBeTruthy()
  })

  it('shows checkmark when checked=true', () => {
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="helmet"
        checked={true}
        hasPhoto={false}
        hasNotes={false}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(getByText('✓')).toBeTruthy()
  })

  it('shows photo indicator when hasPhoto=true', () => {
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="vest"
        checked={true}
        hasPhoto={true}
        hasNotes={false}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(getByText('📷')).toBeTruthy()
  })

  it('shows notes indicator when hasNotes=true', () => {
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="gloves"
        checked={true}
        hasPhoto={false}
        hasNotes={true}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(getByText('📝')).toBeTruthy()
  })

  it('hides indicators when no photo and no notes', () => {
    const { queryByText } = render(
      <ChecklistItemRow
        itemKey="first_aid_kit"
        checked={false}
        hasPhoto={false}
        hasNotes={false}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(queryByText('📷')).toBeNull()
    expect(queryByText('📝')).toBeNull()
  })

  it('triggers onToggle on click', () => {
    const onToggle = vi.fn()
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="boots"
        checked={false}
        hasPhoto={false}
        hasNotes={false}
        onToggle={onToggle}
        onLongPress={() => {}}
      />,
    )
    // react-native-web рендерит Pressable как кликабельный element — кликаем по label.
    fireEvent.click(getByText('Защитная обувь'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('renders without checkmark when unchecked', () => {
    const { queryByText } = render(
      <ChecklistItemRow
        itemKey="helmet"
        checked={false}
        hasPhoto={false}
        hasNotes={false}
        onToggle={() => {}}
        onLongPress={() => {}}
      />,
    )
    expect(queryByText('✓')).toBeNull()
  })

  it('renders без onLongPress prop (M6-b minimal — long-press flow в backlog)', () => {
    const { getByText } = render(
      <ChecklistItemRow
        itemKey="helmet"
        checked={false}
        hasPhoto={false}
        hasNotes={false}
        onToggle={() => {}}
      />,
    )
    expect(getByText('Каска')).toBeTruthy()
  })
})
