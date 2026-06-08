'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Role } from '@/lib/rbac'

interface Project     { id: number; code: string; name: string; is_member?: number }
interface TechCol     { id: number; col_key: string; name: string }
// developer names are plain strings, not system users
interface BacklogItem { id: number; code: string; description: string }

interface Observacion {
  id: number
  project_id: number
  backlog_item_id: number | null
  tipo: 'riesgo' | 'bloqueo' | 'mejora' | 'nota'
  prioridad: number // 🚀 Cambiado a número
  titulo: string
  descripcion: string | null
  estado: 'abierta' | 'en_seguimiento' | 'resuelta' | 'cerrada'
  eta: string | null
  entregado_at: string | null
  created_by: number
  created_by_name: string
  backlog_code: string | null
  total_asignaciones: number
  created_at: string
  updated_at: string | null
}

interface Asignacion {
  id: number
  column_id: number
  col_key: string
  tech_name: string
  developer_name: string
}

// key = project_columns.id, value = developer name | null
type AsignMap = Record<number, string | null>

type FormData = {
  tipo: Observacion['tipo']
  prioridad: Observacion['prioridad']
  titulo: string
  descripcion: string
  estado: Observacion['estado']
  eta: string
  entregadoAt: string
  backlogItemId: string
}

const TIPO_STYLES: Record<Observacion['tipo'], string> = {
  riesgo:  'bg-red-100 text-red-700',
  bloqueo: 'bg-orange-100 text-orange-700',
  mejora:  'bg-blue-100 text-blue-700',
  nota:    'bg-gray-100 text-gray-700',
}

const ESTADO_STYLES: Record<Observacion['estado'], string> = {
  abierta:        'bg-gray-100 text-gray-700',
  en_seguimiento: 'bg-blue-100 text-blue-700',
  resuelta:       'bg-green-100 text-green-700',
  cerrada:        'bg-gray-200 text-gray-500',
}
const TIPO_LABELS: Record<Observacion['tipo'], string>     = { riesgo:'Riesgo', bloqueo:'Bloqueo', mejora:'Mejora', nota:'Nota' }
const ESTADO_LABELS: Record<Observacion['estado'], string> = { abierta:'Abierta', en_seguimiento:'En seguimiento', resuelta:'Resuelta', cerrada:'Cerrada' }

const EMPTY_FORM: FormData = {
  tipo:'nota', prioridad: 5, titulo:'', descripcion:'', estado:'abierta', // 🚀 Prioridad default es 5
  eta:'', entregadoAt:'', backlogItemId:'',
}

