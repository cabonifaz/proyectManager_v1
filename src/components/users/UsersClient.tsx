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

  const isSuperAdmin = role === 'super_admin'
  const canCreate    = isSuperAdmin
  const canEdit      = isSuperAdmin
  const canToggle    = isSuperAdmin

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
    if (!isSuperAdmin) return
    const action = user.active ? 'desactivar' : 'activar'
    if (!confirm(`¿${action} al usuario ${user.name}?`)) return
    try {
      const res  = await fetch(`/api/${tenant}/users/${user.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`Error: ${json.error}`)
        return 
      }
      fetchUsers()
    } catch (e) {
      alert(`Error de red`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          className="border rounded px-3 py-1.5 text-sm w-56 outline-none focus:ring-1 focus:ring-blue-500"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-1.5 text-sm outline-none"
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
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition-colors"
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
          <span>{fetchError}</span>
          <button onClick={fetchUsers} className="underline text-xs hover:text-red-900">Reintentar</button>
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
            ) : filtered.map(u => {
              // Limpiamos los proyectos nulos que genera el LEFT JOIN de la base de datos
              const validProjects = u.projects?.filter(p => p && p.project_id) || []
              
              return (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{u.name}</p>
                        {u.id === currentUserId && (
                          <span className="text-xs text-blue-500 font-medium">Tú</span>
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
                  <td className="px-4 py-3 text-xs">
                    {u.role !== 'super_admin' ? (
                      validProjects.length > 0 ? (
                        <button
                          onClick={() => setShowProjects(u)}
                          className="text-blue-600 hover:underline"
                        >
                          {validProjects.length} proyecto(s)
                        </button>
                      ) : (
                        <span className="text-gray-300 italic">Sin proyectos</span>
                      )
                    ) : (
                      <span className="text-purple-600 font-semibold italic">Acceso Total</span>
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
                    <div className="flex gap-2 justify-end">
                      {canEdit && (
                        <button
                          onClick={() => { setEditUser(u); setShowForm(true) }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Editar
                        </button>
                      )}
                      {isSuperAdmin && u.role !== 'super_admin' && (
                        <button
                          onClick={() => setShowProjects(u)}
                          className="text-green-600 hover:text-green-800 text-xs font-medium"
                        >
                          Asignar
                        </button>
                      )}
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
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <UserForm
          tenant={tenant}
          user={editUser}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchUsers() }}
        />
      )}

      {showProjects && (
        <UserProjectsModal
          tenant={tenant}
          user={showProjects}
          projects={projects}
          onClose={() => setShowProjects(null)}
          onSaved={() => { setShowProjects(null); fetchUsers() }}
          canManage={isSuperAdmin}
        />
      )}
    </div>
  )
}

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
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const url    = user ? `/api/${tenant}/users/${user.id}` : `/api/${tenant}/users`
      const method = user ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (res.ok) onSaved()
      else setError(json.error || 'Error al guardar')
    } catch (e) {
      setError('Error de conexión o servidor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">{user ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        
        {error && <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Nombre</label>
            <input required className="w-full border rounded px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Nombre completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Email</label>
            <input required type="email" className="w-full border rounded px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="correo@empresa.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Rol</label>
            <select className="w-full border rounded px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="super_admin">Super Admin</option>
              <option value="gestor_proyecto">Gestor de Proyecto</option>
              <option value="lider_tecnico">Líder Técnico</option>
              <option value="desarrollador">Desarrollador</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
              Contraseña {user && '(Dejar vacío para no cambiar)'}
            </label>
            <input type="password" title="password" className="w-full border rounded px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder={user ? "••••••••" : "Mínimo 8 caracteres"} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t mt-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 min-w-[120px]">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserProjectsModal({ tenant, user, projects, onClose, onSaved, canManage }: {
  tenant: string; user: AppUser; projects: Project[]
  onClose: () => void; onSaved: () => void; canManage: boolean
}) {
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedRole,     setSelectedRole]    = useState('desarrollador')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // LIMPIEZA CLAVE: Filtramos los objetos nulos o vacíos del JSON de MySQL
  const userProjects = (user.projects || []).filter(p => p && p.project_id)
  
  const assignedIds = new Set(userProjects.map(p => p.project_id))
  const available   = projects.filter(p => !assignedIds.has(p.id))

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/users/${user.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(selectedProject), role: selectedRole }),
      })
      if (res.ok) onSaved()
      else {
        const json = await res.json()
        setError(json.error || 'Error al asignar el proyecto')
      }
    } catch { 
      setError('Error de conexión o red')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(projectId: number) {
    if (!confirm('¿Quitar a este usuario del proyecto?')) return
    const res = await fetch(`/api/${tenant}/users/${user.id}/projects`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    if (res.ok) onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Proyectos: {user.name}</h2>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        
        {error && <div className="mb-4 p-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{error}</div>}
        
        <div className="space-y-2 mb-6 max-h-48 overflow-y-auto pr-1">
          {userProjects.length === 0 ? <p className="text-gray-400 italic text-sm text-center py-4">Sin proyectos asignados</p> : userProjects.map(p => (
            <div key={p.project_id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
              <span className="text-sm font-medium text-gray-700">{p.project_name} <span className="text-xs text-gray-400 font-mono">({p.project_code})</span></span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded uppercase border border-blue-100">{ROLE_LABELS[p.role] ?? p.role}</span>
                {canManage && <button onClick={() => handleRemove(p.project_id)} className="text-red-500 hover:text-red-700 text-xs hover:underline font-medium">Quitar</button>}
              </div>
            </div>
          ))}
        </div>

        {canManage && available.length > 0 && (
          <form onSubmit={handleAssign} className="border-t pt-5 space-y-4">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Asignar a nuevo proyecto</p>
            <div className="grid grid-cols-2 gap-3">
              <select required className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                <option value="">Seleccionar proyecto...</option>
                {available.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
              <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none bg-white" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                <option value="desarrollador">Desarrollador</option>
                <option value="lider_tecnico">Líder técnico</option>
                <option value="gestor_proyecto">Gestor de Proyecto</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" disabled={saving} className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </form>
        ) || (
          <div className="flex justify-end pt-4 border-t mt-4">
            <button onClick={onClose} className="px-6 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}