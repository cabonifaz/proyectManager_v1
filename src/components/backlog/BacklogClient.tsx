'use client'
import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { ImportModal } from './ImportModal'
import type { Role } from '@/lib/rbac'

interface Project { id: number; code: string; name: string }
interface TechCol  { id: number; col_key: string; name: string; col_type: string; sort_order: number }
interface TechVal  { col_key: string; name: string; value: string; eta: string | null }
interface BacklogItem {
  id: number; code: string; module: string; description: string
  progress: number; status: string; sprint_num: number | null
  eta: string | null; reg_date: string; comment: string
  tech_columns: TechVal[]
}

const STATUS_COLORS: Record<string, string> = {
  pendiente:   'bg-gray-100 text-gray-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  en_revision: 'bg-yellow-100 text-yellow-700',
  completado:  'bg-green-100 text-green-700',
  bloqueado:   'bg-red-100 text-red-700',
}

export function BacklogClient({ projects, tenant, role }: {
  projects: Project[]; tenant: string; role: Role
}) {
  const [projectId, setProjectId]         = useState<number | null>(projects[0]?.id ?? null)
  const [items, setItems]                 = useState<BacklogItem[]>([])
  const [techCols, setTechCols]           = useState<TechCol[]>([])
  const [loading, setLoading]             = useState(false)
  const [exporting, setExporting]         = useState(false)
  const [fetchError, setFetchError]       = useState('')
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatus]         = useState('')
  const [sprintFilter, setSprint]         = useState('')
  const [showForm, setShowForm]           = useState(false)
  const [editItem, setEditItem]           = useState<BacklogItem | null>(null)
  const [showColConfig, setShowColConfig] = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [viewComment, setViewComment]     = useState<{ code: string; comment: string } | null>(null)

  const canCreate     = ['super_admin','gestor_proyecto'].includes(role)
  const canEdit       = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)
  const canDelete     = ['super_admin','gestor_proyecto'].includes(role)
  const canManageCols = ['super_admin','gestor_proyecto'].includes(role)

  const fetchColumns = useCallback(async (): Promise<TechCol[]> => {
    if (!projectId) return []
    try {
      const res  = await fetch(`/api/${tenant}/projects/${projectId}/columns`)
      const json = await res.json()
      const cols: TechCol[] = json.data ?? []
      setTechCols(cols)
      return cols
    } catch {
      setTechCols([])
      return []
    }
  }, [projectId, tenant])

  const fetchItems = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setFetchError('')
    try {
      const p = new URLSearchParams({ projectId: String(projectId) })
      if (statusFilter) p.set('status',    statusFilter)
      if (sprintFilter) p.set('sprintNum', sprintFilter)
      if (search)       p.set('search',    search)

      const res  = await fetch(`/api/${tenant}/backlog?${p}`)
      const json = await res.json()

      if (!res.ok) {
        setFetchError(`Error ${res.status}: ${json.error}`)
        setItems([])
        return
      }

      const rows: BacklogItem[] = (json.data ?? []).map((item: BacklogItem) => ({
        ...item,
        tech_columns: typeof item.tech_columns === 'string'
          ? JSON.parse(item.tech_columns)
          : (item.tech_columns ?? []),
      }))
      setItems(rows)
    } catch (e) {
      setFetchError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [projectId, statusFilter, sprintFilter, search, tenant])

  useEffect(() => {
    async function loadAll() {
      await fetchColumns()
      await fetchItems()
    }
    loadAll()
  }, [projectId, tenant])

  useEffect(() => {
    if (projectId) fetchItems()
  }, [statusFilter, sprintFilter, search])

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este item?')) return
    try {
      const res  = await fetch(`/api/${tenant}/backlog/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { alert(`Error: ${json.error}`); return }
      fetchItems()
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    }
  }

  async function handleExport() {
    if (!projectId) return
    setExporting(true)
    try {
      const res  = await fetch(`/api/${tenant}/backlog/export?projectId=${projectId}`)
      const json = await res.json()
      if (!res.ok) { alert(`Error al exportar: ${json.error}`); return }

      const data = json.data ?? []
      if (data.length === 0) { alert('No hay datos para exportar'); return }

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Backlog')

      const cols = Object.keys(data[0] ?? {})
      ws['!cols'] = cols.map((key: string) => ({
        wch: Math.max(
          key.length,
          ...(data as Record<string, unknown>[]).map(r => String(r[key] ?? '').length)
        ) + 2,
      }))

      const projectName = projects.find(p => p.id === projectId)?.name ?? 'backlog'
      XLSX.writeFile(wb, `${projectName.replace(/\s+/g, '_')}_backlog.xlsx`)
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    } finally {
      setExporting(false)
    }
  }

  const sprints = Array.from(
    new Set(items.map(i => i.sprint_num).filter(Boolean))
  ).sort() as number[]

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={projectId ?? ''}
          onChange={e => setProjectId(Number(e.target.value))}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar código, módulo, descripción..."
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
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En progreso</option>
          <option value="en_revision">En revisión</option>
          <option value="completado">Completado</option>
          <option value="bloqueado">Bloqueado</option>
        </select>

        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={sprintFilter}
          onChange={e => setSprint(e.target.value)}
        >
          <option value="">Todos los sprints</option>
          {sprints.map(s => <option key={s} value={s}>Sprint {s}</option>)}
        </select>

        <span className="text-xs text-gray-400">{items.length} item(s)</span>

        <div className="ml-auto flex gap-2">
          {canManageCols && (
            <button
              onClick={() => setShowColConfig(true)}
              className="border px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50"
            >
              ⚙ Columnas
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || !projectId}
            className="border px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? 'Exportando...' : '↓ Exportar Excel'}
          </button>
          {canCreate && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="border px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50"
              >
                ↑ Importar Excel
              </button>
              <button
                onClick={() => { setEditItem(null); setShowForm(true) }}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
              >
                + Nuevo item
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between items-center">
          <span>{fetchError}</span>
          <button onClick={() => fetchItems()} className="underline text-xs ml-3">Reintentar</button>
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
              <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Sprint</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">ETA</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Fec. Reg</th>
              {techCols.map(c => (
                <th key={c.col_key} className="px-3 py-3 text-left font-medium text-blue-600 whitespace-nowrap">
                  {c.name}
                </th>
              ))}
              <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Comentario</th>
              <th className="px-3 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={99} className="px-3 py-10 text-center text-gray-400">Cargando...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={99} className="px-3 py-10 text-center text-gray-400">
                  {projects.length === 0 ? 'No hay proyectos disponibles' : 'Sin resultados'}
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{item.code}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{item.module || '—'}</td>
                <td className="px-3 py-2 max-w-xs">
                  <span className="line-clamp-2 block">{item.description}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1 w-24">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{item.progress}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                  {item.sprint_num ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {item.eta ? item.eta.toString().slice(0, 10) : '—'}
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
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
                  <div className="flex gap-2">
                    {canEdit && (
                      <button
                        onClick={() => { setEditItem(item); setShowForm(true) }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Editar
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-500 hover:underline text-xs"
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

      {/* Modal form item */}
      {showForm && projectId && (
        <BacklogForm
          tenant={tenant}
          projectId={projectId}
          item={editItem}
          techCols={techCols}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchItems() }}
        />
      )}

      {/* Modal config columnas */}
      {showColConfig && projectId && (
        <ColumnConfig
          tenant={tenant}
          projectId={projectId}
          columns={techCols}
          onClose={() => setShowColConfig(false)}
          onSaved={async () => { setShowColConfig(false); await fetchColumns() }}
        />
      )}

      {/* Modal importar Excel */}
      {showImport && projectId && (
        <ImportModal
          tenant={tenant}
          projectId={projectId}
          techCols={techCols}
          onClose={() => setShowImport(false)}
          onImported={() => fetchItems()}
        />
      )}

      {/* Modal ver comentario */}
      {viewComment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 font-mono">{viewComment.code}</p>
                <h2 className="text-base font-semibold">Comentario</h2>
              </div>
              <button
                onClick={() => setViewComment(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 border leading-relaxed">
              {viewComment.comment}
            </p>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setViewComment(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Form item backlog ────────────────────────────────────────────────────────

function BacklogForm({ tenant, projectId, item, techCols, onClose, onSaved }: {
  tenant: string
  projectId: number
  item: BacklogItem | null
  techCols: TechCol[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    code:        item?.code        ?? '',
    module:      item?.module      ?? '',
    description: item?.description ?? '',
    progress:    item?.progress    ?? 0,
    status:      item?.status      ?? 'pendiente',
    sprint_num:  item?.sprint_num  ?? '',
    eta:         item?.eta ? item.eta.toString().slice(0, 10) : '',
    comment:     item?.comment     ?? '',
  })

  const [techVals, setTechVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    techCols.forEach(col => {
      const existing = item?.tech_columns?.find(t => t.col_key === col.col_key)
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
      const url    = item ? `/api/${tenant}/backlog/${item.id}` : `/api/${tenant}/backlog`
      const method = item ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId:   projectId,
          code:        form.code,
          module:      form.module      || null,
          description: form.description,
          progress:    Number(form.progress),
          status:      form.status,
          sprintNum:   form.sprint_num  || null,
          eta:         form.eta         || null,
          comment:     form.comment     || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(`Error ${res.status}: ${json.error ?? 'Error al guardar'}`)
        setSaving(false)
        return
      }

      const itemId = item?.id ?? json.id
      const techErrors: string[] = []

      await Promise.all(
        techCols.map(async col => {
          const val = techVals[col.col_key]
          if (!val) return
          const r = await fetch(`/api/${tenant}/backlog/${itemId}/tech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              columnId: col.id,
              value:    val || null,
              eta:      null,
            }),
          })
          if (!r.ok) {
            const rj = await r.json()
            techErrors.push(`${col.name}: ${rj.error}`)
          }
        })
      )

      if (techErrors.length > 0) {
        setError(`Item guardado pero con errores en columnas tech: ${techErrors.join(', ')}`)
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{item ? 'Editar item' : 'Nuevo item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Código *</label>
              <input
                required
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Módulo</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.module}
                onChange={e => setForm(f => ({ ...f, module: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Descripción General *</label>
            <textarea
              required
              rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Estado</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="en_revision">En revisión</option>
                <option value="completado">Completado</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Avance %</label>
              <input
                type="number" min={0} max={100}
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.progress}
                onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sprint #</label>
              <input
                type="number"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.sprint_num}
                onChange={e => setForm(f => ({ ...f, sprint_num: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ETA</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.eta}
                onChange={e => setForm(f => ({ ...f, eta: e.target.value }))}
              />
            </div>
          </div>

          {techCols.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Tecnologías
              </p>
              <div className="grid grid-cols-2 gap-3">
                {techCols.map(col => (
                  <div key={col.col_key} className="border rounded p-3 bg-gray-50">
                    <label className="block text-xs font-medium text-gray-700 mb-1">{col.name}</label>
                    <input
                      placeholder="Valor / Responsable"
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
            <textarea
              rows={2}
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Config columnas tech ─────────────────────────────────────────────────────

function ColumnConfig({ tenant, projectId, columns, onClose, onSaved }: {
  tenant: string
  projectId: number
  columns: TechCol[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ name: '', colType: 'both' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/projects/${projectId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:      form.name,
          colKey:    form.name.toLowerCase().replace(/[\s.]+/g, '_'),
          colType:   form.colType,
          sortOrder: columns.length,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(`Error ${res.status}: ${json.error ?? 'Error al guardar'}`)
        setSaving(false)
        return
      }
      setForm({ name: '', colType: 'both' })
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
          <h2 className="text-lg font-semibold">Columnas de tecnología</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="mb-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Columnas actuales ({columns.length})
          </p>
          {columns.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin columnas configuradas</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {columns.map(c => (
                <div key={c.col_key}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-gray-400 bg-white border px-1.5 py-0.5 rounded">
                    {c.col_type === 'both' ? 'Backlog + Sprint' : c.col_type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Agregar columna
          </p>

          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Nombre *</label>
              <input
                required
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="ej: Backend .NET, QA, AWS"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Visible en</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={form.colType}
                onChange={e => setForm(f => ({ ...f, colType: e.target.value }))}
              >
                <option value="both">Backlog y Sprint</option>
                <option value="backlog">Solo Backlog</option>
                <option value="sprint">Solo Sprint</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}