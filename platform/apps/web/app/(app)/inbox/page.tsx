'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ConversationList } from '@/components/inbox/conversation-list'
import { MessageThread } from '@/components/inbox/message-thread'
import { LeadPanel } from '@/components/inbox/lead-panel'
import { EmptyState } from '@/components/ui/primitives'

function InboxInner() {
  const params = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('c'))
  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r bg-white">
        <ConversationList selected={selected} onSelect={setSelected} />
      </div>
      <div className="min-w-0 flex-1 bg-canvas">
        {selected ? (
          <MessageThread conversationId={selected} />
        ) : (
          <EmptyState
            title="Selecione uma conversa"
            hint="As mensagens chegam em tempo real. A IA responde automaticamente enquanto a conversa estiver em modo IA."
          />
        )}
      </div>
      <div className="w-80 shrink-0 overflow-y-auto border-l bg-white scroll-thin">
        {selected && <LeadPanel conversationId={selected} />}
      </div>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxInner />
    </Suspense>
  )
}
