'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Role } from '@/lib/rbac'

interface Project { id: number; code: string; name: string }
interface UserProject { project_id: number; project_name: string; project_code: string; role: string }
interface AppUser {
  id: number; name: string; email: string; role: string
  active: number; last_login: string | null; created_at: string
  projects: UserProject[]
}

const ROLE_LABELS: Record<string, string> = {
  super_admin:      'Super Admin',
  gestor_proyecto:  'Gestor',
  lider_tecnico:    'Líder técnico',
  desarrollador:    'Desarrollador',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin:     'bg-purple-100 text-purple-700',
  gestor_proyecto: 'bg-blue-100 text-blue-700',
  lider_tecnico:   'bg-teal-100 text-teal-700',
  desarrollador:   'bg-gray-100 text-gray-700',
}

export function UsersClient({ projects, tenant, role, currentUserId }: {
  projects: Project[]; tenant: string; role: Role; currentUserId: number
}) {
  const [users, setUsers]           = useState<AppUser[]>([])
  const [filtered, setFiltered]     = useState<AppUser[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editUser, setEditUser]     = useState<AppUser | null>(null)
  const [showProjects, setShowProjects] = useState<AppUser | null>(null)

  const canCreate = ['super_admin','gestor_proyecto'].includes(role)
  const canEdit   = ['super_admin','gestor_proyecto'].includes(role)
  const canToggle = ['super_admin'].includes(role)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const res  = await fetch(`/api/${tenant}/users`)
      const json = await res.json()
      if (!res.ok) { setFetchError(`Error ${res.status}: ${json.error}`); return }
      setUsers(json.data ?? [])
    } catch (e) {
      setFetchError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    let result = [...users]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      )
    }
    if (roleFilter) result = result.filter(u => u.role === roleFilter)
    setFiltered(result)
  }, [users, search, roleFilter])

  async function handleToggle(user: AppUser) {
    const action = user.active ? 'desactivar' : 'activar'
    if (!confirm(`¿${action} al usuario ${user.name}?`)) return
    try {
      const res  = await fetch(`/api/${tenant}/users/${user.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) { alert(`Error: ${json.error}`); return }
      // Si se activa, usar PATCH
      if (!user.active) {
        await fetch(`/api/${tenant}/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: 1 }),
        })
      }
      fetchUsers()
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          className="border rounded px-3 py-1.5 text-sm w-56"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">Todos los roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="gestor_proyecto">Gestor</option>
          <option value="lider_tecnico">Líder técnico</option>
          <option value="desarrollador">Desarrollador</option>
        </select>
        <span className="text-xs text-gray-400">{filtered.length} usuario(s)</span>
        {canCreate && (
          <button
            onClick={() => { setEditUser(null); setShowForm(true) }}
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
          <span>{fetchError}</span>
          <button onClick={fetchUsers} className="underline text-xs">Reintentar</button>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Rol</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Proyectos</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Último login</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Sin usuarios</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{u.name}</p>
                      {u.id === currentUserId && (
                        <span className="text-xs text-blue-500">Tú</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? ''}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.projects.length > 0 ? (
                    <button
                      onClick={() => setShowProjects(u)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {u.projects.length} proyecto(s)
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">Sin proyectos</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {u.last_login ? u.last_login.toString().slice(0, 16).replace('T', ' ') : 'Nunca'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {canEdit && (
                      <button
                        onClick={() => { setEditUser(u); setShowForm(true) }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => setShowProjects(u)}
                      className="text-green-600 hover:underline text-xs"
                    >
                      Proyectos
                    </button>
                    {canToggle && u.id !== currentUserId && (
                      <button
                        onClick={() => handleToggle(u)}
                        className={`text-xs hover:underline ${u.active ? 'text-red-500' : 'text-gray-500'}`}
                      >
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal form usuario */}
      {showForm && (
        <UserForm
          tenant={tenant}
          user={editUser}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchUsers() }}
        />
      )}

      {/* Modal proyectos del usuario */}
      {showProjects && (
        <UserProjectsModal
          tenant={tenant}
          user={showProjects}
          projects={projects}
          onClose={() => setShowProjects(null)}
          onSaved={() => { setShowProjects(null); fetchUsers() }}
        />
      )}
    </div>
  )
}

// ─── User Form ────────────────────────────────────────────────────────────────

function UserForm({ tenant, user, onClose, onSaved }: {
  tenant: string; user: AppUser | null
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    name:     user?.name     ?? '',
    email:    user?.email    ?? '',
    role:     user?.role     ?? 'desarrollador',
    password: '',
    active:   user?.active   ?? 1,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!user && !form.password) {
      setError('La contraseña es requerida para nuevos usuarios')
      setSaving(false)
      return
    }

    try {
      const url    = user ? `/api/${tenant}/users/${user.id}` : `/api/${tenant}/users`
      const method = user ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        name:  form.name,
        email: form.email,
        role:  form.role,
      }
      if (form.password) body.password = form.password
      if (user) body.active = form.active

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(`Error ${res.status}: ${json.error}`); setSaving(false); return }
      onSaved()
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{user ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Nombre *</label>
            <input required className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email *</label>
            <input required type="email" className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Rol</label>
            <select className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="desarrollador">Desarrollador</option>
              <option value="lider_tecnico">Líder técnico</option>
              <option value="gestor_proyecto">Gestor de proyecto</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              {user ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
            </label>
            <input type="password" className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder={user ? '••••••••' : 'Mínimo 8 caracteres'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={form.active === 1}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))} />
              <label htmlFor="active" className="text-xs font-medium">Usuario activo</label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── User Projects Modal ──────────────────────────────────────────────────────

function UserProjectsModal({ tenant, user, projects, onClose, onSaved }: {
  tenant: string; user: AppUser; projects: Project[]
  onClose: () => void; onSaved: () => void
}) {
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedRole,    setSelectedRole]    = useState('desarrollador')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const assignedIds = new Set(user.projects.map(p => p.project_id))
  const available   = projects.filter(p => !assignedIds.has(p.id))

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProject) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/users/${user.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(selectedProject), role: selectedRole }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`Error: ${json.error}`); setSaving(false); return }
      onSaved()
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setSaving(false)
    }
  }

  async function handleRemove(projectId: number) {
    if (!confirm('¿Quitar al usuario de este proyecto?')) return
    try {
      const res = await fetch(`/api/${tenant}/users/${user.id}/projects`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const json = await res.json()
      if (!res.ok) { alert(`Error: ${json.error}`); return }
      onSaved()
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Proyectos asignados</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{user.name} — {user.email}</p>

        {/* Proyectos actuales */}
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Proyectos actuales ({user.projects.length})
          </p>
          {user.projects.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin proyectos asignados</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {user.projects.map(p => (
                <div key={p.project_id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">{p.project_code}</span>
                    <span className="font-medium">{p.project_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{ROLE_LABELS[p.role] ?? p.role}</span>
                    <button
                      onClick={() => handleRemove(p.project_id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asignar nuevo proyecto */}
        {available.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Asignar a proyecto
            </p>

            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">{error}</div>
            )}

            <form onSubmit={handleAssign} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Proyecto *</label>
                <select required className="w-full border rounded px-2 py-1.5 text-sm"
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}>
                  <option value="">Selecciona un proyecto</option>
                  {available.map(p => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Rol en el proyecto</label>
                <select className="w-full border rounded px-2 py-1.5 text-sm"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}>
                  <option value="desarrollador">Desarrollador</option>
                  <option value="lider_tecnico">Líder técnico</option>
                  <option value="gestor_proyecto">Gestor de proyecto</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cerrar</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Asignando...' : 'Asignar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {available.length === 0 && (
          <div className="border-t pt-4 flex justify-end">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}