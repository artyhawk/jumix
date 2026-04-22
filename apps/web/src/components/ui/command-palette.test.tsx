import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './command-palette'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}))

const logout = vi.fn().mockResolvedValue(undefined)
const authState = {
  user: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' } as {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  } | null,
  hydrated: true,
  isAuthenticated: true,
  logout,
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}))

function openPalette() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
}

beforeEach(() => {
  push.mockReset()
  logout.mockReset()
  logout.mockResolvedValue(undefined)
  authState.user = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' }
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CommandPalette', () => {
  it('renders nothing until Cmd+K is pressed', () => {
    render(<CommandPalette />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cmd+K opens, Escape closes', async () => {
    vi.useRealTimers()
    render(<CommandPalette />)
    openPalette()
    expect(screen.getByRole('dialog', { name: 'Командная палитра' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows group headers for superadmin', () => {
    render(<CommandPalette />)
    openPalette()
    expect(screen.getByText('Переход')).toBeInTheDocument()
    expect(screen.getByText('Действия')).toBeInTheDocument()
    expect(screen.getByText('Система')).toBeInTheDocument()
  })

  it('renders superadmin nav items', () => {
    render(<CommandPalette />)
    openPalette()
    expect(screen.getByText('Обзор платформы')).toBeInTheDocument()
    expect(screen.getByText('Заявки на рассмотрение')).toBeInTheDocument()
    expect(screen.getByText('Организации')).toBeInTheDocument()
    expect(screen.getByText('Крановщики')).toBeInTheDocument()
    expect(screen.getByText('Краны')).toBeInTheDocument()
    expect(screen.getByText('Сотрудники')).toBeInTheDocument()
  })

  it('role-aware: owner sees only system commands (logout)', () => {
    authState.user = { id: 'u-2', role: 'owner', organizationId: 'o-1', name: 'Owner' }
    render(<CommandPalette />)
    openPalette()
    expect(screen.queryByText('Обзор платформы')).toBeNull()
    expect(screen.queryByText('Переход')).toBeNull()
    expect(screen.getByText('Выйти')).toBeInTheDocument()
  })

  it('fuzzy search matches "одоб" to Заявки via keywords', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<CommandPalette />)
    openPalette()
    const input = screen.getByPlaceholderText('Поиск команд…')
    await user.type(input, 'одоб')
    await waitFor(() => {
      expect(screen.getByText('Заявки на рассмотрение')).toBeInTheDocument()
      expect(screen.queryByText('Краны')).toBeNull()
    })
  })

  // NOTE: Integration test "item selection → router.push" is covered in
  // use-commands.test.ts (execute() tested for href, logout, create-organization).
  // cmdk's click→onSelect path doesn't fire reliably in jsdom
  // (Primitive.div wrapping + React 19 synthetic events + cmdk's store-driven
  // state). We trust cmdk's own test suite for click/keyboard selection and
  // verify the wiring declaratively — CommandRow passes onSelect={onSelect} to
  // CmdkRoot.Item, handleSelect calls execute(cmd).
})
