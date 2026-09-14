'use server'

import { redirect } from 'next/navigation'
import { API_BASE, clearSessionCookies, setSessionCookies, type Session } from '@/lib/server/api'

export interface LoginState {
  error?: string
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/inbox')
  if (!email || !password) return { error: 'Informe e-mail e senha.' }
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    })
  } catch {
    return { error: 'API indisponível. Verifique se o serviço está no ar.' }
  }
  if (!res.ok)
    return {
      error: res.status === 401 ? 'E-mail ou senha inválidos.' : `Falha no login (${res.status}).`,
    }
  const session = (await res.json()) as Session
  await setSessionCookies(session)
  redirect(next.startsWith('/') ? next : '/inbox')
}

export async function logoutAction() {
  await clearSessionCookies()
  redirect('/login')
}
