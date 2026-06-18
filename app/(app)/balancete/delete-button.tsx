'use client'

import { Trash2 } from 'lucide-react'
import { deleteTransaction } from '@/actions/balancete'
import { useState } from 'react'

export function DeleteTransactionButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('Remover este lançamento?')) return
    setLoading(true)
    await deleteTransaction(id)
    setLoading(false)
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
