'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Role } from '@/lib/rbac'

interface Project {
  id: number
  code: string
  name: string
  description: string
  status: string
  start_date: string | null
  end_date: string | null
  manager_name: string | null
  total_backlog: number
  completed_backlog: number
  avg_progress: number
  completion_pct: number
  is_member: number
}

const STATUS_COLORS: Record<string, string> = {
  activo:     'bg-green-100 text-green-700',
  pausado:    'bg-yellow-100 text-yellow-700',
  completado: 'bg-blue-100 text-blue-700',
  archivado:  'bg-gray-100 text-gray-500',
}

function generateCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w.slice(0, 3))
    .join('-')
    .slice(0, 20)
}

export function ProjectsClient({ tenant, role, userId }: {
  tenant: string; role: Role; userId: number
}) {
  const [projects, setProjects]     = useState<Project[]>([])
  const [filtered, setFiltered]     = useState<Project[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editItem, setEditItem]     = useState<Project | null>(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [viewMode, setViewMode]     = useState<'grid' | 'list'>('grid')

  const isSuperAdmin = role === 'super_admin'
  const isGestor     = role === 'gestor_proyecto'
  const canCreate    = isSuperAdmin
  const canDelete    = isSuperAdmin

  // Lógica corregida: Solo super_admin o gestor_proyecto que sea miembro (is_member === 1)
  function canEditProject(p: Project): boolean {
    if (isSuperAdmin) return true
    if (isGestor && p.is_member === 1) return true
    return false
  }

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const res  = await fetch(`/api/${tenant}/projects`)
      const json = await res.json()
      if (!res.ok) {
        setFetchError(`Error ${res.status}: ${json.error ?? 'Error al cargar proyectos'}`)
        setProjects([])
      } else {
        setProjects(json.data ?? [])
      }
    } catch (e) {
      setFetchError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  useEffect(() => {
    let result = [...projects]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter) result = result.filter(p => p.status === statusFilter)
    setFiltered(result)
  }, [projects, search, statusFilter])

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este proyecto y todos sus datos?')) return
    try {
      const res  = await fetch(`/api/${tenant}/projects/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { alert(`Error al eliminar: ${json.error ?? res.status}`); return }
      fetchProjects()
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
          placeholder="Buscar por nombre o código..."
          className="border rounded px-3 py-1.5 text-sm w-56"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="pausado">Pausado</option>
          <option value="completado">Completado</option>
          <option value="archivado">Archivado</option>
        </select>

        <span className="text-xs text-gray-400">{filtered.length} proyecto(s)</span>

        <div className="flex gap-1 ml-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2 py-1 rounded text-xs border ${viewMode === 'grid' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500'}`}
          >
            ⊞ Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 rounded text-xs border ${viewMode === 'list' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500'}`}
          >
            ☰ Lista
          </button>
        </div>

        {canCreate && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            + Nuevo proyecto
          </button>
        )}
      </div>

      {/* Error */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between items-center">
          <span>{fetchError}</span>
          <button onClick={fetchProjects} className="underline text-xs ml-3">Reintentar</button>
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Cargando...</p>
      ) : filtered.length === 0 && !fetchError ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          {projects.length === 0 ? 'No hay proyectos aún' : 'Sin resultados para los filtros aplicados'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              tenant={tenant}
              canEdit={canEditProject(p)}
              canDelete={canDelete}
              onEdit={() => { setEditItem(p); setShowForm(true) }}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Gestor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Avance prom.</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Completados</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Inicio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fin</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.code}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{p.manager_name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${p.avg_progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{p.avg_progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {p.completion_pct}% ({p.completed_backlog}/{p.total_backlog})
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {p.start_date ? p.start_date.toString().slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {p.end_date ? p.end_date.toString().slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      {/* Botones restringidos en modo lista */}
                      {canEditProject(p) && (
                        <>
                          <a href={`/${tenant}/backlog?projectId=${p.id}`}
                            className="text-xs text-blue-600 hover:underline">Backlog</a>
                          <button
                            onClick={() => { setEditItem(p); setShowForm(true) }}
                            className="text-xs text-gray-600 hover:underline"
                          >
                            Editar
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <ProjectForm
          tenant={tenant}
          item={editItem}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchProjects() }}
        />
      )}
    </div>
  )
}

function ProjectCard({ project: p, tenant, canEdit, canDelete, onEdit, onDelete }: {
  project: Project
  tenant: string
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-mono text-gray-400">{p.code}</span>
          <h2 className="font-semibold text-gray-800">{p.name}</h2>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? ''}`}>
          {p.status}
        </span>
      </div>

      {p.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{p.description}</p>
      )}

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Avance promedio</span>
          <span>{p.avg_progress}%</span>
        </div>
        <div className="bg-gray-200 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${p.avg_progress}%` }} />
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <span>Items completados</span>
        <span className="font-medium text-gray-600">
          {p.completion_pct}% ({p.completed_backlog}/{p.total_backlog})
        </span>
      </div>

      <div className="text-xs text-gray-400 space-y-0.5">
        {p.manager_name && <p>Gestor: {p.manager_name}</p>}
        {p.start_date   && <p>Inicio: {p.start_date.toString().slice(0, 10)}</p>}
        {p.end_date     && <p>Fin: {p.end_date.toString().slice(0, 10)}</p>}
      </div>

      <div className="flex gap-3 pt-1 border-t">
        {/* Botones restringidos en modo card */}
        {canEdit && (
          <>
            <a href={`/${tenant}/backlog?projectId=${p.id}`}
              className="text-xs text-blue-600 hover:underline">Ver backlog</a>
            <button onClick={onEdit} className="text-xs text-gray-600 hover:underline">Editar</button>
          </>
        )}
        {canDelete && (
          <button onClick={onDelete} className="text-xs text-red-500 hover:underline ml-auto">Eliminar</button>
        )}
      </div>
    </div>
  )
}

