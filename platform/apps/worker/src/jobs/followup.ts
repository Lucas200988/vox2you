import { FollowUpExecutor, type FollowUpJob } from '@vox/core'
import type { WorkerContext } from '../main.js'

export async function processFollowUp(ctx: WorkerContext, job: FollowUpJob) {
  const result = await new FollowUpExecutor(ctx.deps, ctx.realtime).execute(job.followUpId)
  ctx.logger.info({ followUpId: job.followUpId, ...result }, 'follow-up processed')
  return result
}
