'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Role } from '@/lib/rbac'

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
  priority?: number;            
  review_date?: string | null;  
  obs_count?: number; 
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

// ── Sorting Types & Helpers ──────────────────────────────────────────────────
type SortKey = 'code' | 'module' | 'description' | 'progress' | 'status' | 'eta' | 'reg_date' | 'priority' | 'review_date'
type SortDir = 'asc' | 'desc'
interface SortState { key: SortKey | null; dir: SortDir }

function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.key !== col) return <span className="ml-1 inline-flex flex-col leading-none opacity-30 text-[10px]"><span>▲</span><span>▼</span></span>
  return <span className="ml-1 text-blue-600 text-[10px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>
}

function thClass(col: SortKey, sort: SortState) {
  return `text-left px-3 py-3 font-medium whitespace-nowrap select-none cursor-pointer transition-colors ${
    sort.key === col ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
  }`
}

function compareSprintItems(a: SprintItem, b: SprintItem, key: SortKey, dir: SortDir): number {
  if (key === 'priority') {
    const prioA = a.status === 'completado' ? 0 : (Number(a.priority) || 0);
    const prioB = b.status === 'completado' ? 0 : (Number(b.priority) || 0);

    if (prioA === 0 && prioB > 0) return 1;
    if (prioB === 0 && prioA > 0) return -1;
    if (prioA === 0 && prioB === 0) return 0;
    
    return dir === 'asc' ? prioA - prioB : -(prioA - prioB);
  }

  let valA: string | number | null = null
  let valB: string | number | null = null

  switch (key) {
    case 'code': valA = a.code; valB = b.code; break;
    case 'module': valA = a.module; valB = b.module; break;
    case 'description': valA = a.description.toLowerCase(); valB = b.description.toLowerCase(); break;
    case 'progress': valA = Number(a.progress) || 0; valB = Number(b.progress) || 0; break;
    case 'status': valA = a.status; valB = b.status; break;
    case 'eta': valA = a.eta ?? ''; valB = b.eta ?? ''; break;
    case 'reg_date': valA = a.reg_date ?? ''; valB = b.reg_date ?? ''; break;
    case 'review_date': valA = a.review_date ?? ''; valB = b.review_date ?? ''; break;
  }

  if (valA === '' && valB !== '') return 1
  if (valB === '' && valA !== '') return -1

  let result = 0
  if (typeof valA === 'number' && typeof valB === 'number') {
    result = valA - valB
  } else {
    result = String(valA) < String(valB) ? -1 : String(valA) > String(valB) ? 1 : 0
  }

  return dir === 'asc' ? result : -result
}

