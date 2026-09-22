'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Role } from '@/lib/rbac'
import { higherRole } from '@/lib/rbac'

interface Project {
  id: number
  code: string
  name: string
  description: string
  status: string
  methodology: string
  start_date: string | null
  end_date: string | null
  manager_name: string | null
  total_backlog: number
  completed_backlog: number
  avg_progress: number
  completion_pct: number
  is_member: number
  member_role: Role | null
  obs_total: number
  obs_completadas: number
  tenant_name: string | null
  tenant_slug: string | null
  logo_url: string | null
  color_hex: string | null
}

interface User {
  id: number
  name: string
  email: string
  role: string
}

const STATUS_COLORS: Record<string, string> = {
  activo:     'bg-green-100 text-green-700',
  pausado:    'bg-yellow-100 text-yellow-700',
  completado: 'bg-blue-100 text-blue-700',
  archivado:  'bg-gray-100 text-gray-500',
}

const METHODOLOGY_COLORS: Record<string, string> = {
  scrum:           'bg-blue-50 text-blue-600 border border-blue-200',
  waterfall:       'bg-indigo-50 text-indigo-600 border border-indigo-200',
  scrumxwaterfall: 'bg-purple-50 text-purple-600 border border-purple-200',
}

const METHODOLOGY_LABELS: Record<string, string> = {
  scrum:           'Scrum',
  waterfall:       'Waterfall',
  scrumxwaterfall: 'Híbrido',
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
  const router = useRouter()
  const [projects, setProjects]     = useState<Project[]>([])
  const [filtered, setFiltered]     = useState<Project[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editItem, setEditItem]     = useState<Project | null>(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [viewMode, setViewMode]     = useState<'grid' | 'list'>('grid')

  // 🚀 ESTADO NUEVO: Control del Modal de Miembros
  const [membersModalProject, setMembersModalProject] = useState<Project | null>(null)
  const [migrateProject, setMigrateProject] = useState<Project | null>(null)

  const isSuperAdmin = role === 'super_admin'
  const isGestor     = role === 'gestor_proyecto'
  const canCreate    = isSuperAdmin
  const canDelete    = isSuperAdmin

  function canEditProject(p: Project): boolean {
    if (isSuperAdmin) return true
    const effectiveRole = p.member_role ? higherRole(role, p.member_role) : role
    if (['gestor_proyecto'].includes(effectiveRole) && (isGestor || p.is_member === 1 || !!p.member_role)) return true
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
      
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    }
  }

  function handleGoToBoard(project: Project) {
    if (project.methodology === 'waterfall' || project.methodology === 'scrumxwaterfall') {
      router.push(`/${tenant}/waterfall?projectId=${project.id}`)
    } else {
      router.push(`/${tenant}/backlog?projectId=${project.id}`)
    }
  }

  function handleGoToObs(project: Project) {
    router.push(`/${tenant}/observaciones?projectId=${project.id}`)
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
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 font-medium shadow-sm transition-colors"
          >
            + Nuevo proyecto
          </button>
        )}
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between items-center">
          <span>{fetchError}</span>
          <button onClick={fetchProjects} className="underline text-xs ml-3">Reintentar</button>
        </div>
      )}

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
              canEdit={canEditProject(p)}
              canDelete={canDelete}
              onGoToBoard={() => handleGoToBoard(p)}
              onGoToObs={() => handleGoToObs(p)}
              onOpenMembers={() => setMembersModalProject(p)} // 🚀 Abrir modal
              onEdit={() => { setEditItem(p); setShowForm(true) }}
              onDelete={() => handleDelete(p.id)}
              onMigrate={isSuperAdmin ? () => setMigrateProject(p) : undefined}
              ownTenant={tenant}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="max-h-[calc(100vh-260px)] overflow-auto rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Metodología</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Gestor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Avance prom.</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Completados</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Inicio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fin</th>
                <th className="px-4 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.code}</td>
                  <td className="px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" className="w-5 h-5 rounded object-contain border border-gray-100 shrink-0" />
                      ) : p.color_hex ? (
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color_hex }} />
                      ) : null}
                      <span>{p.name}</span>
                      {p.tenant_slug && (isSuperAdmin || p.tenant_slug !== tenant) && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
                          {p.tenant_name ?? p.tenant_slug}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${METHODOLOGY_COLORS[p.methodology] ?? METHODOLOGY_COLORS['scrum']}`}>
                      {METHODOLOGY_LABELS[p.methodology] ?? 'Scrum'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{p.manager_name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${p.avg_progress}%` }} />
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
                    <div className="flex gap-3 justify-end items-center">
                      {p.obs_total > 0 && (
                        <button onClick={() => handleGoToObs(p)}
                          className="text-[11px] text-orange-600 font-bold hover:text-orange-800 transition-colors bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded">
                          OBS ({p.obs_total - p.obs_completadas})
                        </button>
                      )}
                      
                      {canEditProject(p) && (
                        <>
                          <button onClick={() => setMembersModalProject(p)} className="text-xs text-indigo-600 hover:underline font-medium">👥 Miembros</button>
                          <button onClick={() => handleGoToBoard(p)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Ver {p.methodology === 'scrum' ? 'Backlog' : 'Gantt'}
                          </button>
                          <button onClick={() => { setEditItem(p); setShowForm(true) }} className="text-xs text-gray-600 hover:underline">Editar</button>
                        </>
                      )}
                      {isSuperAdmin && (
                        <button onClick={() => setMigrateProject(p)} className="text-xs text-purple-600 hover:underline whitespace-nowrap">Mover a otra empresa</button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

      {/* 🚀 MODAL NUEVO: Gestor de Miembros */}
      {membersModalProject && (
        <ProjectMembersModal
          tenant={tenant}
          project={membersModalProject}
          onClose={() => setMembersModalProject(null)}
        />
      )}

      {migrateProject && (
        <MigrateTenantModal
          project={migrateProject}
          onClose={() => setMigrateProject(null)}
          onSaved={() => { setMigrateProject(null); fetchProjects() }}
        />
      )}
    </div>
  )
}

// ── Modal: mover proyecto a otra empresa ────────────────────────────────────
function MigrateTenantModal({ project, onClose, onSaved }: {
  project: Project; onClose: () => void; onSaved: () => void
}) {
  const [tenants, setTenants] = useState<{ id: number; name: string; slug: string }[]>([])
  const [tenantId, setTenantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then(res => res.json())
      .then(json => setTenants((json.data ?? []).filter((t: any) => t.slug !== project.tenant_slug)))
      .catch(() => setError('No se pudo cargar la lista de empresas'))
      .finally(() => setLoading(false))
  }, [project.tenant_slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/migrate-tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: Number(tenantId) }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al mover el proyecto'); setSaving(false); return }
      onSaved()
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">Mover a otra empresa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            <strong>{project.name}</strong> pasará a pertenecer a la empresa que elijas. Los usuarios ya asignados a este proyecto conservan su acceso, aunque sean de la empresa {project.tenant_name ?? 'actual'}.
          </p>
          {error && <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm font-medium">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <select
              required
              disabled={loading}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
            >
              <option value="">{loading ? 'Cargando empresas...' : 'Selecciona una empresa...'}</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
            </select>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors">Cancelar</button>
              <button type="submit" disabled={saving || !tenantId} className="px-5 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg shadow hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {saving ? 'Moviendo...' : 'Mover proyecto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Componente Tarjeta ────────────────────────────────────────────────────────
function ProjectCard({ project: p, canEdit, canDelete, onGoToBoard, onGoToObs, onOpenMembers, onEdit, onDelete, onMigrate, ownTenant }: {
  project: Project
  canEdit: boolean
  canDelete: boolean
  onGoToBoard: () => void
  onGoToObs: () => void
  onOpenMembers: () => void
  onEdit: () => void
  onDelete: () => void
  onMigrate?: () => void
  ownTenant: string
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5 flex flex-col gap-3 hover:shadow-md transition-shadow relative overflow-hidden">
      {p.color_hex ? (
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: p.color_hex }}></div>
      ) : (
        <div className={`absolute top-0 left-0 w-1 h-full ${p.methodology === 'scrum' ? 'bg-blue-400' : p.methodology === 'waterfall' ? 'bg-indigo-400' : 'bg-purple-400'}`}></div>
      )}

      <div className="flex items-start justify-between pl-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {p.logo_url && (
            <img src={p.logo_url} alt="" className="w-9 h-9 rounded object-contain border border-gray-100 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-mono text-gray-400">{p.code}</span>
              {p.tenant_slug && (p.tenant_slug !== ownTenant) && (
                <span className="text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded" title="Este proyecto pertenece a otra empresa">
                  {p.tenant_name ?? p.tenant_slug}
                </span>
              )}
            </div>
            <h2 className="font-semibold text-gray-800 leading-tight">{p.name}</h2>

            <div className="flex gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${METHODOLOGY_COLORS[p.methodology] ?? METHODOLOGY_COLORS['scrum']}`}>
                {METHODOLOGY_LABELS[p.methodology] ?? 'Scrum'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${STATUS_COLORS[p.status] ?? ''}`}>
                {p.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {p.description && (
        <p className="text-sm text-gray-500 line-clamp-2 pl-2">{p.description}</p>
      )}

      <div className="space-y-1 pl-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Avance promedio</span>
          <span>{p.avg_progress}%</span>
        </div>
        <div className="bg-gray-200 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${p.avg_progress}%` }} />
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400 pl-2">
        <span>Items completados</span>
        <span className="font-medium text-gray-600">
          {p.completion_pct}% ({p.completed_backlog}/{p.total_backlog})
        </span>
      </div>

      {(() => {
        const obsTotal       = Number(p.obs_total) || 0;
        const obsCompletadas = Number(p.obs_completadas) || 0;
        const obsPct         = obsTotal > 0 ? Math.round((obsCompletadas / obsTotal) * 100) : 0;
        const obsAbiertas    = obsTotal - obsCompletadas;

        return (
          <div className="mt-2 pt-3 border-t border-gray-100 space-y-1 pl-2">
            {obsTotal > 0 ? (
              <>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resolución de Obs.</span>
                  <button onClick={onGoToObs} className="text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-2 py-0.5 rounded transition-colors uppercase tracking-widest">
                    Ver Detalle ›
                  </button>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-orange-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${obsPct}%` }} />
                </div>
                <div className="flex justify-between text-[10px] mt-1 text-gray-400">
                  <span>{obsCompletadas} de {obsTotal} resueltas</span>
                  <span className="text-orange-600 font-bold">{obsAbiertas} abierta{obsAbiertas !== 1 ? 's' : ''}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between items-center text-[10px] text-gray-400 italic">
                <span className="uppercase font-bold tracking-widest">Resolución de Obs.</span>
                <span>Sin observaciones</span>
              </div>
            )}
          </div>
        );
      })()}

      <div className="text-[11px] text-gray-400 space-y-0.5 pl-2 mt-1">
        {p.manager_name && <p><span className="font-medium">Gestor:</span> {p.manager_name}</p>}
        <div className="flex gap-4">
          {p.start_date   && <p><span className="font-medium">Inicio:</span> {p.start_date.toString().slice(0, 10)}</p>}
          {p.end_date     && <p><span className="font-medium">Fin:</span> {p.end_date.toString().slice(0, 10)}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-3 border-t mt-auto pl-2 items-center">
        {canEdit && (
          <>
            <button onClick={onOpenMembers} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider bg-indigo-50 px-2 py-1 rounded">👥 Miembros</button>
            <button onClick={onGoToBoard} className="text-xs text-blue-600 font-bold hover:text-blue-800 transition-colors uppercase tracking-wider">
              Ver {p.methodology === 'scrum' ? 'Backlog' : 'Gantt'}
            </button>
            <button onClick={onEdit} className="text-xs text-gray-500 hover:text-gray-800 transition-colors font-medium">Editar</button>
          </>
        )}
        {onMigrate && (
          <button onClick={onMigrate} className="text-xs text-purple-500 hover:text-purple-700 transition-colors font-medium">Mover</button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium ml-auto">Eliminar</button>
        )}
      </div>
    </div>
  )
}

// ── Componente Formulario Edición de Proyectos ──────────────────────────────────
function ProjectForm({ tenant, item, onClose, onSaved }: {
  tenant: string; item: Project | null; onClose: () => void; onSaved: () => void
}) {
  const [autoCode, setAutoCode] = useState(!item)
  const [form, setForm] = useState({
    code:        item?.code        ?? '',
    name:        item?.name        ?? '',
    description: item?.description ?? '',
    status:      item?.status      ?? 'activo',
    methodology: item?.methodology ?? 'scrum',
    start_date:  item?.start_date  ? item.start_date.toString().slice(0, 10) : '',
    end_date:    item?.end_date    ? item.end_date.toString().slice(0, 10)   : '',
    colorHex:    item?.color_hex   ?? '#2563eb',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(item?.logo_url ?? null)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      setLogoDataUrl(result)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const url    = item ? `/api/${tenant}/projects/${item.id}` : `/api/${tenant}/projects`
      const method = item ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        code:        form.code,
        name:        form.name,
        description: form.description || null,
        status:      form.status,
        methodology: form.methodology,
        startDate:   form.start_date  || null,
        endDate:     form.end_date    || null,
        colorHex:    form.colorHex,
      }
      if (logoDataUrl) body.logoDataUrl = logoDataUrl

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">{item ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>

        <div className="p-6">
          {error && <div className="mb-5 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm font-medium">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre *</label>
              <input
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm(f => ({ ...f, name, code: autoCode ? generateCode(name) : f.code }))
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Código</label>
              <div className="flex gap-2">
                <input
                  required
                  className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-shadow ${autoCode ? 'bg-gray-100 text-gray-500' : ''}`}
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
                  className={`px-3 py-1.5 rounded-lg text-xs border whitespace-nowrap transition-colors font-medium ${autoCode ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                  {autoCode ? '✎ Personalizar' : '↺ Auto'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Metodología</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  value={form.methodology}
                  onChange={e => setForm(f => ({ ...f, methodology: e.target.value }))}
                >
                  <option value="scrum">Scrum (Clásico)</option>
                  <option value="waterfall">Waterfall (Gantt)</option>
                  <option value="scrumxwaterfall">Híbrido (Ambos)</option>
                </select>
              </div> */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Estado</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="activo">Activo</option>
                  <option value="pausado">Pausado</option>
                  <option value="completado">Completado</option>
                  <option value="archivado">Archivado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Descripción</label>
              <textarea
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-shadow"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fecha inicio</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-700"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fecha fin</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-700"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Logo / ícono</label>
                <div className="flex items-center gap-2">
                  {logoPreview && <img src={logoPreview} alt="Logo" className="w-9 h-9 rounded object-contain border shrink-0" />}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="text-xs w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                    className="w-9 h-9 rounded border cursor-pointer shrink-0"
                  />
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-5 mt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors">Cancelar</button>
              <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg shadow hover:bg-blue-700 disabled:opacity-50 transition-colors">{saving ? 'Guardando...' : 'Guardar Proyecto'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Componente Nuevo Modal Miembros del Proyecto ──────────────────────────────────
function ProjectMembersModal({ tenant, project, onClose }: {
  tenant: string; project: Project; onClose: () => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        // Obtenemos a TODOS los usuarios del sistema
        const resUsers = await fetch(`/api/${tenant}/users`)
        const jsonUsers = await resUsers.json()
        
        // Obtenemos solo a los asignados a este proyecto
        const resMembers = await fetch(`/api/${tenant}/projects/${project.id}/members`)
        const jsonMembers = await resMembers.json()

        if (resUsers.ok && resMembers.ok) {
          setUsers(jsonUsers.data ?? [])
          // Pre-marcamos a los que ya están en el proyecto
          const memberIds = (jsonMembers.data ?? []).map((m: any) => m.user_id)
          setSelectedIds(memberIds)
        } else {
          setError('Error al cargar datos del sistema')
        }
      } catch {
        setError('Error de conexión')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [tenant, project.id])

  const toggleUser = (userId: number) => {
    setSelectedIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/projects/${project.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedIds })
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Error al guardar miembros')
        setSaving(false)
        return
      }
      onClose()
    } catch {
      setError('Error de red al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Miembros del Proyecto</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{project.code} — {project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm font-medium">{error}</div>}

          {loading ? (
            <p className="text-center text-sm text-gray-400 py-10">Cargando usuarios...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10 italic">No hay usuarios registrados en el sistema.</p>
          ) : (
            <div className="space-y-2">
              {users.map(user => {
                const isSelected = selectedIds.includes(user.id)
                return (
                  <label 
                    key={user.id} 
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                      isSelected ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                      checked={isSelected}
                      onChange={() => toggleUser(user.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>{user.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 bg-white px-2 py-1 border rounded shadow-sm">
                      {user.role.replace('_', ' ')}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0">
          <button onClick={onClose} disabled={saving} className="px-5 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving || loading} className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg shadow hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando...' : `Asignar ${selectedIds.length} miembro(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}