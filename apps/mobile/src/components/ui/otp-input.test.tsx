import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from './otp-input'

/**
 * OTP input tests. react-native-web alias → boxes рендерятся как <input>
 * с numeric keyboard. Paste-detection в первой клетке + auto-advance
 * проверяется программно (onChangeText эмулирует input).
 */

describe('OtpInput', () => {
  it('рендерит 6 клеток', () => {
    const { getAllByLabelText } = render(<OtpInput value="" onChange={() => {}} />)
    const inputs = getAllByLabelText(/Цифра \d+/)
    expect(inputs).toHaveLength(6)
  })

  it('auto-advance: ввод цифры в первую клетку перемещает focus (onChange фиксирует digit)', () => {
    const onChange = vi.fn()
    const { getAllByLabelText } = render(<OtpInput value="" onChange={onChange} />)
    const first = getAllByLabelText(/Цифра/)[0] as HTMLInputElement
    fireEvent.change(first, { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith('1')
  })

  it('full paste в первую клетку → onChange получает полный код', () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    const { getAllByLabelText } = render(
      <OtpInput value="" onChange={onChange} onComplete={onComplete} />,
    )
    const first = getAllByLabelText(/Цифра/)[0] as HTMLInputElement
    fireEvent.change(first, { target: { value: '123456' } })
    expect(onChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('onComplete вызывается только когда 6 цифр', () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    const { getAllByLabelText, rerender } = render(
      <OtpInput value="12345" onChange={onChange} onComplete={onComplete} />,
    )
    const sixth = getAllByLabelText(/Цифра 6/)[0] as HTMLInputElement
    fireEvent.change(sixth, { target: { value: '6' } })
    expect(onComplete).toHaveBeenCalledWith('123456')

    // rerender с 5 цифрами — onComplete не должен триггерится от controlled re-render
    onComplete.mockClear()
    rerender(<OtpInput value="12345" onChange={onChange} onComplete={onComplete} />)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('editable=false → клетки read-only', () => {
    const { getAllByLabelText } = render(
      <OtpInput value="123" onChange={() => {}} editable={false} />,
    )
    const inputs = getAllByLabelText(/Цифра/) as HTMLInputElement[]
    for (const input of inputs) {
      expect(input.readOnly || input.hasAttribute('readonly') || input.disabled).toBe(true)
    }
  })

  it('non-digit input игнорируется (автостpip)', () => {
    const onChange = vi.fn()
    const { getAllByLabelText } = render(<OtpInput value="" onChange={onChange} />)
    const first = getAllByLabelText(/Цифра/)[0] as HTMLInputElement
    fireEvent.change(first, { target: { value: 'a' } })
    // 'a' → digits '' → onChange fires с пустой строкой
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
