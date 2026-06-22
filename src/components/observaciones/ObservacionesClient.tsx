'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Role } from '@/lib/rbac'

interface Project     { id: number; code: string; name: string; is_member?: number }
interface TechCol     { id: number; col_key: string; name: string }
interface BacklogItem { id: number; code: string; description: string }

interface Observacion {
  id: number
  project_id: number
  backlog_item_id: number | null
  tipo: 'riesgo' | 'bloqueo' | 'mejora' | 'nota'
  prioridad: number
  titulo: string
  descripcion: string | null
  estado: 'abierta' | 'asignado' | 'en_seguimiento' | 'resuelta' | 'cerrada' // 🚀 Agregado 'asignado'
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

type AsignMap = Record<number, string | null>

type FormData = {
  tipo: Observacion['tipo']
  prioridad: number | string // 🚀 Acepta string para poder estar vacío
  titulo: string
  descripcion: string
  estado: Observacion['estado']
  eta: string
  entregadoAt: string
  backlogItemId: string
}

// ── Sorting ──────────────────────────────────────────────────────────────────
type SortKey = 'tipo' | 'prioridad' | 'titulo' | 'estado' | 'eta' | 'entregado_at' | 'created_by_name' | 'created_at'
type SortDir = 'asc' | 'desc'

interface SortState { key: SortKey | null; dir: SortDir }

/** Icono de ordenamiento en el encabezado */
function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.key !== col) {
    return (
      <span className="ml-1 inline-flex flex-col leading-none opacity-30 text-[10px]">
        <span>▲</span><span>▼</span>
      </span>
    )
  }
  return (
    <span className="ml-1 text-blue-600 text-[10px]">
      {sort.dir === 'asc' ? '▲' : '▼'}
    </span>
  )
}

/** Clase para el th según si está activo */
function thClass(col: SortKey, sort: SortState) {
  return `text-left px-3 py-3 font-medium whitespace-nowrap select-none cursor-pointer transition-colors ${
    sort.key === col ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
  }`
}

