import { describe, expect, it } from 'vitest'
import { COMMAND_REGISTRY, getCommandsForRole } from './registry'

describe('COMMAND_REGISTRY', () => {
  it('each entry has unique id', () => {
    const ids = COMMAND_REGISTRY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each entry has href OR action (not both missing)', () => {
    for (const entry of COMMAND_REGISTRY) {
      const hasTarget = Boolean(entry.href) || Boolean(entry.action)
      expect(hasTarget, `${entry.id} must have href or action`).toBe(true)
    }
  })

  it('each entry has at least one role', () => {
    for (const entry of COMMAND_REGISTRY) {
      expect(entry.roles.length).toBeGreaterThan(0)
    }
  })
})

describe('getCommandsForRole', () => {
  it('superadmin sees navigation + actions + system', () => {
    const commands = getCommandsForRole('superadmin')
    expect(commands.some((c) => c.group === 'navigation')).toBe(true)
    expect(commands.some((c) => c.group === 'actions')).toBe(true)
    expect(commands.some((c) => c.group === 'system')).toBe(true)
    expect(commands.some((c) => c.id === 'nav.dashboard')).toBe(true)
    expect(commands.some((c) => c.id === 'nav.approvals')).toBe(true)
    expect(commands.some((c) => c.id === 'action.create-organization')).toBe(true)
    expect(commands.some((c) => c.id === 'system.logout')).toBe(true)
  })

  it('owner sees only system commands (owner cabinet surface lives in B3-UI-3)', () => {
    const commands = getCommandsForRole('owner')
    expect(commands.every((c) => c.group === 'system')).toBe(true)
    expect(commands.length).toBeGreaterThanOrEqual(1)
    expect(commands.some((c) => c.id === 'system.logout')).toBe(true)
  })

  it('operator sees only system commands', () => {
    const commands = getCommandsForRole('operator')
    expect(commands.every((c) => c.group === 'system')).toBe(true)
    expect(commands.some((c) => c.id === 'system.logout')).toBe(true)
  })
})