function ProjectForm({ tenant, item, onClose, onSaved }: {
  tenant: string
  item: Project | null
  onClose: () => void
  onSaved: () => void
}) {
  const [autoCode, setAutoCode] = useState(!item)
  const [form, setForm] = useState({
    code:        item?.code        ?? '',
    name:        item?.name        ?? '',
    description: item?.description ?? '',
    status:      item?.status      ?? 'activo',
    start_date:  item?.start_date  ? item.start_date.toString().slice(0, 10) : '',
    end_date:    item?.end_date    ? item.end_date.toString().slice(0, 10)   : '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const url    = item ? `/api/${tenant}/projects/${item.id}` : `/api/${tenant}/projects`
      const method = item ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code:        form.code,
          name:        form.name,
          description: form.description || null,
          status:      form.status,
          startDate:   form.start_date  || null,
          endDate:     form.end_date    || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(`Error ${res.status}: ${json.error ?? 'Error al guardar'}`)
        setSaving(false)
        return
      }
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
          <h2 className="text-lg font-semibold">{item ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Nombre *</label>
            <input
              required
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.name}
              onChange={e => {
                const name = e.target.value
                setForm(f => ({
                  ...f,
                  name,
                  code: autoCode ? generateCode(name) : f.code,
                }))
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Código</label>
            <div className="flex gap-2">
              <input
                required
                className={`flex-1 border rounded px-2 py-1.5 text-sm font-mono ${autoCode ? 'bg-gray-50 text-gray-500' : ''}`}
                placeholder="Escribe el nombre para generar..."
                value={form.code}
                readOnly={autoCode}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => {
                  if (!autoCode) setForm(f => ({ ...f, code: generateCode(f.name) }))
                  setAutoCode(v => !v)
                }}
                className={`px-2 py-1 rounded text-xs border whitespace-nowrap transition-colors ${
                  autoCode
                    ? 'bg-blue-50 text-blue-600 border-blue-300 hover:bg-blue-100'
                    : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {autoCode ? '✎ Personalizar' : '↺ Auto'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Estado</label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            >
              <option value="activo">Activo</option>
              <option value="pausado">Pausado</option>
              <option value="completado">Completado</option>
              <option value="archivado">Archivado</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Descripción</label>
            <textarea
              rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Fecha inicio</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Fecha fin</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>

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