/** Compara dos valores de Observacion para ordenar */
/** Compara dos valores de Observacion para ordenar */
/** Compara dos valores de Observacion para ordenar */
function compareObs(a: Observacion, b: Observacion, key: SortKey, dir: SortDir): number {
  // 🚀 1. LÓGICA EXCLUSIVA PARA PRIORIDAD
  if (key === 'prioridad') {
    // TRUCO: Si está resuelta/cerrada, la UI muestra un guion "—".
    // Le decimos al ordenamiento que las trate como un 0 para tirarlas al fondo.
    const prioA = ['resuelta', 'cerrada'].includes(a.estado) ? 0 : (Number(a.prioridad) || 0);
    const prioB = ['resuelta', 'cerrada'].includes(b.estado) ? 0 : (Number(b.prioridad) || 0);

    // Los Ceros y guiones siempre al fondo, sin importar si ordenas ASC o DESC
    if (prioA === 0 && prioB > 0) return 1;
    if (prioB === 0 && prioA > 0) return -1;
    if (prioA === 0 && prioB === 0) return 0;

    // Si ambos son números válidos (activos), los ordena
    const result = prioA - prioB;
    return dir === 'asc' ? result : -result;
  }

  // 2. LÓGICA NORMAL PARA EL RESTO DE COLUMNAS
  let valA: string | number | null
  let valB: string | number | null

  switch (key) {
    case 'eta':
      valA = a.eta ?? ''
      valB = b.eta ?? ''
      break
    case 'entregado_at':
      valA = a.entregado_at ?? ''
      valB = b.entregado_at ?? ''
      break
    case 'created_at':
      valA = a.created_at ?? ''
      valB = b.created_at ?? ''
      break
    case 'tipo':
      valA = a.tipo
      valB = b.tipo
      break
    case 'estado':
      valA = a.estado
      valB = b.estado
      break
    case 'titulo':
      valA = a.titulo.toLowerCase()
      valB = b.titulo.toLowerCase()
      break
    case 'created_by_name':
      valA = (a.created_by_name ?? '').toLowerCase()
      valB = (b.created_by_name ?? '').toLowerCase()
      break
    default:
      return 0
  }

  // Nulos/vacíos siempre al fondo para textos
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

// ── Constantes de estilos ─────────────────────────────────────────────────────
const TIPO_STYLES: Record<Observacion['tipo'], string> = {
  riesgo:  'bg-red-100 text-red-700',
  bloqueo: 'bg-orange-100 text-orange-700',
  mejora:  'bg-blue-100 text-blue-700',
  nota:    'bg-gray-100 text-gray-700',
}

const ESTADO_STYLES: Record<Observacion['estado'], string> = {
  abierta:        'bg-gray-100 text-gray-700',
  asignado:       'bg-purple-100 text-purple-700', // 🚀 Agregado color
  en_seguimiento: 'bg-blue-100 text-blue-700',
  resuelta:       'bg-green-100 text-green-700',
  cerrada:        'bg-gray-200 text-gray-500',
}

const TIPO_LABELS: Record<Observacion['tipo'], string>     = { riesgo:'Riesgo', bloqueo:'Bloqueo', mejora:'Mejora', nota:'Nota' }
const ESTADO_LABELS: Record<Observacion['estado'], string> = { abierta:'Abierta', asignado: 'Asignado', en_seguimiento:'En seguimiento', resuelta:'Resuelta', cerrada:'Cerrada' }

const EMPTY_FORM: FormData = {
  tipo:'nota', prioridad: '', titulo:'', descripcion:'', estado:'abierta', // 🚀 Inicia vacío
  eta:'', entregadoAt:'', backlogItemId:'',
}

// ── Componente principal ──────────────────────────────────────────────────────
export function ObservacionesClient({ projects, tenant, role, initialProjectId }: { // 🚀 1. Agregas initialProjectId aquí
  projects: Project[]; tenant: string; role: Role; initialProjectId?: number
}) {
  const allowedProjects = projects.filter(p => role === 'super_admin' || Number(p.is_member) > 0)

  // 1. Iniciamos en null para leer la memoria local o la URL
  const [projectId, setProjectId] = useState<number | null>(null);

  useEffect(() => {
    // 🚀 2. PRIORIDAD 1: Si viene un ID por la URL (desde el botón del Tablero)
    if (initialProjectId && allowedProjects.some(p => p.id === initialProjectId)) {
      setProjectId(initialProjectId);
      localStorage.setItem('pm_selected_project', String(initialProjectId));
      return;
    }

    // PRIORIDAD 2: Leer de la memoria local (si entraste navegando normal)
    const savedProject = localStorage.getItem('pm_selected_project');
    if (savedProject) {
      const id = Number(savedProject);
      if (allowedProjects.some(p => p.id === id)) {
        setProjectId(id);
        return;
      }
    }
    
    // PRIORIDAD 3: Por defecto, selecciona el primer proyecto de la lista
    const defaultId = allowedProjects[0]?.id ?? null;
    setProjectId(defaultId);
    if (defaultId) localStorage.setItem('pm_selected_project', String(defaultId));
  }, [allowedProjects, initialProjectId]); // 🚀 3. Agregas initialProjectId a las dependencias

  // 2. Función para guardar el cambio de proyecto en memoria
  const handleProjectChange = (newId: number) => {
    setProjectId(newId);
    localStorage.setItem('pm_selected_project', String(newId));
  };
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
  // 🚀 Arreglos para almacenar múltiples selecciones simultáneas ([] significa mostrar todos)
  const [estadoFilters, setEstadoFilters] = useState<string[]>([]) 
  const [tipoFilters, setTipoFilters]     = useState<string[]>([])

  // Opciones de configuración visual para las píldoras de filtrado
  const TIPO_OPTIONS = [
    { val: 'riesgo',  label: 'Riesgo',  color: 'bg-red-100 text-red-700' },
    { val: 'bloqueo', label: 'Bloqueo', color: 'bg-orange-100 text-orange-700' },
    { val: 'mejora',  label: 'Mejora',  color: 'bg-blue-100 text-blue-700' },
    { val: 'nota',    label: 'Nota',    color: 'bg-gray-100 text-gray-700' },
  ]

  const ESTADO_OPTIONS_LIST = [
    { val: 'abierta',        label: 'Abierta',        color: 'bg-gray-100 text-gray-700' },
    { val: 'asignado',       label: 'Asignado',       color: 'bg-purple-100 text-purple-700' },
    { val: 'en_seguimiento', label: 'En seguimiento', color: 'bg-blue-100 text-blue-700' },
    { val: 'resuelta',       label: 'Resuelta',       color: 'bg-green-100 text-green-700' },
    { val: 'cerrada',        label: 'Cerrada',        color: 'bg-gray-200 text-gray-500' },
  ]

  // Funciones auxiliares para añadir o remover filtros con un clic
  const toggleEstadoFilter = (val: string) => {
    setEstadoFilters(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])
  }

  const toggleTipoFilter = (val: string) => {
    setTipoFilters(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])
  }
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
  
  // 🚀 ESTADO NUEVO: Controla el modal de reordenamiento
  const [isReorderOpen, setIsReorderOpen]         = useState(false)

  // ── NUEVO: estado de ordenamiento ──
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' })

  const canCreate = role !== 'desarrollador'
  const canEdit   = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)
  const canDelete = ['super_admin','gestor_proyecto'].includes(role)
  const canAssign = ['super_admin','gestor_proyecto','lider_tecnico'].includes(role)

  // ── Ciclo asc → desc → sin orden al hacer click en columna ──
  function handleSort(col: SortKey) {
    setSort(prev => {
      if (prev.key !== col) return { key: col, dir: 'asc' }
      if (prev.dir === 'asc') return { key: col, dir: 'desc' }
      return { key: null, dir: 'asc' }
    })
  }

  // ── Items ordenados (derivado, sin estado extra) ──
  const sortedItems = sort.key
    ? [...items].sort((a, b) => compareObs(a, b, sort.key!, sort.dir))
    : items

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

  const fetchTechCols = useCallback(async (pid: number) => {
    try {
      const res  = await fetch(`/api/${tenant}/projects/${pid}/columns`)
      const json = await res.json()
      setTechCols(json.data ?? [])
    } catch { setTechCols([]) }
  }, [tenant])

  const fetchSprintDevs = useCallback(async (pid: number) => {
    if (!canAssign) return
    try {
      const res  = await fetch(`/api/${tenant}/projects/${pid}/sprint-developers`)
      const json = await res.json()
      setSprintDevs(json.data ?? [])
    } catch { setSprintDevs([]) }
  }, [tenant, canAssign])

  const fetchBacklogItems = useCallback(async (pid: number) => {
    try {
      const res  = await fetch(`/api/${tenant}/backlog?projectId=${pid}&limit=500`)
      const json = await res.json()
      setBacklogItems(json.data ?? [])
    } catch { setBacklogItems([]) }
  }, [tenant])

