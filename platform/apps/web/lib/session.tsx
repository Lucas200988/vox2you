'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApi } from './api'

export interface Unit {
  id: string
  name: string
  slug: string
  city: string | null
  timezone: string
}

export interface Me {
  user: { id: string; name: string; email: string; role: string; tenantId: string } | null
  units: Unit[]
  role: string
  providers: {
    llm: string
    embedding: string
    messaging: string
    stt: string
    calendar: string
    storage: string
    trace: string
    pendingCredentials: string[]
  }
}

interface SessionCtx {
  me: Me | undefined
  unit: Unit | undefined
  unitId: string
  setUnitId: (id: string) => void
  can: (minRole: 'viewer' | 'seller' | 'manager' | 'admin' | 'owner') => boolean
}

const RANK: Record<string, number> = { viewer: 1, seller: 2, manager: 3, admin: 4, owner: 5 }
const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data: me } = useApi<Me>('auth/me')
  const [unitId, setUnitIdState] = useState('')
  useEffect(() => {
    if (!me?.units.length) return
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('vox_unit') : null
    const valid = me.units.find((u) => u.id === saved)?.id ?? me.units[0]!.id
    setUnitIdState(valid)
  }, [me])
  const setUnitId = useCallback((id: string) => {
    setUnitIdState(id)
    try {
      window.localStorage.setItem('vox_unit', id)
    } catch {
      /* ignore */
    }
  }, [])
  const value = useMemo<SessionCtx>(
    () => ({
      me,
      unit: me?.units.find((u) => u.id === unitId),
      unitId,
      setUnitId,
      can: (min) => (RANK[me?.role ?? 'viewer'] ?? 0) >= RANK[min]!,
    }),
    [me, unitId, setUnitId],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}