// ── Component ───────────────────────────────────────────────────────────────
export function SprintClient({ projects, members, tenant, role, userId }: {
  projects: Project[]; members: Member[]; tenant: string; role: Role; userId: number
}) {
  const allowedProjects = projects.filter(p => role === 'super_admin' || Number(p.is_member) > 0)

  const [projectId, setProjectId] = useState<number | null>(null);

  useEffect(() => {
    const savedId = localStorage.getItem('pm_selected_project') ? Number(localStorage.getItem('pm_selected_project')) : null;
    let targetId = null;
    if (savedId && allowedProjects.some(p => p.id === savedId)) {
      targetId = savedId;
    } else {
      targetId = allowedProjects[0]?.id ?? null;
    }
    setProjectId(targetId);
    if (targetId) localStorage.setItem('pm_selected_project', String(targetId));
  }, [allowedProjects]);

  const handleProjectChange = (newId: number) => {
    setProjectId(newId);
    localStorage.setItem('pm_selected_project', String(newId));
  };
  
  const [sprints, setSprints]               = useState<Sprint[]>([])
  const [activeSprint, setActiveSprint]     = useState<Sprint | null>(null)
  const [items, setItems]                   = useState<SprintItem[]>([])
  const [techCols, setTechCols]             = useState<TechCol[]>([])
  const [loading, setLoading]               = useState(false)
  const [isPageLoading, setIsPageLoading]   = useState(true)
  const [fetchError, setFetchError]         = useState('')
  const [statusFilters, setStatusFilters]   = useState<string[]>([])
  const [showSprintForm, setShowSprintForm] = useState(false)
  const [editItem, setEditItem]             = useState<SprintItem | null>(null)
  const [showItemForm, setShowItemForm]     = useState(false)
  const [viewComment, setViewComment]       = useState<{ code: string; comment: string } | null>(null)
  const [checklistExecOpen, setChecklistExecOpen] = useState<SprintItem | null>(null)
  const [obsLoad, setObsLoad]               = useState<{name: string, count: number}[]>([])

  // 🚀 ESTADO ORDENAMIENTO
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' })
  // 🚀 ESTADO MODAL DRAG AND DROP
  const [isReorderOpen, setIsReorderOpen] = useState(false)

  const currentProject = allowedProjects.find(p => p.id === projectId)
  const canManageSprint = role !== 'desarrollador' && (role === 'super_admin' || Number(currentProject?.is_member) > 0)
  const canEditItem     = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)

  const fetchObsLoad = useCallback(async (sprintNum: number) => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/${tenant}/sprints/obs-load?projectId=${projectId}&sprintNum=${sprintNum}`)
      const json = await res.json()
      setObsLoad(json.data ?? [])
    } catch { setObsLoad([]) }
  }, [projectId, tenant])

  const fetchTechCols = useCallback(async () => {
    if (!projectId) return
    try {
      const res  = await fetch(`/api/${tenant}/projects/${projectId}/columns`)
      const json = await res.json()
      setTechCols((json.data ?? []).filter((c: TechCol) => ['sprint','both'].includes(c.col_type)))
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
      setIsPageLoading(true)
      await fetchTechCols()
      const active = await fetchSprints()
      await fetchItems(active)
      setIsPageLoading(false)
    }
    loadAll()
  }, [projectId, tenant])

  useEffect(() => {
    if (activeSprint) fetchObsLoad(activeSprint.number)
    else setObsLoad([])
  }, [activeSprint, fetchObsLoad])

  useEffect(() => { fetchItems() }, [statusFilters])

  // Sorting
  function handleSort(col: SortKey) {
    setSort(prev => {
      if (prev.key !== col) return { key: col, dir: 'asc' }
      if (prev.dir === 'asc') return { key: col, dir: 'desc' }
      return { key: null, dir: 'asc' }
    })
  }

  const sortedItems = sort.key
    ? [...items].sort((a, b) => compareSprintItems(a, b, sort.key!, sort.dir))
    : items

  const completedItems = items.filter(i => i.status === 'completado').length
  const pct = items.length > 0 ? Math.round(completedItems / items.length * 100) : 0
  const totalProgress = items.reduce((sum, item) => sum + (Number(item.progress) || 0), 0)
  const realPct = items.length > 0 ? Math.round(totalProgress / items.length) : 0
  
  const pendingItems = items.filter(i => i.status === 'pendiente').length
  const inProgressItems = items.filter(i => i.status === 'en_progreso').length
  const inReviewItems = items.filter(i => i.status === 'en_revision').length
  const blockedItems = items.filter(i => i.status === 'bloqueado').length

  function toggleStatus(val: string) {
    setStatusFilters(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (isPageLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 bg-white rounded-lg shadow border border-gray-100">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-gray-100"></div>
          <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
        </div>
        <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">Cargando datos del sprint...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={projectId ?? ''}
          onChange={e => handleProjectChange(Number(e.target.value))} 
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

        <div className="ml-auto flex gap-2">
          {canManageSprint && activeSprint && (
            <button
              onClick={() => setIsReorderOpen(true)}
              className="border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5"
            >
              ↕ Reordenar Prioridades
            </button>
          )}
          {canManageSprint && (
            <button
              onClick={() => setShowSprintForm(true)}
              className="border border-gray-300 px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50"
            >
              ⚙ Gestionar sprints
            </button>
          )}
        </div>
      </div>

      {activeSprint ? (
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Activo</span>
                <h2 className="font-semibold text-lg">Sprint #{activeSprint.number} — {activeSprint.name}</h2>
              </div>
              {activeSprint.goal && <p className="text-sm text-gray-500 mt-1">{activeSprint.goal}</p>}
              
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
                {activeSprint.start_date && <span>Inicio: {activeSprint.start_date.toString().slice(0, 10)}</span>}
                {activeSprint.end_date && <span>Fin: {activeSprint.end_date.toString().slice(0, 10)}</span>}
                {activeSprint.days_remaining !== null && (
                  <span className={activeSprint.days_remaining < 0 ? 'text-red-500 font-medium' : ''}>
                    {activeSprint.days_remaining >= 0 ? `${activeSprint.days_remaining} días restantes` : `Vencido hace ${Math.abs(activeSprint.days_remaining)} días`}
                  </span>
                )}
              </div>

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

              {obsLoad.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                    Carga de Observaciones Activas (Por Desarrollador)
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {obsLoad.map(dev => (
                      <div key={dev.name} className="flex items-center gap-2 bg-orange-50 border border-orange-200 px-2 py-1 rounded shadow-sm">
                        <span className="font-medium text-xs text-orange-800">{dev.name}</span>
                        <span className="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">{dev.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right min-w-40 flex flex-col gap-4 border-l pl-5 border-gray-100">
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Avance Real</span>
                  <span className="text-2xl font-bold text-green-600">{realPct}%</span>
                </div>
                <div className="w-36 bg-gray-100 rounded-full h-1.5 ml-auto">
                  <div className="bg-green-500 h-1.5 rounded-full transition-all duration-700" style={{ width: `${realPct}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Promedio de progreso</p>
              </div>

              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cerrados</span>
                  <span className="text-xl font-bold text-blue-600">{pct}%</span>
                </div>
                <div className="w-36 bg-gray-100 rounded-full h-1.5 ml-auto">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{completedItems} de {items.length} tickets</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-400 mb-3">No hay sprint activo para este proyecto</p>
          {canManageSprint && (
            <button onClick={() => setShowSprintForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
              + Crear sprint
            </button>
          )}
        </div>
      )}

      {activeSprint && (
        <>
          <div className="bg-white rounded-lg shadow px-4 py-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Filtros:</span>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.val}
                  onClick={() => toggleStatus(s.val)}
                  className={`px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                    statusFilters.includes(s.val) ? `${s.color} border-current shadow-sm` : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              {statusFilters.length > 0 && (
                <button onClick={() => setStatusFilters([])} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar</button>
              )}
              {sort.key && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded ml-2">
                  Ordenado {sort.dir === 'asc' ? '▲' : '▼'}
                  <button onClick={() => setSort({ key: null, dir: 'asc' })} className="ml-1 text-blue-400 hover:text-blue-700 font-bold text-sm leading-none">&times;</button>
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">{items.length} item(s)</span>
            </div>
          </div>

          {fetchError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
              <span>{fetchError}</span>
              <button onClick={() => fetchItems()} className="underline text-xs">Reintentar</button>
            </div>
          )}

          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={thClass('code', sort)} onClick={() => handleSort('code')}>Código <SortIcon col="code" sort={sort} /></th>
                  <th className={thClass('module', sort)} onClick={() => handleSort('module')}>Módulo <SortIcon col="module" sort={sort} /></th>
                 <th className={`${thClass('description', sort)} min-w-[300px]`} onClick={() => handleSort('description')}>Descripción <SortIcon col="description" sort={sort} /></th>
                  <th className={thClass('progress', sort)} onClick={() => handleSort('progress')}>Avance <SortIcon col="progress" sort={sort} /></th>
                  <th className={thClass('status', sort)} onClick={() => handleSort('status')}>Estado <SortIcon col="status" sort={sort} /></th>
                  <th className={thClass('eta', sort)} onClick={() => handleSort('eta')}>ETA <SortIcon col="eta" sort={sort} /></th>
                  <th className={thClass('reg_date', sort)} onClick={() => handleSort('reg_date')}>Fec. Reg <SortIcon col="reg_date" sort={sort} /></th>
                  {techCols.map(c => (
                    <th key={c.col_key} className="px-3 py-3 text-left font-medium text-blue-600 whitespace-nowrap">{c.name}</th>
                  ))}
                  <th className={thClass('priority', sort)} onClick={() => handleSort('priority')}>Prioridad <SortIcon col="priority" sort={sort} /></th>
                  <th className={thClass('review_date', sort)} onClick={() => handleSort('review_date')}>Fec. Revisión <SortIcon col="review_date" sort={sort} /></th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Comentario</th>
                  <th className="px-3 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={99} className="px-3 py-10 text-center text-gray-400">Cargando...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={99} className="px-3 py-10 text-center text-gray-400">No hay items asignados al Sprint #{activeSprint.number}</td></tr>
                ) : sortedItems.map(item => {
                  
                  let etaStatus = null;
                  let daysUntil = null;
                  if (item.eta && item.status !== 'completado') {
                    const etaDate = new Date(item.eta);
                    etaDate.setHours(0, 0, 0, 0);
                    const diffTime = etaDate.getTime() - today.getTime();
                    daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (daysUntil < 0) etaStatus = 'vencido';
                    else if (daysUntil <= 2) etaStatus = 'proximo';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{item.code}</span>
                          {item.obs_count !== undefined && item.obs_count > 0 && (
                            <a href={`/${tenant}/observaciones?search=${item.code}`} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded transition-colors text-[9px] font-bold uppercase tracking-widest mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                              {item.obs_count} Obs
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{item.module || '—'}</td>
                      <td className="px-3 py-2 min-w-[300px]">
  <span className="line-clamp-2 block font-medium text-gray-800">{item.description}</span>
</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1 w-24">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${item.progress}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-8 text-right">{item.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className={etaStatus === 'vencido' ? 'text-red-600 font-bold' : etaStatus === 'proximo' ? 'text-orange-600 font-bold' : 'text-gray-500'}>
                            {item.eta ? item.eta.toString().slice(0, 10) : '—'}
                          </span>
                          {etaStatus === 'vencido' && (
                            <span className="text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded w-fit mt-1 uppercase tracking-tighter">
                              Vencido ({Math.abs(daysUntil!)}d)
                            </span>
                          )}
                          {etaStatus === 'proximo' && (
                            <span className="text-[9px] font-black text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded w-fit mt-1 uppercase tracking-tighter">
                              {daysUntil === 0 ? 'Vence hoy' : daysUntil === 1 ? 'Vence mañana' : `En ${daysUntil} días`}
                            </span>
                          )}
                        </div>
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
                      <td className="px-3 py-2 text-xs text-center font-bold text-gray-700 border-x border-gray-100 whitespace-nowrap">
                        {item.status === 'completado' || (item.priority ?? 0) === 0 ? (
                          <span className="text-gray-300 font-normal">—</span>
                        ) : (
                          <span className={item.priority! >= 8 ? 'text-red-600' : 'text-blue-600'}>P: {item.priority}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {item.review_date ? item.review_date.toString().slice(0, 10) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {item.comment ? (
                          <button
                            onClick={() => setViewComment({ code: item.code, comment: item.comment })}
                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors whitespace-nowrap"
                          >
                            Ver nota
                          </button>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2 justify-end">
                          {canEditItem && (
                            <button
                              onClick={() => { setEditItem(item); setShowItemForm(true) }}
                              className="text-blue-600 hover:underline text-xs font-medium"
                            >
                              Editar
                            </button>
                          )}
                          <button
                            onClick={() => setChecklistExecOpen(item)}
                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs transition-colors font-medium whitespace-nowrap"
                          >
                             Checklist
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showSprintForm && projectId && (
        <SprintManager tenant={tenant} projectId={projectId} sprints={sprints} onClose={() => setShowSprintForm(false)}
          onSaved={async () => {
            setShowSprintForm(false)
            const active = await fetchSprints()
            fetchItems(active)
            if (active) fetchObsLoad(active.number)
            else setObsLoad([])
          }}
        />
      )}

      {showItemForm && editItem && (
        <SprintItemForm tenant={tenant} item={editItem} techCols={techCols} members={members}
          onClose={() => { setShowItemForm(false); setEditItem(null) }}
          onSaved={() => { setShowItemForm(false); setEditItem(null); fetchItems() }}
        />
      )}

      {viewComment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <div>
                <p className="text-[10px] text-gray-400 font-mono font-bold uppercase tracking-widest">{viewComment.code}</p>
                <h2 className="text-lg font-bold text-gray-800">Comentario</h2>
              </div>
              <button onClick={() => setViewComment(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-yellow-50 rounded-lg p-4 border border-yellow-100 leading-relaxed italic">
              {viewComment.comment}
            </p>
            <div className="flex justify-end mt-4 pt-4 border-t">
              <button onClick={() => setViewComment(null)} className="px-6 py-2 text-sm border rounded-lg font-medium hover:bg-gray-50 transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {checklistExecOpen && (
        <ChecklistExecutionModal tenant={tenant} item={checklistExecOpen} onClose={() => setChecklistExecOpen(null)} onUpdated={() => fetchItems(activeSprint)} />
      )}

      {isReorderOpen && activeSprint && (
        <ReorderSprintItemsModal
          tenant={tenant}
          sprint={activeSprint}
          items={items}
          onClose={() => {
            setIsReorderOpen(false)
            fetchItems(activeSprint)
          }}
        />
      )}
    </div>
  )
}

// ─── Modal Drag & Drop Prioridades ──────────────────────────────────────────
function ReorderSprintItemsModal({ tenant, sprint, items, onClose }: { tenant: string; sprint: Sprint; items: SprintItem[]; onClose: () => void }) {
  const [localItems, setLocalItems] = useState<SprintItem[]>([])
  const [prioritySlots, setPrioritySlots] = useState<number[]>([]) 
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  useEffect(() => {
    // 🚀 1. FILTRAR: Solo tickets NO completados y con prioridad MAYOR a 0
    const active = items.filter(o => o.status !== 'completado' && (Number(o.priority) || 0) > 0)
    
    // 🚀 2. ORDENAR: Por prioridad actual ascendente (ej: 2, 3, 5)
    active.sort((a, b) => Number(a.priority) - Number(b.priority))
    
    setLocalItems(active)
    
    // 🚀 3. SLOTS EXACTOS: Conservamos los números de prioridad que ya tienen asignados
    setPrioritySlots(active.map(o => Number(o.priority)))
  }, [items])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move"
    setTimeout(() => setDraggedIndex(index), 0)
  }

  const handleDragEnter = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) return
    setLocalItems(prevItems => {
      const newItems = [...prevItems]
      const draggedItem = newItems[draggedIndex]
      newItems.splice(draggedIndex, 1)
      newItems.splice(targetIndex, 0, draggedItem)
      setDraggedIndex(targetIndex)
      return newItems
    })
  }

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDragEnd = () => setDraggedIndex(null)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    
    // Armamos el payload con los IDs y sus nuevas prioridades
    const payload = localItems.map((item, idx) => ({
      id: item.id,
      prioridad: prioritySlots[idx] 
    }))

    try {
      const res = await fetch(`/api/${tenant}/sprints/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprintId: sprint.id, data: payload })
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al guardar prioridades.'); return }
      onClose()
    } catch {
      setError('Error de comunicación con el servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Reordenar Tickets Priorizados</h2>
            <p className="text-xs text-gray-400 mt-0.5">Sprint #{sprint.number} — Ajusta la prioridad de los tickets marcados.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded shrink-0">
            {error}
          </div>
        )}

        <div className="px-6 py-4 overflow-y-auto flex-1 bg-gray-50/50">
          {localItems.length === 0 ? (
            <p className="text-center text-sm text-gray-400 italic py-10">No existen tickets con prioridad activa en este sprint.</p>
          ) : (
            <div className="space-y-3 relative">
              {localItems.map((item, idx) => (
                <div key={item.id} draggable
                  onDragStart={(e) => handleDragStart(e, idx)} onDragEnter={(e) => handleDragEnter(e, idx)}
                  onDragOver={handleDragOver} onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-200 ${
                    draggedIndex === idx 
                      ? 'bg-white border-2 border-blue-500 shadow-xl scale-[1.02] z-50 relative' 
                      : 'bg-white border border-gray-200 hover:border-blue-300 hover:shadow-md z-0'
                  }`}
                >
                  <div className="text-gray-500 font-mono text-xs font-bold bg-gray-100 border border-gray-200 w-12 h-8 rounded flex items-center justify-center shrink-0">
                    P: {prioritySlots[idx]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.description}</p>
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mt-0.5">
                      {item.code} — {item.status.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="text-gray-300 hover:text-blue-500 transition-colors text-base font-bold px-2 cursor-grab">
                    ☰
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving || localItems.length === 0} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-bold shadow-sm transition-colors">
            {saving ? 'Guardando...' : 'Guardar Prioridades'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sprint Item Form ────────────────────────────────────────────────────────
function SprintItemForm({ tenant, item, techCols, members, onClose, onSaved }: { tenant: string; item: SprintItem; techCols: TechCol[]; members: Member[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code:        item.code, 
    progress:    item.progress,
    status:      item.status,
    eta:         item.eta ? item.eta.toString().slice(0, 10) : '',
    comment:     item.comment ?? '',
    priority:    item.priority ?? 0,
    review_date: item.review_date ? item.review_date.toString().slice(0, 10) : '',
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
          code:        form.code,
          module:      item.module      || null,
          description: item.description || null,
          progress:    Number(form.progress),
          status:      form.status,
          sprintNum:   item.sprint_num  ?? null, 
          eta:         form.eta         || null,
          comment:     form.comment     || null,
          priority:    Number(form.priority),
          reviewDate:  form.review_date || null
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? `Error ${res.status}`); setSaving(false); return }

      const techErrors: string[] = []
      await Promise.all(
        techCols.map(async col => {
          const val = techVals[col.col_key]
          if (!val) return
          const r = await fetch(`/api/${tenant}/backlog/${item.id}/tech`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        setSaving(false); return
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
        <div className="flex items-center justify-between mb-4 border-b pb-3">
          <h2 className="text-lg font-bold text-gray-800">Actualizar item del sprint</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Código del Ticket</label>
          <input className="w-full border rounded-md px-3 py-1.5 text-sm font-mono font-bold text-gray-700 bg-white outline-none focus:border-blue-500 transition-colors uppercase" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm font-semibold">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Estado</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="en_revision">En revisión</option>
                <option value="completado">Completado</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Avance %</label>
              <input type="number" min={0} max={100} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.progress} onChange={e => {
                const p = Number(e.target.value); let s = form.status;
                if (p === 0) s = 'pendiente'; else if (p > 0 && p < 100) s = 'en_progreso'; else if (p === 100) s = 'completado';
                setForm(f => ({ ...f, progress: p, status: s }));
              }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">ETA</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.eta} onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Prioridad Numérica</label>
              <input type="number" min={0} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              <span className="text-[10px] text-gray-400">Si lo marcas 'Completado' pasará a 0 automáticameente.</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Fec. Revisión</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-600" value={form.review_date} onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))} />
            </div>
          </div>

          {techCols.length > 0 && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Tecnologías / Responsables
              </p>
              <div className="grid grid-cols-2 gap-4">
                {techCols.map(col => (
                  <div key={col.col_key}>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">{col.name}</label>
                    <input placeholder="Ej: Juan Perez" className="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500" value={techVals[col.col_key] ?? ''} onChange={e => setTechVals(v => ({ ...v, [col.col_key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Comentario</label>
            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-6 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium text-gray-600 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold transition-colors">
              {saving ? 'Guardando...' : 'Guardar Avance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Sprint Manager ──────────────────────────────────────────────────────────
function SprintManager({ tenant, projectId, sprints, onClose, onSaved }: { tenant: string; projectId: number; sprints: Sprint[]; onClose: () => void; onSaved: () => void }) {
  const nextNum = sprints.length > 0 ? Math.max(...sprints.map(s => s.number)) + 1 : 1
  const [form, setForm] = useState({ number: String(nextNum), name: '', goal: '', start_date: '', end_date: '', status: 'planificado' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // 🚀 NUEVOS ESTADOS PARA EDICIÓN EN LÍNEA
  const [editingSprintId, setEditingSprintId] = useState<number | null>(null)
  const [editSprintName, setEditSprintName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/sprints`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, number: Number(form.number), name: form.name, goal: form.goal || null, startDate: form.start_date || null, endDate: form.end_date || null, status: form.status }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`Error ${res.status}: ${json.error}`); setSaving(false); return }
      onSaved()
    } catch (e) { setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`); setSaving(false) }
  }

  async function handleActivate(sprint: Sprint) {
    try {
      const res = await fetch(`/api/${tenant}/sprints/${sprint.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, status: 'activo' }),
      })
      const json = await res.json()
      if (!res.ok) { alert(`Error: ${json.error}`); return }
      onSaved()
    } catch (e) { alert(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`) }
  }

  // 🚀 NUEVA FUNCIÓN: Guardar el cambio de nombre
  async function handleSaveEdit(sprint: Sprint) {
    const newName = editSprintName.trim()
    if (!newName || newName === sprint.name) {
      setEditingSprintId(null)
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/sprints/${sprint.id}`, {
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ projectId, name: newName }),
      })
      const json = await res.json()
      if (!res.ok) { 
        setError(json.error ?? 'Error al actualizar el nombre.')
        return 
      }
      setEditingSprintId(null)
      onSaved() // Refresca la lista
    } catch (e) { 
      setError('Error de comunicación con el servidor.') 
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4 border-b pb-3">
          <h2 className="text-lg font-bold text-gray-800">Gestionar Sprints</h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="mb-6">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Sprints del proyecto
          </p>
          {sprints.length === 0 ? <p className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded text-center border border-gray-100">Sin sprints creados</p> : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {sprints.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-lg text-sm transition-all">
                  
                  {/* 🚀 LÓGICA DE EDICIÓN CONDICIONAL AQUÍ */}
                  {editingSprintId === s.id ? (
                    <div className="flex items-center gap-3 w-full">
                      <span className="font-mono text-xs font-bold text-gray-400 shrink-0">#{s.number}</span>
                      <input
                        autoFocus
                        className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                        value={editSprintName}
                        onChange={e => setEditSprintName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit(s)
                          if (e.key === 'Escape') setEditingSprintId(null)
                        }}
                        disabled={saving}
                      />
                      <button 
                        onClick={() => handleSaveEdit(s)} 
                        disabled={saving} 
                        className="text-[10px] font-bold text-green-700 uppercase bg-green-100 hover:bg-green-200 border border-green-200 px-2 py-1 rounded transition-colors shrink-0"
                      >
                        ✓ Guardar
                      </button>
                      <button 
                        onClick={() => setEditingSprintId(null)} 
                        disabled={saving} 
                        className="text-[10px] font-bold text-gray-600 uppercase bg-gray-200 hover:bg-gray-300 border border-gray-300 px-2 py-1 rounded transition-colors shrink-0"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-gray-400">#{s.number}</span>
                        <span className="font-medium text-gray-700">{s.name}</span>
                        <button 
                          onClick={() => { setEditingSprintId(s.id); setEditSprintName(s.name); setError(''); }} 
                          className="text-gray-400 hover:text-blue-600 transition-colors px-1" 
                          title="Editar nombre"
                          disabled={saving}
                        >
                          ✎
                        </button>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.status === 'activo' ? 'bg-green-100 text-green-700' : s.status === 'completado' ? 'bg-blue-100 text-blue-700' : s.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'}`}>
                          {s.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{s.completion_pct}% — {s.total_items} items</span>
                        {s.status === 'activo' ? (
                          <span className="text-[10px] font-bold text-green-600 uppercase bg-green-50 px-2 py-1 rounded">Activo</span>
                        ) : s.status !== 'cancelado' ? (
                          <button onClick={() => handleActivate(s)} disabled={saving} className="text-[10px] font-bold text-blue-600 uppercase bg-white border px-2 py-1 rounded shadow-sm hover:bg-blue-50 transition-colors">Activar</button>
                        ) : null}
                      </div>
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Crear nuevo sprint</p>
          {error && <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Número *</label>
                <input required type="number" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} disabled={saving} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Estado inicial</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} disabled={saving}>
                  <option value="planificado">Planificado</option>
                  <option value="activo">Activo (reemplaza al actual)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Nombre *</label>
              <input required className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="ej: Sprint 2 — Módulo de pagos" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Objetivo</label>
              <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" placeholder="¿Qué se espera lograr en este sprint?" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} disabled={saving} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Fecha inicio</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-600" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} disabled={saving} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Fecha fin</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-600" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={onClose} disabled={saving} className="px-6 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-600">Cerrar</button>
              <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold transition-colors">{saving ? 'Creando...' : 'Crear Sprint'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Checklist Execution ─────────────────────────────────────────────────────
function ChecklistExecutionModal({ tenant, item, onClose, onUpdated }: { tenant: string, item: SprintItem, onClose: () => void, onUpdated: () => void }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenant}/backlog/${item.id}/tasks`)
      const json = await res.json()
      setTasks(json.data ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [tenant, item.id])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleToggle(taskId: number, currentStatus: number) {
    const newStatus = currentStatus === 1 ? 0 : 1;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completado: newStatus, completado_at: newStatus === 1 ? new Date().toISOString() : null } : t));
    try {
      await fetch(`/api/${tenant}/backlog/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completado: newStatus }) })
      onUpdated();
    } catch (e) { fetchTasks(); }
  }

  function fmtTime(iso: string) { return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 shrink-0">
          <div><h2 className="font-bold text-indigo-900 text-lg">Ejecución de Checklist</h2><p className="text-[10px] text-indigo-600 font-mono mt-0.5 font-bold uppercase tracking-widest">{item.code}</p></div>
          <button onClick={onClose} className="text-indigo-400 hover:text-indigo-700 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-4 overflow-y-auto bg-gray-50 flex-1">
          {loading ? <p className="text-center text-sm text-gray-400 py-10">Cargando checklist...</p> : tasks.length === 0 ? <p className="text-center text-sm text-gray-400 italic py-10">Este ticket no tiene tareas configuradas en el backlog.</p> : (
            <div className="space-y-3">
              {tasks.map(t => (
                <label key={t.id} className={`flex items-start gap-3 p-4 bg-white border rounded-lg shadow-sm cursor-pointer transition-colors ${t.completado === 1 ? 'border-green-300 bg-green-50/40' : 'hover:border-indigo-300 border-gray-200'}`}>
                  <div className="pt-0.5"><input type="checkbox" checked={t.completado === 1} onChange={() => handleToggle(t.id, t.completado)} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer" /></div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium transition-all ${t.completado === 1 ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{t.descripcion}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {t.peso > 0 ? <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Peso: {t.peso}%</span> : <span className="text-[9px] font-bold text-gray-300 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Sin peso</span>}
                      {t.completado === 1 && t.completado_at && <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">✓ Completado el {fmtTime(t.completado_at)}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}