const fetchItems = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setFetchError('')
    try {
      const p = new URLSearchParams({ projectId: String(projectId) })
      
      // 🚀 Se inyectan múltiples parámetros idénticos que Next.js interpretará como arreglos
      estadoFilters.forEach(e => p.append('estado', e))
      tipoFilters.forEach(t => p.append('tipo', t))
      
      if (search) p.set('search', search)
      
      // ROMPE-CACHÉ: Le agregamos la hora exacta en milisegundos a la URL
      p.set('_t', String(Date.now()))

      const res  = await fetch(`/api/${tenant}/observaciones?${p}`, { cache: 'no-store' })
      const json = await res.json()
      
      if (!res.ok) { setFetchError(`Error ${res.status}: ${json.error}`); return }
      setItems(json.data ?? [])
    } catch { 
      setFetchError('Error de conexión') 
    } finally { 
      setLoading(false) 
    }
// 🚀 CORRECCIÓN: Usar los arreglos en las dependencias
  }, [projectId, tenant, estadoFilters, tipoFilters, search])

  // 🚀 ESTE ES EL GATILLO AUTOMÁTICO QUE FALTABA
  useEffect(() => { 
    fetchItems() 
  }, [fetchItems])

  // 🚀 ESTE ES EL GATILLO PARA EL BACKLOG Y RESPONSABLES QUE SE HABÍA BORRADO
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
    } catch { return [] }
  }

  function openCreate() {
    setEditItem(null); setForm(EMPTY_FORM); setAsignMap({}); setFormError('')
    setBacklogSearch(''); setBacklogOpen(false); setShowForm(true)
  }

