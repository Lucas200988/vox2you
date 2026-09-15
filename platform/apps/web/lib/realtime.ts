'use client'

import { useEffect, useRef } from 'react'
import { mutate } from 'swr'

export interface RealtimeEvent {
  type:
    | 'conversation.updated'
    | 'message.new'
    | 'message.status'
    | 'lead.updated'
    | 'handoff'
    | 'agent.run'
    | 'notification.new'
  tenantId: string
  unitId?: string | null
  conversationId?: string
  leadId?: string
  payload?: Record<string, unknown>
  at: string
}

/** Subscribes to the SSE stream and revalidates SWR keys touched by each event. */
export function useRealtime(unitId: string | undefined, onEvent?: (e: RealtimeEvent) => void) {
  const handler = useRef(onEvent)
  handler.current = onEvent
  useEffect(() => {
    if (!unitId) return
    const es = new EventSource(`/api/stream?unitId=${unitId}`)
    const types: RealtimeEvent['type'][] = [
      'conversation.updated',
      'message.new',
      'message.status',
      'lead.updated',
      'handoff',
      'agent.run',
      'notification.new',
    ]
    const listeners = types.map((type) => {
      const fn = (ev: MessageEvent) => {
        let data: RealtimeEvent
        try {
          data = JSON.parse(ev.data) as RealtimeEvent
        } catch {
          return
        }
        handler.current?.(data)
        if (data.type === 'notification.new') {
          void mutate(
            (key) => typeof key === 'string' && key.startsWith('notifications'),
            undefined,
            { revalidate: true },
          )
          return
        }
        void mutate(
          (key) => typeof key === 'string' && key.startsWith('conversations'),
          undefined,
          { revalidate: true },
        )
        if (data.conversationId) void mutate(`conversations/${data.conversationId}/messages`)
        if (data.leadId) {
          void mutate(`leads/${data.leadId}`)
          void mutate(
            (key) => typeof key === 'string' && key.startsWith('leads/kanban'),
            undefined,
            { revalidate: true },
          )
        }
      }
      es.addEventListener(type, fn)
      return [type, fn] as const
    })
    return () => {
      for (const [type, fn] of listeners) es.removeEventListener(type, fn)
      es.close()
    }
  }, [unitId])
}
