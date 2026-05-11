'use client'

import { useState } from 'react'
import { toggleUserActive } from '@/actions/users'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  active: boolean
  userName: string
}

export function ToggleUserButton({ userId, active, userName }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    const action = active ? 'desativar' : 'ativar'
    if (!confirm(`Deseja ${action} o usuário "${userName}"?`)) return

    setLoading(true)
    await toggleUserActive(userId)
    router.refresh()
    setLoading(false)
  }

  return (
    <Button
      variant={active ? 'outline' : 'secondary'}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? 'Desativar' : 'Ativar'}
    </Button>
  )
}
