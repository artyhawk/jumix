import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilePicker } from './file-picker'

describe('FilePicker', () => {
  it('renders placeholder prompt when no value', () => {
    render(<FilePicker value={null} onChange={() => {}} helperText="PDF до 10 МБ" />)
    expect(screen.getByText('Перетащите файл или нажмите для выбора')).toBeInTheDocument()
    expect(screen.getByText('PDF до 10 МБ')).toBeInTheDocument()
  })

  it('renders file metadata when value present', () => {
    const file = new File(['x'.repeat(2048)], 'doc.pdf', { type: 'application/pdf' })
    render(<FilePicker value={file} onChange={() => {}} />)
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    // 2048 bytes → "2.0 КБ"
    expect(screen.getByText(/2\.0 КБ/)).toBeInTheDocument()
  })

  it('click on picker opens native file input', async () => {
    const onChange = vi.fn()
    render(<FilePicker value={null} onChange={onChange} ariaLabel="Файл удостоверения" />)
    const trigger = screen.getByLabelText('Файл удостоверения')
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click')
    await userEvent.click(trigger)
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('onChange fires when file input changes', async () => {
    const onChange = vi.fn()
    const { container } = render(<FilePicker value={null} onChange={onChange} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    await userEvent.upload(input, file)
    expect(onChange).toHaveBeenCalledWith(file)
  })

  it('remove button clears the value', async () => {
    const onChange = vi.fn()
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    render(<FilePicker value={file} onChange={onChange} />)
    const remove = screen.getByLabelText('Удалить файл')
    await userEvent.click(remove)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders error message inline when provided', () => {
    render(<FilePicker value={null} onChange={() => {}} error="Файл больше 10 МБ" />)
    expect(screen.getByText('Файл больше 10 МБ')).toBeInTheDocument()
  })
})
