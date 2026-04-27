'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Role } from '@/lib/rbac'

// 1. AÑADIDO: is_member para el filtro del combo
interface Project { id: number; code: string; name: string; is_member?: number }
interface Member  { id: number; name: string; role: string }
interface Sprint {
  id: number; number: number; name: string; goal: string | null
  start_date: string | null; end_date: string | null; status: string
  total_items: number; completed_items: number; completion_pct: number
  days_remaining: number | null
}
interface TechCol { id: number; col_key: string; name: string; col_type: string }
interface TechVal { col_key: string; name: string; value: string; eta: string | null }
interface SprintItem {
  id: number; code: string; module: string; description: string
  progress: number; status: string; sprint_num: number | null
  eta: string | null; reg_date: string; comment: string
  tech_columns: TechVal[]
}

const STATUS_OPTIONS = [
  { val: 'pendiente',   label: 'Pendiente',   color: 'bg-gray-100 text-gray-700'    },
  { val: 'en_progreso', label: 'En progreso', color: 'bg-blue-100 text-blue-700'    },
  { val: 'en_revision', label: 'En revisión', color: 'bg-yellow-100 text-yellow-700'},
  { val: 'completado',  label: 'Completado',  color: 'bg-green-100 text-green-700'  },
  { val: 'bloqueado',   label: 'Bloqueado',   color: 'bg-red-100 text-red-700'      },
]

const STATUS_COLORS: Record<string, string> = {
  pendiente:   'bg-gray-100 text-gray-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  en_revision: 'bg-yellow-100 text-yellow-700',
  completado:  'bg-green-100 text-green-700',
  bloqueado:   'bg-red-100 text-red-700',
}

