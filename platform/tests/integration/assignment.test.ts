import { LeadService, systemContext } from '@vox/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setupTestEnv, type TestEnv } from './helpers.js'

/**
 * Round-robin assignment: the least-loaded eligible user of the unit gets the lead, ties go to
 * whoever received a lead least recently. Used on handoff (recommended owner) and by
 * POST /leads/:id/auto-assign.
 */
describe.skipIf(!RUN)('Lead assignment: least-loaded round-robin', () => {
  let env: TestEnv
  let sellerA: string
  let sellerB: string
  let seedSeller: string

  async function seller(email: string, name: string): Promise<string> {
    const user = await env.db.user.upsert({
      where: { tenantId_email: { tenantId: env.seed.tenantId, email } },
      update: { status: 'active', role: 'seller' },
      create: {
        tenantId: env.seed.tenantId,
        email,
        name,
        role: 'seller',
        passwordHash: 'x',
        status: 'active',
        units: { create: { unitId: env.seed.unitId, role: 'seller' } },
      },
    })
    return user.id
  }

  async function newLead(): Promise<string> {
    const res = await inbound(env, randomPhone(), 'Oi, quero saber mais sobre o curso')
    return res.leadId!
  }

  beforeAll(async () => {
    env = await setupTestEnv()
    // deterministic load: nobody owns anything in the unit before the test
    await env.db.lead.updateMany({ where: { unitId: env.seed.unitId }, data: { ownerId: null } })
    await env.db.user.updateMany({
      where: { tenantId: env.seed.tenantId, role: { in: ['seller', 'manager'] } },
      data: { status: 'disabled' },
    })
    seedSeller = await seller('vendedor@vox2you.local', 'Consultor Exemplo')
    sellerA = await seller('a@test.local', 'Seller A')
    sellerB = await seller('b@test.local', 'Seller B')
    const [l1, l2, l3] = await Promise.all([newLead(), newLead(), newLead()])
    await env.db.lead.update({ where: { id: l1 }, data: { ownerId: seedSeller } })
    await env.db.lead.update({ where: { id: l2 }, data: { ownerId: sellerA } })
    await env.db.lead.update({ where: { id: l3 }, data: { ownerId: sellerA } })
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('recommends the least-loaded seller on handoff', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Tenho vergonha de falar em público')
    const res = await inbound(env, phone, 'quero falar com um atendente humano')
    expect(res.run?.decision).toBe('handoff')
    const lead = await env.db.lead.findUnique({ where: { id: res.leadId } })
    expect(lead?.recommendedOwnerId).toBe(sellerB)
    expect(lead?.ownerId).toBe(sellerB) // handoff assigns the lead, so B now carries 1
    const conv = await env.db.conversation.findUnique({ where: { id: res.conversationId } })
    expect(conv?.assigneeId).toBe(sellerB)
  })

  it('auto-assigns in turn: fewest open leads first, then least recently served', async () => {
    const leads = new LeadService(env.db)
    const ctx = systemContext(env.seed.tenantId)
    // load: seedSeller 1 (served earliest), B 1 (served on the handoff above), A 2
    const first = await leads.autoAssign(ctx, await newLead())
    expect(first.assigned).toBe(true)
    expect(first.ownerId).toBe(seedSeller)
    // seedSeller 2, B 1, A 2
    const second = await leads.autoAssign(ctx, await newLead())
    expect(second.ownerId).toBe(sellerB)
    // everyone at 2: A received its leads first → A
    const third = await leads.autoAssign(ctx, await newLead())
    expect(third.ownerId).toBe(sellerA)
    const conv = await env.db.conversation.findFirst({ where: { leadId: third.lead.id } })
    expect(conv?.assigneeId).toBe(sellerA)
  })

  it('never hands a lead back to its current owner and copes with no eligible users', async () => {
    const leads = new LeadService(env.db)
    const ctx = systemContext(env.seed.tenantId)
    const leadId = await newLead()
    const a = await leads.autoAssign(ctx, leadId)
    const b = await leads.autoAssign(ctx, leadId)
    expect(b.ownerId).not.toBe(a.ownerId)
    await env.db.user.updateMany({
      where: { id: { in: [seedSeller, sellerA, sellerB] } },
      data: { status: 'disabled' },
    })
    const none = await leads.autoAssign(ctx, await newLead())
    expect(none.assigned).toBe(false)
    await env.db.user.updateMany({
      where: { id: { in: [seedSeller, sellerA, sellerB] } },
      data: { status: 'active' },
    })
  })
})
