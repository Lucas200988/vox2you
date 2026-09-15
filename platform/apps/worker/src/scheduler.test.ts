import { Redis } from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { createLogger } from '@vox/core'
import { acquireTick } from './scheduler.js'
import type { WorkerContext } from './main.js'

const RUN = !!process.env['REDIS_URL']

describe.skipIf(!RUN)('scheduler tick lock', () => {
  const redis = new Redis(process.env['REDIS_URL']!, { maxRetriesPerRequest: null })
  const ctxFor = (instanceId: string) =>
    ({ redis, instanceId, logger: createLogger('test', 'silent') }) as unknown as WorkerContext
  afterAll(async () => {
    await redis.quit()
  })

  it('grants one tick per interval to a single replica', async () => {
    const name = `test-${Date.now()}`
    await redis.del(`vox:scheduler:${name}`)
    const [a, b] = await Promise.all([
      acquireTick(ctxFor('replica-a'), name, 2000),
      acquireTick(ctxFor('replica-b'), name, 2000),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await acquireTick(ctxFor('replica-c'), name, 2000)).toBe(false)
    const ttl = await redis.pttl(`vox:scheduler:${name}`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(1750)
    await redis.del(`vox:scheduler:${name}`)
  })

  it('skips the tick instead of failing when Redis is unreachable', async () => {
    const broken = new Redis({
      port: 1,
      host: '127.0.0.1',
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
    broken.on('error', () => undefined)
    const ctx = {
      redis: broken,
      instanceId: 'x',
      logger: createLogger('test', 'silent'),
    } as unknown as WorkerContext
    expect(await acquireTick(ctx, 'unreachable', 1000)).toBe(false)
    broken.disconnect()
  })
})
