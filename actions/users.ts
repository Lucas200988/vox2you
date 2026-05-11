'use server'

import { prisma } from '@/lib/prisma'
import { getAuthUser } from './auth'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function getUsers() {
  const user = await getAuthUser()
  if (user.role !== 'gestor') throw new Error('Sem permissão')

  return prisma.user.findMany({ orderBy: { name: 'asc' } })
}

export async function createUser(data: {
  name: string
  email: string
  password: string
  role: 'gestor' | 'administrador' | 'vendedor'
}) {
  const user = await getAuthUser()
  if (user.role !== 'gestor') throw new Error('Sem permissão')

  const supabase = await createClient()

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) return { error: 'E-mail já cadastrado.' }

  // Cria no Supabase Auth via service role (via API key)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  })

  if (authError) return { error: authError.message }

  await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
    },
  })

  revalidatePath('/users')
  return { success: true }
}

export async function toggleUserActive(userId: string) {
  const user = await getAuthUser()
  if (user.role !== 'gestor') throw new Error('Sem permissão')

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return { error: 'Usuário não encontrado.' }

  await prisma.user.update({
    where: { id: userId },
    data: { active: !target.active },
  })

  revalidatePath('/users')
  return { success: true }
}
