'use client'

import { useState } from 'react'
import { cancelPurchaseOrder } from '@/actions/purchase-orders'
import { Button } from '@/components/ui/button'
import { X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  orderId: string
  materialName: string
}

export function CancelOrderButton({ orderId, materialName }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handle() {
    if (!confirm(`Cancelar pedido de ${materialName}?`)) return
    setLoading(true)
    await cancelPurchaseOrder(orderId)
    router.refresh()
    setLoading(false)
  }

  return (
    <Button variant="outline" onClick={handle} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      Cancelar
    </Button>
  )
}
