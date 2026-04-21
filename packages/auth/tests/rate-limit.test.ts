import { describe, expect, it } from 'vitest'
import { MemoryRateLimiter } from '../src'

describe('MemoryRateLimiter (sliding window)', () => {
  it('разрешает запросы до maxRequests', async () => {
    const now = 1_000_000
    const rl = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 3 }, () => now)
    const a = await rl.check('key')
    const b = await rl.check('key')
    const c = await rl.check('key')
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
    expect(c.allowed).toBe(true)
    expect(a.remaining).toBe(2)
    expect(c.remaining).toBe(0)
  })

  it('блокирует 4-й запрос в том же окне', async () => {
    const now = 1_000_000
    const rl = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 3 }, () => now)
    await rl.check('key')
    await rl.check('key')
    await rl.check('key')
    const d = await rl.check('key')
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.remaining).toBe(0)
      expect(d.retryAfterMs).toBe(60_000)
      expect(d.resetAt.getTime()).toBe(1_000_000 + 60_000)
    }
  })

  it('через окно слот освобождается', async () => {
    let now = 1_000_000
    const rl = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 }, () => now)
    await rl.check('key')
    await rl.check('key')
    const blocked = await rl.check('key')
    expect(blocked.allowed).toBe(false)

    now += 60_001
    const freed = await rl.check('key')
    expect(freed.allowed).toBe(true)
  })

  it('ключи изолированы', async () => {
    const now = 1_000_000
    const rl = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 }, () => now)
    expect((await rl.check('a')).allowed).toBe(true)
    expect((await rl.check('b')).allowed).toBe(true)
    expect((await rl.check('a')).allowed).toBe(false)
    expect((await rl.check('b')).allowed).toBe(false)
  })

  it('reset очищает ключ', async () => {
    const now = 1_000_000
    const rl = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 }, () => now)
    await rl.check('key')
    expect((await rl.check('key')).allowed).toBe(false)
    await rl.reset('key')
    expect((await rl.check('key')).allowed).toBe(true)
  })
})
