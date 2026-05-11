'use client'

import { useState } from 'react'
import { receivePurchaseOrder } from '@/actions/purchase-orders'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  orderId: string
  materialName: string
  quantity: number
}

export function ReceiveOrderButton({ orderId, materialName, quantity }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handle() {
    if (!confirm(`Confirmar recebimento de ${quantity}x ${materialName}?\n\nO estoque será atualizado automaticamente.`)) return
    setLoading(true)
    await receivePurchaseOrder(orderId)
    router.refresh()
    setLoading(false)
  }

  return (
    <Button variant="success" onClick={handle} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
      Recebido
    </Button>
  )
}
