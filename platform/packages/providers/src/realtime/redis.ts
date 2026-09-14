import { Redis } from 'ioredis'
import type { RealtimeEvent, RealtimePublisher } from '@vox/core'

const channelFor = (tenantId: string) => `vox:rt:${tenantId}`

/** Publishes realtime events to a per-tenant Redis channel (consumed by the API's SSE endpoint). */
export class RedisRealtimePublisher implements RealtimePublisher {
  private readonly redis: Redis
  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true, enableOfflineQueue: true })
  }
  async publish(event: RealtimeEvent): Promise<void> {
    try {
      await this.redis.publish(channelFor(event.tenantId), JSON.stringify(event))
    } catch {
      // realtime is best-effort; never fail the business operation
    }
  }
  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined)
  }
}

/** Subscribes to a tenant's realtime channel. Returns an unsubscribe function. */
export function subscribeRealtime(redisUrl: string, tenantId: string, handler: (event: RealtimeEvent) => void): () => Promise<void> {
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
  const channel = channelFor(tenantId)
  void sub.subscribe(channel)
  sub.on('message', (_ch, message) => {
    try {
      handler(JSON.parse(message) as RealtimeEvent)
    } catch {
      /* ignore malformed */
    }
  })
  return async () => {
    await sub.unsubscribe(channel).catch(() => undefined)
    await sub.quit().catch(() => undefined)
  }
}
