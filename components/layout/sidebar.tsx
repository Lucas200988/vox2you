'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, PackagePlus, ShoppingCart,
  Truck, History, BarChart3, Users, LogOut, BookOpen, Menu, X, ClipboardList, Wallet
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type UserRole = 'gestor' | 'administrador' | 'vendedor'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles: UserRole[]
}

const navItems: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',              icon: LayoutDashboard, roles: ['gestor', 'administrador', 'vendedor'] },
  { href: '/sales',           label: 'Lançar Venda',           icon: ShoppingCart,    roles: ['gestor', 'administrador', 'vendedor'] },
  { href: '/pending-deliveries', label: 'Entregas Pendentes',  icon: Truck,           roles: ['gestor', 'administrador'] },
  { href: '/purchase-orders', label: 'Pedidos Franqueadora',   icon: ClipboardList,   roles: ['gestor', 'administrador'] },
  { href: '/stock-entries',   label: 'Entrada de Estoque',     icon: PackagePlus,     roles: ['gestor', 'administrador'] },
  { href: '/materials',       label: 'Materiais',              icon: Package,         roles: ['gestor', 'administrador'] },
  { href: '/history',         label: 'Histórico',              icon: History,         roles: ['gestor', 'administrador'] },
  { href: '/replenishment',   label: 'Reposição',              icon: BarChart3,       roles: ['gestor'] },
  { href: '/balancete',       label: 'Balancete',              icon: Wallet,          roles: ['gestor', 'administrador'] },
  { href: '/users',           label: 'Usuários',               icon: Users,           roles: ['gestor'] },
]

interface SidebarProps {
  userRole: UserRole
  userName: string
}

export function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const visibleItems = navItems.filter(item => item.roles.includes(userRole))

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabels: Record<UserRole, string> = {
    gestor: 'Gestor',
    administrador: 'Administrador',
    vendedor: 'Vendedor',
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-200">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Vox2You</p>
          <p className="text-xs text-slate-500">Estoque</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive ? 'text-blue-600' : 'text-slate-400')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 px-2">
          <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
          <p className="text-xs text-slate-500">{roleLabels[userRole]}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-all"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 shadow-xl transition-transform duration-300 lg:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 bg-white border-r border-slate-200">
        <SidebarContent />
      </aside>
    </>
  )
}
