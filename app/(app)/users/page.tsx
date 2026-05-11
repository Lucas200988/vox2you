import { getUsers } from '@/actions/users'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import { NewUserForm } from './new-user-form'
import { ToggleUserButton } from './toggle-user-button'

const roleLabels = {
  gestor: { label: 'Gestor', variant: 'default' as const },
  administrador: { label: 'Administrador', variant: 'secondary' as const },
  vendedor: { label: 'Vendedor', variant: 'outline' as const },
}

export default async function UsersPage() {
  const users = await getUsers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuários</h1>
          <p className="text-slate-500 mt-1">{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <NewUserForm />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {users.map(user => {
          const role = roleLabels[user.role]
          return (
            <Card key={user.id} className={!user.active ? 'opacity-60' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg flex-shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{user.name}</p>
                      <p className="text-sm text-slate-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <Badge variant={role.variant}>{role.label}</Badge>
                    {!user.active && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <ToggleUserButton userId={user.id} active={user.active} userName={user.name} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {users.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">Nenhum usuário cadastrado</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
