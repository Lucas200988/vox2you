import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-soft">
            V
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">VOX2you CRM</h1>
          <p className="mt-1 text-sm text-muted">Atendimento e vendas com inteligência comercial</p>
        </div>
        <LoginForm next={next ?? '/inbox'} />
      </div>
    </main>
  )
}
