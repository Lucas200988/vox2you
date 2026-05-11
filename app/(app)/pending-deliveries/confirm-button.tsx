'use client'

import { useState } from 'react'
import { confirmDelivery } from '@/actions/deliveries'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  saleItemId: string
  studentName: string
  materialName: string
  quantity: number
}

export function ConfirmDeliveryButton({ saleItemId, studentName, materialName, quantity }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleConfirm() {
    if (!confirm(`Confirmar entrega de ${quantity}x "${materialName}" para ${studentName}?`)) return

    setLoading(true)
    setError('')

    const result = await confirmDelivery(saleItemId)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setDone(true)
    router.refresh()
  }

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
        <CheckCircle className="h-5 w-5" />
        Entregue!
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="success" onClick={handleConfirm} disabled={loading} size="lg">
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando...</>
        ) : (
          <><CheckCircle className="h-4 w-4" /> Confirmar Entrega</>
        )}
      </Button>
      {error && <p className="text-xs text-red-600 max-w-[200px] text-right">{error}</p>}
    </div>
  )
}