async function openEdit(item: Observacion) {
    setEditItem(item)
    setForm({
      tipo:          item.tipo,
      prioridad:     item.prioridad === 0 ? '' : item.prioridad, // 🚀 Si es 0 en BD, lo mostramos vacío
      titulo:        item.titulo,
      descripcion:   item.descripcion ?? '',
      estado:        item.estado,
      eta:           item.eta          ? item.eta.slice(0, 10)          : '',
      entregadoAt:   item.entregado_at ? item.entregado_at.slice(0, 10) : '',
      backlogItemId: item.backlog_item_id ? String(item.backlog_item_id) : '',
    })
    setFormError(''); setBacklogSearch(''); setBacklogOpen(false)
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
    
    // 🚀 VALIDACIÓN: Regla estricta para el estado "Asignado"
    if (form.estado === 'asignado') {
      const tieneAsignacion = techCols.some(tc => asignMap[tc.id] != null && asignMap[tc.id] !== '');
      if (!tieneAsignacion) {
        setFormError('Para usar el estado "Asignado", debes seleccionar al menos un responsable en tecnología.');
        return;
      }
    }

    if (!projectId) return
    setSaving(true); setFormError('')
    try {
const url    = editItem ? `/api/${tenant}/observaciones/${editItem.id}` : `/api/${tenant}/observaciones`
      const method = editItem ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        projectId, 
        tipo: form.tipo, 
        prioridad: form.prioridad === '' ? 0 : Number(form.prioridad), // 🚀 Si está vacío, manda 0 a BD
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
      if (canAssign && techCols.length > 0) {
        const asignaciones = techCols
          .filter(tc => asignMap[tc.id] != null && asignMap[tc.id] !== '')
          .map(tc => ({ techColId: tc.id, colKey: tc.col_key, techName: tc.name, developerName: asignMap[tc.id]! }))
        await fetch(`/api/${tenant}/observaciones/${obsId}/asignaciones`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asignaciones }),
        })
      }
      setShowForm(false); fetchItems()
    } catch { setFormError('Error de conexión') }
    finally   { setSaving(false) }
  }

  async function confirmDelete() {
    if (!itemToDelete) return
    try {
      const res  = await fetch(`/api/${tenant}/observaciones/${itemToDelete.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Error al eliminar'); return }
      fetchItems()
    } catch { alert('Error de conexión') }
    finally {
      setIsDeleteModalOpen(false); setItemToDelete(null)
    }
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-ES', {
      timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric'
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


    // Diccionario para nombres amigables en el ordenamiento
  const SORT_LABELS: Record<string, string> = {
    tipo: 'Tipo',
    prioridad: 'Prioridad',
    titulo: 'Título',
    estado: 'Estado',
    eta: 'ETA',
    entregado_at: 'Fecha de entrega',
    created_by_name: 'Registrado por',
    created_at: 'Fecha de registro'
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={projectId ?? ''}
          onChange={e => handleProjectChange(Number(e.target.value))}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {allowedProjects.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>

        {/* 🚀 Filtros Múltiples para Tipos */}
        <div className="flex gap-1.5 items-center border-r pr-3 border-gray-200">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Tipos:</span>
          {TIPO_OPTIONS.map(t => (
            <button
              key={t.val}
              onClick={() => toggleTipoFilter(t.val)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                tipoFilters.includes(t.val) 
                  ? `${t.color} border-current shadow-sm scale-105` 
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
          {tipoFilters.length > 0 && (
            <button onClick={() => setTipoFilters([])} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">Todo</button>
          )}
        </div>

        {/* 🚀 Filtros Múltiples para Estados */}
        <div className="flex gap-1.5 items-center">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Estados:</span>
          {ESTADO_OPTIONS_LIST.map(s => (
            <button
              key={s.val}
              onClick={() => toggleEstadoFilter(s.val)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                estadoFilters.includes(s.val) 
                  ? `${s.color} border-current shadow-sm scale-105` 
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
          {estadoFilters.length > 0 && (
            <button onClick={() => setEstadoFilters([])} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">Todo</button>
          )}
        </div>

        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
        />

        {/* Indicador de ordenamiento activo */}
        {sort.key && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded">
            Orden: <strong>{SORT_LABELS[sort.key] ?? sort.key}</strong> {sort.dir === 'asc' ? '▲' : '▼'}
            <button
              onClick={() => setSort({ key: null, dir: 'asc' })}
              className="ml-1 text-blue-400 hover:text-blue-700 font-bold"
              title="Quitar ordenamiento"
            >×</button>
          </span>
        )}

       {canCreate && (
          <button
            onClick={openCreate}
            className="ml-auto bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Nueva observación
          </button>
        )}

        {/* 🚀 BOTÓN NUEVO: Abrir modal de reordenamiento */}
        {projectId && (
          <button
            onClick={() => setIsReorderOpen(true)}
            className="border border-gray-300 bg-white text-gray-700 px-3 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            ↕ Reordenar Prioridades
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
                {/* ── Encabezados clicables ── */}
                <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  Código
                </th>
                <th
                  className={thClass('tipo', sort)}
                  onClick={() => handleSort('tipo')}
                  title="Ordenar por Tipo"
                >
                  Tipo <SortIcon col="tipo" sort={sort} />
                </th>
                <th
                  className={thClass('prioridad', sort)}
                  onClick={() => handleSort('prioridad')}
                  title="Ordenar por Prioridad"
                >
                  Prioridad <SortIcon col="prioridad" sort={sort} />
                </th>
                <th
                  className={thClass('titulo', sort)}
                  onClick={() => handleSort('titulo')}
                  title="Ordenar por Título"
                >
                  Título <SortIcon col="titulo" sort={sort} />
                </th>
                <th
                  className={thClass('estado', sort)}
                  onClick={() => handleSort('estado')}
                  title="Ordenar por Estado"
                >
                  Estado <SortIcon col="estado" sort={sort} />
                </th>
                <th
                  className={thClass('eta', sort)}
                  onClick={() => handleSort('eta')}
                  title="Ordenar por ETA"
                >
                  ETA <SortIcon col="eta" sort={sort} />
                </th>
                <th
                  className={thClass('entregado_at', sort)}
                  onClick={() => handleSort('entregado_at')}
                  title="Ordenar por fecha de entrega"
                >
                  Entregado <SortIcon col="entregado_at" sort={sort} />
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">
                  Asignaciones
                </th>
                <th
                  className={thClass('created_at', sort)}
                  onClick={() => handleSort('created_at')}
                  title="Ordenar por fecha de registro"
                >
                  Registro <SortIcon col="created_at" sort={sort} />
                </th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedItems.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      #{item.id}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${TIPO_STYLES[item.tipo]}`}>
                      {TIPO_LABELS[item.tipo]}
                    </span>
                  </td>
<td className="px-3 py-3 text-xs font-medium text-gray-600">
                    {['resuelta', 'cerrada'].includes(item.estado) || item.prioridad === 0 ? (
                      <span className="text-gray-300 font-normal">—</span>
                    ) : (
                      <span>Prio: {item.prioridad}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 max-w-xs">
                    <button
                      onClick={() => openDetail(item)}
                      title={item.titulo}
                      className="text-left font-medium text-gray-800 hover:text-blue-600 transition-colors line-clamp-1 cursor-help"
                    >
                      {item.titulo}
                    </button>
                    {item.backlog_code && (
                      <span className="text-xs text-gray-400 ml-1 block mt-0.5">#{item.backlog_code}</span>
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
                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    <span className="font-medium text-gray-700 block">{item.created_by_name ?? '—'}</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">{fmtDate(item.created_at)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2 justify-end">
                      {canEdit && (
                        <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true) }}
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
                  <input
                    type="number" min="1" max="10"
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ 
                      ...f, 
                      prioridad: e.target.value === '' ? '' : Number(e.target.value) 
                    }))}
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
                    <option value="asignado">Asignado</option> {/* 🚀 Opción agregada */}
                    <option value="en_seguimiento">En seguimiento</option>
                    <option value="resuelta">Resuelta</option>
                    <option value="cerrada">Cerrada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text" value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Título de la observación"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ETA (fecha límite)</label>
                  <input
                    type="date" value={form.eta}
                    onChange={e => setForm(f => ({ ...f, eta: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha real entrega</label>
                  <input
                    type="date" value={form.entregadoAt}
                    onChange={e => setForm(f => ({ ...f, entregadoAt: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div ref={backlogRef} className="relative">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ítem Backlog</label>
                  {selectedBacklogItem && !backlogOpen ? (
                    <div className="flex items-center justify-between w-full border rounded px-4 py-2.5 text-sm bg-gray-50">
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-bold text-blue-700 text-xs">{selectedBacklogItem.code}</span>
                        <span 
                          title={selectedBacklogItem.description} 
                          className="truncate text-gray-800 font-medium cursor-help"
                        >
                          {selectedBacklogItem.description}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, backlogItemId: '' })); setBacklogSearch('') }}
                        className="text-gray-400 hover:text-red-500 ml-3 p-1 shrink-0 transition-colors"
                      >×</button>
                    </div>
                  ) : (
                    <input
                      type="text" value={backlogSearch}
                      onChange={e => { setBacklogSearch(e.target.value); setBacklogOpen(true) }}
                      onFocus={() => setBacklogOpen(true)}
                      placeholder="Buscar por código o descripción..."
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  {backlogOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto text-sm w-full min-w-[400px]">
                      {filteredBacklog.length === 0 ? (
                        <div className="px-4 py-3 text-gray-400 text-xs">Sin resultados</div>
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
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 flex gap-4 items-start transition-colors"
                            title={b.description}
                          >
                            <span className="font-bold text-blue-700 shrink-0 w-24">{b.code}</span>
                            <span className="text-gray-700 leading-tight">{b.description}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

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
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave} disabled={saving}
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-xs text-gray-400 mb-0.5">ETA (fecha límite)</p>
                  <p className={`font-medium ${etaClass(viewDetail.eta, viewDetail.estado)}`}>{fmtDate(viewDetail.eta)}</p>
                </div>
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-xs text-gray-400 mb-0.5">Fecha real de entrega</p>
                  <p className={`font-medium ${viewDetail.entregado_at ? 'text-green-600' : 'text-gray-400'}`}>{fmtDate(viewDetail.entregado_at)}</p>
                </div>
              </div>
              {detailAsigns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Responsables por tecnología</p>
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
              <button onClick={() => setViewDetail(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
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
              <h3 className="text-lg font-bold text-gray-800 mb-2">Confirmar eliminación</h3>
              <p className="text-sm text-gray-600 mb-6">
                ¿Estás seguro de que deseas eliminar la observación{' '}
                <strong className="text-gray-800">"{itemToDelete.titulo}"</strong>?
                Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => { setIsDeleteModalOpen(false); setItemToDelete(null) }}
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

      {/* 🚀 MODAL NUEVO: Drag & Drop de Prioridades */}
      {isReorderOpen && projectId && (
        <ReorderObservacionesModal
          tenant={tenant}
          projectId={projectId}
          onClose={() => {
            setIsReorderOpen(false)
            fetchItems() // Refresca la tabla principal con el nuevo orden
          }}
        />
      )}
    </div>
  )
}

// ── Componente Modal para Reordenar Prioridades (Físicas Mejoradas) ─────────
function ReorderObservacionesModal({ tenant, projectId, onClose }: { tenant: string; projectId: number; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([])
  const [prioritySlots, setPrioritySlots] = useState<number[]>([]) 
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const fetchActiveObs = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenant}/observaciones?projectId=${projectId}`, { cache: 'no-store' })
      const json = await res.json()
      
      const allItems = Array.isArray(json.data) ? json.data : []
      
      const active = allItems.filter((o: any) => {
        const estadoReal = o.estado ? String(o.estado).toLowerCase() : ''
        const isEstadoValido = ['abierta', 'asignado', 'en_seguimiento'].includes(estadoReal)
        const tienePrioridad = Number(o.prioridad) > 0
        return isEstadoValido && tienePrioridad
      })
      
      active.sort((a: any, b: any) => (Number(a.prioridad) || 99) - (Number(b.prioridad) || 99))
      
      setItems(active)
      setPrioritySlots(active.map((o: any) => Number(o.prioridad)))
    } catch (err) {
      setError('Error al recuperar las observaciones.')
    } finally {
      setLoading(false)
    }
  }, [tenant, projectId])

  useEffect(() => {
    if (projectId) fetchActiveObs()
  }, [fetchActiveObs, projectId])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Le indicamos al navegador que es un movimiento físico
    e.dataTransfer.effectAllowed = "move"
    // Un pequeño timeout permite que el navegador capture la imagen del bloque antes de aplicarle los estilos
    setTimeout(() => setDraggedIndex(index), 0)
  }

  // 🚀 Motor de físicas: onDragEnter hace que el desplazamiento sea exacto al colisionar
  const handleDragEnter = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) return

    setItems(prevItems => {
      const newItems = [...prevItems]
      const draggedItem = newItems[draggedIndex]
      
      newItems.splice(draggedIndex, 1)
      newItems.splice(targetIndex, 0, draggedItem)
      
      setDraggedIndex(targetIndex)
      return newItems
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() // Requerido por HTML5 para soltar
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const payload = items.map((item, idx) => ({
      id: item.id,
      prioridad: prioritySlots[idx] 
    }))

    try {
      const res = await fetch(`/api/${tenant}/observaciones/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, data: payload })
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Error al procesar el ordenamiento.')
        return
      }

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
            <h2 className="font-bold text-gray-800 text-lg">Jerarquía de Prioridades (Staging)</h2>
            <p className="text-xs text-gray-400 mt-0.5">Arrastra las filas verticalmente para ajustar su urgencia.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded shrink-0">
            {error}
          </div>
        )}

        <div className="px-6 py-4 overflow-y-auto flex-1 bg-gray-50/50">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-10">Cargando prioridades...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-gray-400 italic py-10">No existen observaciones con prioridad activa.</p>
          ) : (
            <div className="space-y-3 relative">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragEnter={(e) => handleDragEnter(e, idx)}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  // 🚀 Estilos de físicas: bloque sólido, levantado y con sombra al agarrarlo
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
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.titulo}</p>
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mt-0.5">
                      ID: {item.id} — {item.tipo}
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
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || items.length === 0} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-bold shadow-sm transition-colors">
            {saving ? 'Guardando...' : 'Guardar Prioridades'}
          </button>
        </div>
      </div>
    </div>
  )
}