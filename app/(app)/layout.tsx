import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email! },
    select: { name: true, role: true, active: true },
  })

  if (!dbUser || !dbUser.active) redirect('/login')

  return (
    <div className="flex h-full bg-slate-50">
      <Sidebar userRole={dbUser.role} userName={dbUser.name} />

      <main className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        <div className="flex-1 p-6 pt-16 lg:pt-6 max-w-7xl mx-auto w-full">
          {children}
        </div>
        <footer className="lg:pl-0 py-3 px-6 text-center">
          <p className="text-xs text-slate-400">
            Desenvolvido por <span className="font-medium text-slate-500">Lucas Costa</span>
          </p>
        </footer>
      </main>
    </div>
  )
}
