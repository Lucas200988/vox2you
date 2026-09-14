'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate } from '@/lib/utils'
import { Badge, Button, Card, Field, Input, Select, useToast } from '@/components/ui/primitives'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  status: string
  lastLoginAt: string | null
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Admin',
  manager: 'Gestor',
  seller: 'Vendedor',
  viewer: 'Visualizador',
}

export function UsersTab() {
  const { data } = useApi<{ items: UserRow[] }>('users')
  const { me } = useSession()
  const toast = useToast()
  const canManage = ['owner', 'admin'].includes(me?.role ?? '')
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <MyPasswordCard toast={toast} />

      {canManage && (
        <Card title="Novo usuário">
          <form
            className="grid gap-2 md:grid-cols-5"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              try {
                await api.post('users', {
                  name: f.get('name'),
                  email: f.get('email'),
                  password: f.get('password'),
                  role: f.get('role'),
                  unitIds: me?.units.map((u) => u.id) ?? [],
                })
                await mutate('users')
                ;(e.target as HTMLFormElement).reset()
                toast.show('Usuário criado')
              } catch (err) {
                toast.show((err as Error).message, 'err')
              }
            }}
          >
            <Input name="name" placeholder="Nome" required />
            <Input name="email" type="email" placeholder="E-mail" required />
            <Input
              name="password"
              type="password"
              placeholder="Senha (8+)"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Select name="role" defaultValue="seller">
              <option value="seller">Vendedor</option>
              <option value="manager">Gestor</option>
              <option value="admin">Admin</option>
              <option value="viewer">Visualizador</option>
            </Select>
            <Button type="submit">Criar</Button>
          </form>
        </Card>
      )}

      <Card title="Usuários">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Último login</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((u) =>
              editing === u.id ? (
                <EditRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === me?.user?.id}
                  onDone={() => setEditing(null)}
                  toast={toast}
                />
              ) : (
                <tr key={u.id} className="border-t">
                  <td className="py-1.5">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <Badge tone="brand">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                  </td>
                  <td>
                    <Badge tone={u.status === 'active' ? 'green' : 'slate'}>
                      {u.status === 'active' ? 'ativo' : 'desativado'}
                    </Badge>
                  </td>
                  <td className="text-xs text-muted">{fmtDate(u.lastLoginAt)}</td>
                  {canManage && (
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u.id)}>
                        Editar
                      </Button>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Card>
      {toast.node}
    </div>
  )
}

/** Any signed-in user changes their own password here; it requires the current one. */
function MyPasswordCard({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Card title="Minha senha">
      <form
        className="grid gap-2 md:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const next = String(f.get('newPassword') ?? '')
          if (next !== String(f.get('confirm') ?? '')) {
            toast.show('A confirmação não confere com a nova senha', 'err')
            return
          }
          setBusy(true)
          try {
            await api.post('auth/change-password', {
              currentPassword: f.get('currentPassword'),
              newPassword: next,
            })
            ;(e.target as HTMLFormElement).reset()
            toast.show('Senha alterada')
          } catch (err) {
            toast.show((err as Error).message, 'err')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input
          name="currentPassword"
          type="password"
          placeholder="Senha atual"
          required
          autoComplete="current-password"
        />
        <Input
          name="newPassword"
          type="password"
          placeholder="Nova senha (8+)"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input
          name="confirm"
          type="password"
          placeholder="Confirmar nova senha"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Alterar senha'}
        </Button>
      </form>
    </Card>
  )
}

/** Admin edit of another user: name, role, status and an optional password reset. */
function EditRow({
  user,
  isSelf,
  onDone,
  toast,
}: {
  user: UserRow
  isSelf: boolean
  onDone: () => void
  toast: ReturnType<typeof useToast>
}) {
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    status: user.status,
    password: '',
  })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`users/${user.id}`, {
        name: form.name,
        role: form.role,
        status: form.status,
        ...(form.password ? { password: form.password } : {}),
      })
      await mutate('users')
      toast.show(form.password ? 'Usuário salvo e senha redefinida' : 'Usuário salvo')
      onDone()
    } catch (err) {
      toast.show((err as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }
  return (
    <tr className="border-t bg-slate-50">
      <td colSpan={6} className="p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Papel">
            <Select
              value={form.role}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">ativo</option>
              <option value="disabled">desativado</option>
            </Select>
          </Field>
          <Field label="Nova senha (opcional)">
            <Input
              type="password"
              value={form.password}
              minLength={8}
              placeholder="deixe vazio para manter"
              autoComplete="new-password"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">{user.email}</p>
      </td>
    </tr>
  )
}
