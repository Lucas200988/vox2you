'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
type Transaction = Awaited<ReturnType<typeof prisma.financialTransaction.findMany>>[number] & {
  createdBy: { name: string }
}

export async function getTransactions(month: number, year: number): Promise<Transaction[]> {
  return prisma.financialTransaction.findMany({
    where: { referenceMonth: month, referenceYear: year },
    include: { createdBy: { select: { name: true } } },
    orderBy: { date: 'desc' },
  }) as Promise<Transaction[]>
}

export async function getBalanceSummary(month: number, year: number) {
  const transactions = await getTransactions(month, year)

  const receitas = transactions
    .filter((t: Transaction) => t.type === 'receita')
    .reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0)

  const despesas = transactions
    .filter((t: Transaction) => t.type === 'despesa')
    .reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0)

  const byCategory = transactions.reduce<Record<string, { receita: number; despesa: number }>>((acc, t: Transaction) => {
    if (!acc[t.category]) acc[t.category] = { receita: 0, despesa: 0 }
    acc[t.category][t.type as 'receita' | 'despesa'] += Number(t.amount)
    return acc
  }, {})

  return { receitas, despesas, saldo: receitas - despesas, byCategory, transactions }
}

export async function createTransaction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const dbUser = await prisma.user.findUnique({ where: { email: user.email! } })
  if (!dbUser) throw new Error('Usuário não encontrado')

  const amount = parseFloat(formData.get('amount') as string)
  const date = new Date(formData.get('date') as string)
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  await prisma.financialTransaction.create({
    data: {
      description: formData.get('description') as string,
      type: formData.get('type') as 'receita' | 'despesa',
      category: formData.get('category') as string,
      amount: amount,
      date,
      referenceMonth: month,
      referenceYear: year,
      notes: (formData.get('notes') as string) || null,
      createdById: dbUser.id,
    },
  })

  revalidatePath('/balancete')
}

export async function deleteTransaction(id: string) {
  await prisma.financialTransaction.delete({ where: { id } })
  revalidatePath('/balancete')
}
