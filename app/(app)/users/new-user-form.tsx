'use client'

import { useState } from 'react'
import { createUser } from '@/actions/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Loader2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function NewUserForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: '' as 'gestor' | 'administrador' | 'vendedor' | ''
  })
  const router = useRouter()

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.role) return
    setLoading(true)
    setError('')

    const result = await createUser({
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
    })

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setOpen(false)
    setForm({ name: '', email: '', password: '', role: '' })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Cadastrar Usuário
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome completo *</Label>
            <Input id="name" placeholder="João Silva" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail *</Label>
            <Input id="email" type="email" placeholder="joao@vox2you.com.br" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha inicial *</Label>
            <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil *</Label>
            <Select value={form.role} onValueChange={v => set('role', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o perfil..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">Vendedor</SelectItem>
                <SelectItem value="administrador">Administrador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading || !form.role} className="flex-1">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : 'Criar Usuário'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