export function ObservacionesClient({ projects, tenant, role }: {
  projects: Project[]; tenant: string; role: Role
}) {
  const allowedProjects = projects.filter(p => role === 'super_admin' || Number(p.is_member) > 0)

  const [projectId, setProjectId]       = useState<number | null>(allowedProjects[0]?.id ?? null)
  const [items, setItems]               = useState<Observacion[]>([])
  const [techCols, setTechCols]         = useState<TechCol[]>([])
  const [sprintDevs, setSprintDevs]     = useState<string[]>([])
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([])
  const [backlogSearch, setBacklogSearch] = useState('')
  const [backlogOpen, setBacklogOpen]   = useState(false)
  const backlogRef                      = useRef<HTMLDivElement>(null)
  const [loading, setLoading]           = useState(false)
  const [fetchError, setFetchError]     = useState('')
  const [search, setSearch]             = useState('')
  const [estadoFilter, setEstado]       = useState('')
  const [tipoFilter, setTipo]           = useState('')
  const [showForm, setShowForm]         = useState(false)
  const [editItem, setEditItem]         = useState<Observacion | null>(null)
  const [form, setForm]                 = useState<FormData>(EMPTY_FORM)
  const [asignMap, setAsignMap]         = useState<AsignMap>({})
  const [viewDetail, setViewDetail]     = useState<Observacion | null>(null)
  const [detailAsigns, setDetailAsigns] = useState<Asignacion[]>([])
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState('')
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete]           = useState<Observacion | null>(null)

 const canCreate    = role !== 'desarrollador';
  const canEdit      = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)
  const canDelete    = ['super_admin','gestor_proyecto'].includes(role)
  const canAssign    = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)

  // Cierra el dropdown de backlog al hacer click fuera
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (backlogRef.current && !backlogRef.current.contains(e.target as Node)) {
        setBacklogOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Carga columnas técnicas del proyecto
  const fetchTechCols = useCallback(async (pid: number) => {
    try {
      const res  = await fetch(`/api/${tenant}/projects/${pid}/columns`)
      const json = await res.json()
      setTechCols(json.data ?? [])
    } catch {
      setTechCols([])
    }
  }, [tenant])

  // Carga desarrolladores que han atendido sprints del proyecto
  const fetchSprintDevs = useCallback(async (pid: number) => {
    if (!canAssign) return
    try {
      const res  = await fetch(`/api/${tenant}/projects/${pid}/sprint-developers`)
      const json = await res.json()
      setSprintDevs(json.data ?? [])
    } catch {
      setSprintDevs([])
    }
  }, [tenant, canAssign])

  // Carga ítems del backlog del proyecto para el buscador
  const fetchBacklogItems = useCallback(async (pid: number) => {
    try {
      const res  = await fetch(`/api/${tenant}/backlog?projectId=${pid}&limit=500`)
      const json = await res.json()
      setBacklogItems(json.data ?? [])
    } catch {
      setBacklogItems([])
    }
  }, [tenant])

  const fetchItems = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setFetchError('')
    try {
      const p = new URLSearchParams({ projectId: String(projectId) })
      if (estadoFilter) p.set('estado', estadoFilter)
      if (tipoFilter)   p.set('tipo',   tipoFilter)
      if (search)       p.set('search', search)
      const res  = await fetch(`/api/${tenant}/observaciones?${p}`)
      const json = await res.json()
      if (!res.ok) { setFetchError(`Error ${res.status}: ${json.error}`); return }
      setItems(json.data ?? [])
    } catch {
      setFetchError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [projectId, tenant, estadoFilter, tipoFilter, search])

  useEffect(() => { fetchItems() }, [fetchItems])

  useEffect(() => {
    if (projectId) {
      fetchTechCols(projectId)
      fetchSprintDevs(projectId)
      fetchBacklogItems(projectId)
    }
  }, [projectId, fetchTechCols, fetchSprintDevs, fetchBacklogItems])

  async function fetchAsignaciones(obsId: number): Promise<Asignacion[]> {
    try {
      const res  = await fetch(`/api/${tenant}/observaciones/${obsId}/asignaciones`)
      const json = await res.json()
      return json.data ?? []
    } catch {
      return []
    }
  }

  function openCreate() {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setAsignMap({})
    setFormError('')
    setBacklogSearch('')
    setBacklogOpen(false)
    setShowForm(true)
  }

  async function openEdit(item: Observacion) {
    setEditItem(item)
    setForm({
      tipo:          item.tipo,
      prioridad:     item.prioridad,
      titulo:        item.titulo,
      descripcion:   item.descripcion ?? '',
      estado:        item.estado,
      eta:           item.eta          ? item.eta.slice(0, 10)          : '',
      entregadoAt:   item.entregado_at ? item.entregado_at.slice(0, 10) : '',
      backlogItemId: item.backlog_item_id ? String(item.backlog_item_id) : '',
    })
    setFormError('')
    setBacklogSearch('')
    setBacklogOpen(false)
    const asigns = await fetchAsignaciones(item.id)
    const map: AsignMap = {}
    asigns.forEach(a => { map[a.column_id] = a.developer_name })
    setAsignMap(map)
    setShowForm(true)
  }

  async function openDetail(item: Observacion) {
    setViewDetail(item)
    const asigns = await fetchAsignaciones(item.id)
    setDetailAsigns(asigns)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { setFormError('El título es obligatorio'); return }
    if (!projectId) return
    setSaving(true)
    setFormError('')
    try {
      const url    = editItem ? `/api/${tenant}/observaciones/${editItem.id}` : `/api/${tenant}/observaciones`
      const method = editItem ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        projectId,
        tipo:          form.tipo,
        prioridad:     form.prioridad,
        titulo:        form.titulo.trim(),
        descripcion:   form.descripcion.trim() || null,
        estado:        form.estado,
        eta:           form.eta           || null,
        entregadoAt:   form.entregadoAt   || null,
        backlogItemId: form.backlogItemId  ? Number(form.backlogItemId) : null,
      }

      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error ?? 'Error al guardar'); return }

      const obsId = editItem ? editItem.id : json.id

      // Guardar asignaciones si el rol puede asignar
      if (canAssign && techCols.length > 0) {
        const asignaciones = techCols
          .filter(tc => asignMap[tc.id] != null && asignMap[tc.id] !== '')
          .map(tc => ({ techColId: tc.id, colKey: tc.col_key, techName: tc.name, developerName: asignMap[tc.id]! }))

        await fetch(`/api/${tenant}/observaciones/${obsId}/asignaciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asignaciones }),
        })
      }

      setShowForm(false)
      fetchItems()
    } catch {
      setFormError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!itemToDelete) return
    try {
      const res  = await fetch(`/api/${tenant}/observaciones/${itemToDelete.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Error al eliminar'); return }
      fetchItems()
    } catch {
      alert('Error de conexión')
    } finally {
      setIsDeleteModalOpen(false)
      setItemToDelete(null)
    }
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    // Forzamos a que lea la fecha en UTC puro para evitar que Perú le reste 5 horas
    return new Date(iso).toLocaleDateString('es-ES', { 
      timeZone: 'UTC', 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })
  }

  function etaClass(eta: string | null, estado: Observacion['estado']) {
    if (!eta || estado === 'resuelta' || estado === 'cerrada') return 'text-gray-500'
    const diff = new Date(eta).getTime() - Date.now()
    if (diff < 0) return 'text-red-600 font-semibold'
    if (diff < 3 * 86400_000) return 'text-orange-600 font-medium'
    return 'text-gray-600'
  }

  const selectedBacklogItem = backlogItems.find(b => String(b.id) === form.backlogItemId) ?? null

  const filteredBacklog = backlogSearch.trim()
    ? backlogItems.filter(b =>
        b.code.toLowerCase().includes(backlogSearch.toLowerCase()) ||
        b.description.toLowerCase().includes(backlogSearch.toLowerCase())
      )
    : backlogItems

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={projectId ?? ''}
          onChange={e => setProjectId(Number(e.target.value))}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {allowedProjects.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>

        <select
          value={tipoFilter}
          onChange={e => setTipo(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los tipos</option>
          <option value="riesgo">Riesgo</option>
          <option value="bloqueo">Bloqueo</option>
          <option value="mejora">Mejora</option>
          <option value="nota">Nota</option>
        </select>

        <select
          value={estadoFilter}
          onChange={e => setEstado(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="abierta">Abierta</option>
          <option value="en_seguimiento">En seguimiento</option>
          <option value="resuelta">Resuelta</option>
          <option value="cerrada">Cerrada</option>
        </select>

        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
        />

        {canCreate && (
          <button
            onClick={openCreate}
            className="ml-auto bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Nueva observación
          </button>
        )}
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm">{fetchError}</div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {projectId ? 'No hay observaciones registradas.' : 'Selecciona un proyecto.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Prioridad</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Título</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">ETA</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Entregado</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Asignaciones</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Registrado por</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${TIPO_STYLES[item.tipo]}`}>
                      {TIPO_LABELS[item.tipo]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {/* 🚀 Nueva Lógica de Color Dinámico para Prioridad Numérica */}
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                      item.prioridad >= 8 ? 'bg-red-100 text-red-700' :
                      item.prioridad >= 4 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      Prio: {item.prioridad}
                    </span>
                  </td>
                  <td className="px-3 py-3 max-w-xs">
                    <button
                      onClick={() => openDetail(item)}
                      className="text-left font-medium text-gray-800 hover:text-blue-600 transition-colors line-clamp-1"
                    >
                      {item.titulo}
                    </button>
                    {item.backlog_code && (
                      <span className="text-xs text-gray-400 ml-1">#{item.backlog_code}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ESTADO_STYLES[item.estado]}`}>
                      {ESTADO_LABELS[item.estado]}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-xs whitespace-nowrap ${etaClass(item.eta, item.estado)}`}>
                    {fmtDate(item.eta)}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {item.entregado_at ? (
                      <span className="text-green-600 font-medium">{fmtDate(item.entregado_at)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {item.total_asignaciones > 0 ? (
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                        {item.total_asignaciones} tecnología{item.total_asignaciones !== 1 ? 's' : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{item.created_by_name ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2 justify-end">
                      {canEdit && (
                        <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      )}
                      {canDelete && (
                        <button 
  onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} 
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

      {/* ── Modal formulario ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">
                {editItem ? 'Editar observación' : 'Nueva observación'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Tipo, Prioridad, Estado */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tipo *</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Observacion['tipo'] }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="nota">Nota</option>
                    <option value="riesgo">Riesgo</option>
                    <option value="bloqueo">Bloqueo</option>
                    <option value="mejora">Mejora</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prioridad (1-10)</label>
                  {/* 🚀 Cambiado de Select a Input Numérico */}
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ ...f, prioridad: Number(e.target.value) }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value as Observacion['estado'] }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="abierta">Abierta</option>
                    <option value="en_seguimiento">En seguimiento</option>
                    <option value="resuelta">Resuelta</option>
                    <option value="cerrada">Cerrada</option>
                  </select>
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Título de la observación"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Describe la observación con detalle..."
                  rows={3}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* ETA, Entregado, Backlog */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ETA (fecha límite)</label>
                  <input
                    type="date"
                    value={form.eta}
                    onChange={e => setForm(f => ({ ...f, eta: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha real entrega</label>
                  <input
                    type="date"
                    value={form.entregadoAt}
                    onChange={e => setForm(f => ({ ...f, entregadoAt: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div ref={backlogRef} className="relative">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ítem Backlog</label>
                  {selectedBacklogItem && !backlogOpen ? (
                    <div className="flex items-center gap-1 w-full border rounded px-3 py-2 text-sm bg-white">
                      <span className="flex-1 truncate text-gray-800">
                        <span className="font-medium text-blue-600">{selectedBacklogItem.code}</span>
                        {' — '}
                        {selectedBacklogItem.description}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, backlogItemId: '' })); setBacklogSearch('') }}
                        className="text-gray-400 hover:text-gray-600 ml-1 shrink-0"
                      >×</button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={backlogSearch}
                      onChange={e => { setBacklogSearch(e.target.value); setBacklogOpen(true) }}
                      onFocus={() => setBacklogOpen(true)}
                      placeholder="Buscar por código o descripción..."
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  {backlogOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                      {filteredBacklog.length === 0 ? (
                        <div className="px-3 py-2 text-gray-400 text-xs">Sin resultados</div>
                      ) : (
                        filteredBacklog.slice(0, 50).map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setForm(f => ({ ...f, backlogItemId: String(b.id) }))
                              setBacklogSearch('')
                              setBacklogOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 flex gap-2 items-start"
                          >
                            <span className="font-medium text-blue-600 shrink-0">{b.code}</span>
                            <span className="text-gray-600 truncate">{b.description}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Asignaciones por tecnología */}
              {canAssign && techCols.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Responsables por tecnología
                    </h3>
                    {sprintDevs.length === 0 && (
                      <span className="text-xs text-amber-600">Sin desarrolladores en sprints del proyecto</span>
                    )}
                  </div>
                  <div className="divide-y">
                    {techCols.map(tc => (
                      <div key={tc.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-sm text-gray-700 w-32 shrink-0 font-medium">{tc.name}</span>
                        <select
                          value={asignMap[tc.id] ?? ''}
                          onChange={e => setAsignMap(m => ({ ...m, [tc.id]: e.target.value || null }))}
                          className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={sprintDevs.length === 0}
                        >
                          <option value="">— Sin asignar —</option>
                          {sprintDevs.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formError && <p className="text-red-600 text-sm">{formError}</p>}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : editItem ? 'Guardar cambios' : 'Crear observación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal detalle ── */}
      {viewDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-4">
            <div className="flex items-start justify-between px-6 py-4 border-b gap-3">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${TIPO_STYLES[viewDetail.tipo]}`}>
                  {TIPO_LABELS[viewDetail.tipo]}
                </span>
                {/* 🚀 Lógica dinámica en el modal de detalle también */}
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                  viewDetail.prioridad >= 8 ? 'bg-red-100 text-red-700' :
                  viewDetail.prioridad >= 4 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  Prio: {viewDetail.prioridad}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ESTADO_STYLES[viewDetail.estado]}`}>
                  {ESTADO_LABELS[viewDetail.estado]}
                </span>
              </div>
              <button onClick={() => setViewDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <h3 className="font-semibold text-gray-800 text-base">{viewDetail.titulo}</h3>

              {viewDetail.descripcion ? (
                <p className="text-gray-600 text-sm whitespace-pre-wrap">{viewDetail.descripcion}</p>
              ) : (
                <p className="text-gray-400 text-sm italic">Sin descripción.</p>
              )}

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-xs text-gray-400 mb-0.5">ETA (fecha límite)</p>
                  <p className={`font-medium ${etaClass(viewDetail.eta, viewDetail.estado)}`}>
                    {fmtDate(viewDetail.eta)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-xs text-gray-400 mb-0.5">Fecha real de entrega</p>
                  <p className={`font-medium ${viewDetail.entregado_at ? 'text-green-600' : 'text-gray-400'}`}>
                    {fmtDate(viewDetail.entregado_at)}
                  </p>
                </div>
              </div>

              {/* Asignaciones */}
              {detailAsigns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Responsables por tecnología
                  </p>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {detailAsigns.map(a => (
                      <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-500 text-xs font-medium">{a.tech_name}</span>
                        <span className="text-gray-800 font-medium">{a.developer_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Meta */}
              <div className="pt-2 border-t text-xs text-gray-400 flex flex-wrap gap-4">
                <span>Por: <strong className="text-gray-600">{viewDetail.created_by_name ?? '—'}</strong></span>
                <span>Fecha: <strong className="text-gray-600">{fmtDate(viewDetail.created_at)}</strong></span>
                {viewDetail.backlog_code && (
                  <span>Backlog: <strong className="text-gray-600">#{viewDetail.backlog_code}</strong></span>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
              {canEdit && (
                <button
                  onClick={() => { setViewDetail(null); openEdit(viewDetail) }}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Editar
                </button>
              )}
              <button
                onClick={() => setViewDetail(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal confirmar eliminación ── */}
      {isDeleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">
                Confirmar eliminación
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                ¿Estás seguro de que deseas eliminar la observación <strong className="text-gray-800">"{itemToDelete.titulo}"</strong>? Esta acción no se puede deshacer.
              </p>
              
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setItemToDelete(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}