import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import type { AppContext } from '../context.js'

/**
 * Prometheus text exposition at GET /metrics — no extra dependency.
 * HTTP counters/histogram are kept in memory; queue, outbox, follow-up and agent gauges are read
 * on scrape (cheap indexed queries). Keep this endpoint off the public edge (Caddy returns 404).
 */

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
const PLACEHOLDER_PROVIDERS = new Set([
  'mock',
  'hash',
  'console',
  'local',
  'internal',
  'noop',
  'none',
  'disabled',
])

interface HistogramSeries {
  buckets: number[]
  sum: number
  count: number
}

class HttpMetrics {
  private readonly requests = new Map<string, number>()
  private readonly durations = new Map<string, HistogramSeries>()

  observe(method: string, route: string, status: number, seconds: number): void {
    const key = `${method}|${route}|${status}`
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1)
    const hkey = `${method}|${route}`
    let series = this.durations.get(hkey)
    if (!series) {
      series = { buckets: new Array<number>(BUCKETS.length).fill(0), sum: 0, count: 0 }
      this.durations.set(hkey, series)
    }
    for (let i = 0; i < BUCKETS.length; i++) if (seconds <= BUCKETS[i]!) series.buckets[i]!++
    series.sum += seconds
    series.count++
  }

  render(out: string[]): void {
    out.push(
      '# HELP vox_http_requests_total HTTP requests by method, route and status.',
      '# TYPE vox_http_requests_total counter',
    )
    for (const [key, n] of this.requests) {
      const [method, route, status] = key.split('|')
      out.push(
        `vox_http_requests_total{method="${method}",route="${esc(route!)}",status="${status}"} ${n}`,
      )
    }
    out.push(
      '# HELP vox_http_request_duration_seconds HTTP request latency.',
      '# TYPE vox_http_request_duration_seconds histogram',
    )
    for (const [key, s] of this.durations) {
      const [method, route] = key.split('|')
      const labels = `method="${method}",route="${esc(route!)}"`
      BUCKETS.forEach((le, i) =>
        out.push(`vox_http_request_duration_seconds_bucket{${labels},le="${le}"} ${s.buckets[i]}`),
      )
      out.push(`vox_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${s.count}`)
      out.push(`vox_http_request_duration_seconds_sum{${labels}} ${s.sum}`)
      out.push(`vox_http_request_duration_seconds_count{${labels}} ${s.count}`)
    }
  }
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

const metricsPlugin: FastifyPluginAsync<{ ctx: AppContext }> = async (app, { ctx }) => {
  const http = new HttpMetrics()

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? 'unmatched'
    if (route === '/metrics') return
    http.observe(req.method, route, reply.statusCode, reply.elapsedTime / 1000)
  })

  app.get(
    '/metrics',
    { schema: { tags: ['system'], security: [], hide: true }, config: { rateLimit: false } },
    async (req, reply) => {
      if (
        ctx.config.METRICS_TOKEN &&
        req.headers.authorization !== `Bearer ${ctx.config.METRICS_TOKEN}`
      )
        return reply.status(401).send('unauthorized')

      const out: string[] = []
      http.render(out)

      // Dependencies
      const dep = async (name: string, probe: () => Promise<unknown>) => {
        let up = 1
        try {
          await probe()
        } catch {
          up = 0
        }
        out.push(`vox_dependency_up{dependency="${name}"} ${up}`)
      }
      out.push(
        '# HELP vox_dependency_up 1 when the API can reach the dependency.',
        '# TYPE vox_dependency_up gauge',
      )
      await dep('database', () => ctx.db.$queryRawUnsafe('SELECT 1'))
      await dep('redis', () => ctx.redis.ping())

      // Queues (BullMQ)
      out.push('# HELP vox_queue_jobs Jobs per queue and state.', '# TYPE vox_queue_jobs gauge')
      for (const [name, queue] of Object.entries(ctx.queues)) {
        try {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
            'completed',
          )
          for (const [state, n] of Object.entries(counts))
            out.push(`vox_queue_jobs{queue="${name}",state="${state}"} ${n}`)
        } catch {
          /* redis down: dependency gauge already reports it */
        }
      }

      // Outbox / follow-ups / agent (last hour) — indexed, tenant-agnostic operational counts
      const hourAgo = new Date(Date.now() - 36e5)
      const [outbox, overdue, runs, cost] = await Promise.all([
        ctx.db.domainEvent.count({ where: { publishedAt: null } }).catch(() => -1),
        ctx.db.followUp
          .count({
            where: { status: 'scheduled', scheduledAt: { lt: new Date(Date.now() - 5 * 60e3) } },
          })
          .catch(() => -1),
        ctx.db.agentRun
          .groupBy({
            by: ['decision'],
            where: { createdAt: { gte: hourAgo } },
            _count: { _all: true },
          })
          .catch(() => []),
        ctx.db.agentRun
          .aggregate({ where: { createdAt: { gte: hourAgo } }, _sum: { costUsd: true } })
          .catch(() => null),
      ])
      out.push(
        '# HELP vox_outbox_unpublished Domain events waiting for the worker scheduler.',
        '# TYPE vox_outbox_unpublished gauge',
        `vox_outbox_unpublished ${outbox}`,
      )
      out.push(
        '# HELP vox_followups_overdue Scheduled follow-ups more than 5 minutes past due.',
        '# TYPE vox_followups_overdue gauge',
        `vox_followups_overdue ${overdue}`,
      )
      out.push(
        '# HELP vox_agent_runs_1h Agent runs in the last hour by decision.',
        '# TYPE vox_agent_runs_1h gauge',
      )
      for (const r of runs)
        out.push(`vox_agent_runs_1h{decision="${r.decision ?? 'none'}"} ${r._count._all}`)
      out.push(
        '# HELP vox_agent_cost_usd_1h LLM spend in the last hour.',
        '# TYPE vox_agent_cost_usd_1h gauge',
        `vox_agent_cost_usd_1h ${Number(cost?._sum.costUsd ?? 0)}`,
      )

      // Provider readiness
      const pending = Object.values(ctx.providerStatus).filter((v) =>
        PLACEHOLDER_PROVIDERS.has(String(v)),
      ).length
      out.push(
        '# HELP vox_pending_credentials Providers still running on mock/local adapters.',
        '# TYPE vox_pending_credentials gauge',
        `vox_pending_credentials ${ctx.config.NODE_ENV === 'production' ? pending : 0}`,
      )
      out.push(
        '# HELP vox_process_uptime_seconds Process uptime.',
        '# TYPE vox_process_uptime_seconds gauge',
        `vox_process_uptime_seconds ${Math.round(process.uptime())}`,
      )
      const mem = process.memoryUsage()
      out.push(
        '# HELP vox_process_memory_bytes Resident and heap memory.',
        '# TYPE vox_process_memory_bytes gauge',
        `vox_process_memory_bytes{kind="rss"} ${mem.rss}`,
        `vox_process_memory_bytes{kind="heap_used"} ${mem.heapUsed}`,
      )

      return reply
        .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(out.join('\n') + '\n')
    },
  )
}

export default fp(metricsPlugin, { name: 'metrics' })