export function SprintClient({ projects, members, tenant, role, userId }: {
  projects: Project[]; members: Member[]; tenant: string; role: Role; userId: number
}) {
  // 2. CORRECCIÓN DEL COMBO: Filtramos solo los permitidos
  const allowedProjects = projects.filter(p => 
    role === 'super_admin' || Number(p.is_member) > 0
  )

  const [projectId, setProjectId]           = useState<number | null>(allowedProjects[0]?.id ?? null)
  const [sprints, setSprints]               = useState<Sprint[]>([])
  const [activeSprint, setActiveSprint]     = useState<Sprint | null>(null)
  const [items, setItems]                   = useState<SprintItem[]>([])
  const [techCols, setTechCols]             = useState<TechCol[]>([])
  const [loading, setLoading]               = useState(false)
  const [fetchError, setFetchError]         = useState('')
  const [statusFilters, setStatusFilters]   = useState<string[]>([])
  const [showSprintForm, setShowSprintForm] = useState(false)
  const [editItem, setEditItem]             = useState<SprintItem | null>(null)
  const [showItemForm, setShowItemForm]     = useState(false)
  const [viewComment, setViewComment]       = useState<{ code: string; comment: string } | null>(null)

  // 3. CORRECCIÓN DE PERMISO: Verificamos contra el proyecto actual
  const currentProject = allowedProjects.find(p => p.id === projectId)
  const canManageSprint = role === 'super_admin' || Number(currentProject?.is_member) > 0
  const canEditItem     = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)

  const fetchTechCols = useCallback(async () => {
    if (!projectId) return
    try {
      const res  = await fetch(`/api/${tenant}/projects/${projectId}/columns`)
      const json = await res.json()
      setTechCols((json.data ?? []).filter((c: TechCol) =>
        ['sprint','both'].includes(c.col_type)
      ))
    } catch { setTechCols([]) }
  }, [projectId, tenant])

  const fetchSprints = useCallback(async (): Promise<Sprint | null> => {
    if (!projectId) return null
    try {
      const res  = await fetch(`/api/${tenant}/sprints?projectId=${projectId}`)
      const json = await res.json()
      const list: Sprint[] = json.data ?? []
      setSprints(list)
      const active = list.find(s => s.status === 'activo') ?? null
      setActiveSprint(active)
      return active
    } catch { return null }
  }, [projectId, tenant])

  const fetchItems = useCallback(async (sprint?: Sprint | null) => {
    const sp = sprint !== undefined ? sprint : activeSprint
    if (!projectId || !sp) { setItems([]); return }
    setLoading(true)
    setFetchError('')
    try {
      const p = new URLSearchParams({
        projectId: String(projectId),
        sprintNum: String(sp.number),
      })
      if (statusFilters.length === 1) {
        p.set('status', statusFilters[0])
      } else if (statusFilters.length > 1) {
        statusFilters.forEach(s => p.append('status[]', s))
      }

      const res  = await fetch(`/api/${tenant}/backlog?${p}`)
      const json = await res.json()
      if (!res.ok) { setFetchError(`Error ${res.status}: ${json.error}`); return }

      setItems((json.data ?? []).map((item: SprintItem) => ({
        ...item,
        tech_columns: typeof item.tech_columns === 'string'
          ? JSON.parse(item.tech_columns)
          : (item.tech_columns ?? []),
      })))
    } catch (e) {
      setFetchError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    } finally {
      setLoading(false)
    }
  }, [projectId, activeSprint, statusFilters, tenant])

  useEffect(() => {
    async function loadAll() {
      await fetchTechCols()
      const active = await fetchSprints()
      await fetchItems(active)
    }
    loadAll()
  }, [projectId, tenant])

  useEffect(() => { fetchItems() }, [statusFilters])

  // Cálculos para la cabecera
  const completedItems = items.filter(i => i.status === 'completado').length
  const pct = items.length > 0 ? Math.round(completedItems / items.length * 100) : 0
  
  // Nuevos cálculos para los indicadores visuales
  const pendingItems = items.filter(i => i.status === 'pendiente').length
  const inProgressItems = items.filter(i => i.status === 'en_progreso').length
  const inReviewItems = items.filter(i => i.status === 'en_revision').length
  const blockedItems = items.filter(i => i.status === 'bloqueado').length

  function toggleStatus(val: string) {
    setStatusFilters(prev =>
      prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector proyecto corregido */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={projectId ?? ''}
          onChange={e => setProjectId(Number(e.target.value))}
        >
          {allowedProjects.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
          {allowedProjects.length === 0 && <option disabled>Sin proyectos permitidos</option>}
        </select>

        {activeSprint && (
          <span className="text-sm font-medium text-gray-700">
            Sprint #{activeSprint.number} — {activeSprint.name}
          </span>
        )}

        {canManageSprint && (
          <button
            onClick={() => setShowSprintForm(true)}
            className="ml-auto border px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50"
          >
            ⚙ Gestionar sprints
          </button>
        )}
      </div>

      {/* Header sprint activo con NUEVOS INDICADORES */}
      {activeSprint ? (
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                  Activo
                </span>
                <h2 className="font-semibold text-lg">
                  Sprint #{activeSprint.number} — {activeSprint.name}
                </h2>
              </div>
              {activeSprint.goal && (
                <p className="text-sm text-gray-500 mt-1">{activeSprint.goal}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
                {activeSprint.start_date && (
                  <span>Inicio: {activeSprint.start_date.toString().slice(0, 10)}</span>
                )}
                {activeSprint.end_date && (
                  <span>Fin: {activeSprint.end_date.toString().slice(0, 10)}</span>
                )}
                {activeSprint.days_remaining !== null && (
                  <span className={activeSprint.days_remaining < 0 ? 'text-red-500 font-medium' : ''}>
                    {activeSprint.days_remaining >= 0
                      ? `${activeSprint.days_remaining} días restantes`
                      : `Vencido hace ${Math.abs(activeSprint.days_remaining)} días`}
                  </span>
                )}
              </div>

              {/* AÑADIDO: Resumen rápido de estados para el Gestor */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                  <span className="text-gray-600">Pendientes: <strong>{pendingItems}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span className="text-blue-700">En progreso: <strong>{inProgressItems}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  <span className="text-yellow-700">En revisión: <strong>{inReviewItems}</strong></span>
                </div>
                {blockedItems > 0 && (
                  <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-2 py-0.5 rounded font-medium border border-red-100">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Bloqueados: <strong>{blockedItems}</strong>
                  </div>
                )}
              </div>

            </div>
            <div className="text-right min-w-32">
              <p className="text-4xl font-bold text-blue-600">{pct}%</p>
              <p className="text-xs text-gray-400 mt-1">{completedItems}/{items.length} completados</p>
              <div className="w-32 bg-gray-200 rounded-full h-2 mt-2 ml-auto">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-400 mb-3">No hay sprint activo para este proyecto</p>
          {canManageSprint && (
            <button
              onClick={() => setShowSprintForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
            >
              + Crear sprint
            </button>
          )}
        </div>
      )}

      {/* Items del sprint */}
      {activeSprint && (
        <>
          {/* Filtros */}
          <div className="bg-white rounded-lg shadow px-4 py-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Estado:</span>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.val}
                  onClick={() => toggleStatus(s.val)}
                  className={`px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                    statusFilters.includes(s.val)
                      ? `${s.color} border-current shadow-sm`
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              {statusFilters.length > 0 && (
                <button
                  onClick={() => setStatusFilters([])}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Limpiar
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">{items.length} item(s)</span>
            </div>
          </div>

          {/* Error */}
          {fetchError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
              <span>{fetchError}</span>
              <button onClick={() => fetchItems()} className="underline text-xs">Reintentar</button>
            </div>
          )}

          {/* Tabla */}
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Código</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Módulo</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 min-w-48">Descripción</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Avance</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Estado</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">ETA</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Fec. Reg</th>
                  {techCols.map(c => (
                    <th key={c.col_key}
                      className="px-3 py-3 text-left font-medium text-blue-600 whitespace-nowrap">
                      {c.name}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Comentario</th>
                  <th className="px-3 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={99} className="px-3 py-10 text-center text-gray-400">Cargando...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={99} className="px-3 py-10 text-center text-gray-400">
                    No hay items asignados al Sprint #{activeSprint.number} en el backlog
                  </td></tr>
                ) : items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{item.code}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{item.module || '—'}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <span className="line-clamp-2 block">{item.description}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1 w-24">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${item.progress}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{item.progress}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {item.eta ? item.eta.toString().slice(0, 10) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {item.reg_date ? item.reg_date.toString().slice(0, 10) : '—'}
                    </td>
                    {techCols.map(col => {
                      const val = item.tech_columns?.find(t => t.col_key === col.col_key)
                      return (
                        <td key={col.col_key} className="px-3 py-2 text-xs">
                          <div className="text-gray-700 whitespace-nowrap">{val?.value || '—'}</div>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-xs">
                      {item.comment ? (
                        <button
                          onClick={() => setViewComment({ code: item.code, comment: item.comment })}
                          className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors whitespace-nowrap"
                        >
                          Ver nota
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {canEditItem && (
                        <button
                          onClick={() => { setEditItem(item); setShowItemForm(true) }}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal gestionar sprints */}
      {showSprintForm && projectId && (
        <SprintManager
          tenant={tenant}
          projectId={projectId}
          sprints={sprints}
          onClose={() => setShowSprintForm(false)}
          onSaved={async () => {
            setShowSprintForm(false)
            const active = await fetchSprints()
            fetchItems(active)
          }}
        />
      )}

      {/* Modal editar item */}
      {showItemForm && editItem && (
        <SprintItemForm
          tenant={tenant}
          item={editItem}
          techCols={techCols}
          members={members}
          onClose={() => { setShowItemForm(false); setEditItem(null) }}
          onSaved={() => { setShowItemForm(false); setEditItem(null); fetchItems() }}
        />
      )}

      {/* Modal comentario */}
      {viewComment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 font-mono">{viewComment.code}</p>
                <h2 className="text-base font-semibold">Comentario</h2>
              </div>
              <button onClick={() => setViewComment(null)}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 border leading-relaxed">
              {viewComment.comment}
            </p>
            <div className="flex justify-end mt-4">
              <button onClick={() => setViewComment(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sprint Item Form ─────────────────────────────────────────────────────────

function SprintItemForm({ tenant, item, techCols, members, onClose, onSaved }: {
  tenant: string
  item: SprintItem
  techCols: TechCol[]
  members: Member[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    progress: item.progress,
    status:   item.status,
    eta:      item.eta ? item.eta.toString().slice(0, 10) : '',
    comment:  item.comment ?? '',
  })

  const [techVals, setTechVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    techCols.forEach(col => {
      const existing = item.tech_columns?.find(t => t.col_key === col.col_key)
      init[col.col_key] = existing?.value ?? ''
    })
    return init
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/backlog/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module:      item.module      || null,
          description: item.description || null,
          progress:    Number(form.progress),
          status:      form.status,
          sprintNum:   item.sprint_num  || null,
          eta:         form.eta         || null,
          comment:     form.comment     || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`Error ${res.status}: ${json.error}`); setSaving(false); return }

      // Guardar columnas tech
      const techErrors: string[] = []
      await Promise.all(
        techCols.map(async col => {
          const val = techVals[col.col_key]
          if (!val) return
          const r = await fetch(`/api/${tenant}/backlog/${item.id}/tech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columnId: col.id, value: val || null, eta: null }),
          })
          if (!r.ok) {
            const rj = await r.json()
            techErrors.push(`${col.name}: ${rj.error}`)
          }
        })
      )

      if (techErrors.length > 0) {
        setError(`Guardado con errores en columnas: ${techErrors.join(', ')}`)
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Actualizar item del sprint</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <p className="text-xs text-gray-400 font-mono mb-4">
          {item.code} — {item.description}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Estado</label>
              <select className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="en_revision">En revisión</option>
                <option value="completado">Completado</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Avance %</label>
              <input type="number" min={0} max={100}
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.progress}
                onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ETA</label>
              <input type="date" className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.eta}
                onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} />
            </div>
          </div>

          {techCols.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Tecnologías / Responsables
              </p>
              <div className="grid grid-cols-2 gap-3">
                {techCols.map(col => (
                  <div key={col.col_key} className="border rounded p-3 bg-gray-50">
                    <label className="block text-xs font-medium text-gray-700 mb-1">{col.name}</label>
                    <input
                      placeholder="Responsable / valor"
                      className="w-full border rounded px-2 py-1 text-xs bg-white"
                      value={techVals[col.col_key] ?? ''}
                      onChange={e => setTechVals(v => ({ ...v, [col.col_key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">Comentario</label>
            <textarea rows={3} className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
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

// ─── Sprint Manager ───────────────────────────────────────────────────────────

function SprintManager({ tenant, projectId, sprints, onClose, onSaved }: {
  tenant: string; projectId: number; sprints: Sprint[]
  onClose: () => void; onSaved: () => void
}) {
  const nextNum = sprints.length > 0 ? Math.max(...sprints.map(s => s.number)) + 1 : 1
  const [form, setForm] = useState({
    number:     String(nextNum),
    name:       '',
    goal:       '',
    start_date: '',
    end_date:   '',
    status:     'planificado',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId:  projectId,
          number:     Number(form.number),
          name:       form.name,
          goal:       form.goal       || null,
          startDate:  form.start_date || null,
          endDate:    form.end_date   || null,
          status:     form.status,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`Error ${res.status}: ${json.error}`); setSaving(false); return }
      onSaved()
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setSaving(false)
    }
  }

  async function handleActivate(sprint: Sprint) {
    try {
      const res = await fetch(`/api/${tenant}/sprints/${sprint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'activo' }),
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Gestionar sprints</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Sprints del proyecto
          </p>
          {sprints.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin sprints creados</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {sprints.map(s => (
                <div key={s.id}
                  className="flex items-center justify-between px-3 py-2.5 border rounded text-sm hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">#{s.number}</span>
                    <span className="font-medium">{s.name}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      s.status === 'activo'     ? 'bg-green-100 text-green-700' :
                      s.status === 'completado' ? 'bg-blue-100 text-blue-700'  :
                      s.status === 'cancelado'  ? 'bg-red-100 text-red-700'    :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {s.completion_pct}% — {s.total_items} items
                    </span>
                    {s.status === 'activo' ? (
                      <span className="text-xs text-green-600 font-medium">● Activo</span>
                    ) : s.status !== 'cancelado' ? (
                      <button
                        onClick={() => handleActivate(s)}
                        className="text-xs text-green-600 hover:underline font-medium"
                      >
                        Activar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Crear nuevo sprint
          </p>

          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Número *</label>
                <input required type="number"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  value={form.number}
                  onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Estado inicial</label>
                <select className="w-full border rounded px-2 py-1.5 text-sm"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="planificado">Planificado</option>
                  <option value="activo">Activo (reemplaza al actual)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Nombre *</label>
              <input required className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="ej: Sprint 2 — Módulo de pagos"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Objetivo</label>
              <textarea rows={2} className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="¿Qué se espera lograr en este sprint?"
                value={form.goal}
                onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Fecha inicio</label>
                <input type="date" className="w-full border rounded px-2 py-1.5 text-sm"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Fecha fin</label>
                <input type="date" className="w-full border rounded px-2 py-1.5 text-sm"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cerrar</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creando...' : 'Crear sprint'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}