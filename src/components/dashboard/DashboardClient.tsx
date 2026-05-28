'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import type { Role } from '@/lib/rbac'

interface Project { id: number; code: string; name: string }

interface ProjectKPI {
  project_id: number; project_code: string; project_name: string; project_status: string
  total_backlog: number; completed: number; in_progress: number
  in_revision: number; pending: number; blocked: number
  avg_progress: number; completion_pct: number; overdue: number
}

interface SprintKPI {
  sprint_id: number; project_id: number; sprint_number: number; sprint_name: string
  start_date: string | null; end_date: string | null; days_remaining: number | null
  total_items: number; completed: number; in_progress: number
  in_revision: number; pending: number; blocked: number
  completion_pct: number; overdue: number
}

interface StatusDist { project_id: number; status: string; total: number }

interface OverdueItem {
  id: number; project_id: number; project_name: string
  code: string; description: string; status: string
  eta: string; days_overdue: number
}

interface UpcomingItem {
  id: number; project_id: number; project_name: string
  code: string; description: string; status: string
  eta: string; days_until: number
}

interface ObsStats {
  abierta:        number
  en_seguimiento: number
  resuelta:       number
  cerrada:        number
  vencidas:       number
  por_vencer:     number
  a_tiempo:       number
}

interface ObsOverdueDev { developer_name: string; total: number }

interface DevStat {
  developer_name:   string
  total:            number
  completado:       number
  en_progreso:      number
  en_revision:      number
  pendiente:        number
  bloqueado:        number
  vencidas:     number
  avg_progress: number
}

interface DashboardData {
  projects:       ProjectKPI[]
  sprints:        SprintKPI[]
  statusDist:     StatusDist[]
  overdueItems:   OverdueItem[]
  upcomingItems:  UpcomingItem[]
  obsStats:       ObsStats | null
  obsOverdueDevs: ObsOverdueDev[]
  devStats:       DevStat[]
}

const STATUS_COLORS_MAP: Record<string, string> = {
  completado:  '#22c55e',
  en_progreso: '#3b82f6',
  en_revision: '#eab308',
  pendiente:   '#d1d5db',
  bloqueado:   '#ef4444',
}

const STATUS_TEXT: Record<string, string> = {
  pendiente:   'bg-gray-100 text-gray-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  en_revision: 'bg-yellow-100 text-yellow-700',
  completado:  'bg-green-100 text-green-700',
  bloqueado:   'bg-red-100 text-red-700',
}

export function DashboardClient({ projects, tenant, role: _role }: {
  projects: Project[]; tenant: string; role: Role
}) {
  const [projectId, setProjectId] = useState<number | null>(null)
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const url = projectId
        ? `/api/${tenant}/dashboard?projectId=${projectId}`
        : `/api/${tenant}/dashboard`
      const res  = await fetch(url)
      const json = await res.json()
      if (!res.ok) { setError(`Error ${res.status}: ${json.error}`); return }
      setData(json)
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    } finally {
      setLoading(false)
    }
  }, [projectId, tenant])

  useEffect(() => { 
    fetchData() 
  }, [fetchData])

  const totals = data?.projects.reduce((acc, p) => ({
    total:       acc.total       + Number(p.total_backlog || 0),
    completed:   acc.completed   + Number(p.completed || 0),
    in_progress: acc.in_progress + Number(p.in_progress || 0),
    in_revision: acc.in_revision + Number(p.in_revision || 0),
    pending:     acc.pending     + Number(p.pending || 0),
    blocked:     acc.blocked     + Number(p.blocked || 0),
    overdue:     acc.overdue     + Number(p.overdue || 0),
  }), { total: 0, completed: 0, in_progress: 0, in_revision: 0, pending: 0, blocked: 0, overdue: 0 })

  const globalPct = totals && totals.total > 0
    ? Math.round(totals.completed / totals.total * 100) : 0

  const barData = data?.projects.map(p => ({
    name:          p.project_code,
    fullName:      p.project_name,
    Completado:    p.completed,
    'En progreso': p.in_progress,
    'En revisión': p.in_revision,
    Pendiente:     p.pending,
    Bloqueado:     p.blocked,
  })) ?? []

  const pieData = totals ? [
    { name: 'Completado',  value: totals.completed,   color: STATUS_COLORS_MAP.completado  },
    { name: 'En progreso', value: totals.in_progress, color: STATUS_COLORS_MAP.en_progreso },
    { name: 'En revisión', value: totals.in_revision, color: STATUS_COLORS_MAP.en_revision },
    { name: 'Pendiente',   value: totals.pending,     color: STATUS_COLORS_MAP.pendiente   },
    { name: 'Bloqueado',   value: totals.blocked,     color: STATUS_COLORS_MAP.bloqueado   },
  ].filter(d => d.value > 0) : []

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          className="border rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          value={projectId ?? ''}
          onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Todos los proyectos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
        <button onClick={fetchData}
          className="border px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          ↻ Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          Cargando dashboard...
        </div>
      ) : data && (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <KpiCard label="Total RQs"   value={totals?.total       ?? 0} color="text-gray-800"   bg="bg-white"     />
            <KpiCard label="Completados" value={totals?.completed   ?? 0} color="text-green-700"  bg="bg-green-50"  />
            <KpiCard label="En progreso" value={totals?.in_progress ?? 0} color="text-blue-700"   bg="bg-blue-50"   />
            <KpiCard label="En revisión" value={totals?.in_revision ?? 0} color="text-yellow-700" bg="bg-yellow-50" />
            <KpiCard label="Pendientes"  value={totals?.pending     ?? 0} color="text-gray-600"   bg="bg-gray-50"   />
            <KpiCard label="Bloqueados"  value={totals?.blocked     ?? 0} color="text-red-700"    bg="bg-red-50"    />
            <KpiCard label="ETA vencida" value={totals?.overdue     ?? 0} color="text-orange-700" bg="bg-orange-50" />
          </div>

          {/* ── Avance global + Distribución ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white rounded-lg shadow p-5">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-semibold text-gray-700">Avance global del backlog</h2>
                <span className="text-2xl font-bold text-blue-600">{globalPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
                <div className="bg-blue-500 h-3 rounded-full transition-all duration-700"
                  style={{ width: `${globalPct}%` }} />
              </div>
              {barData.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Items por proyecto y estado</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value, name) => [value, name]}
                        labelFormatter={label =>
                          barData.find(b => b.name === label)?.fullName ?? String(label)
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Completado"   fill={STATUS_COLORS_MAP.completado}  stackId="a" />
                      <Bar dataKey="En progreso"  fill={STATUS_COLORS_MAP.en_progreso} stackId="a" />
                      <Bar dataKey="En revisión"  fill={STATUS_COLORS_MAP.en_revision} stackId="a" />
                      <Bar dataKey="Pendiente"    fill={STATUS_COLORS_MAP.pendiente}   stackId="a" />
                      <Bar dataKey="Bloqueado"    fill={STATUS_COLORS_MAP.bloqueado}   stackId="a" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Distribución por estado — barras horizontales CSS */}
            <div className="bg-white rounded-lg shadow p-5 text-gray-800">
              <h2 className="font-semibold text-gray-700 mb-4">Distribución por estado</h2>
              {pieData.length > 0 && totals && totals.total > 0 ? (
                <div className="space-y-3">
                  {pieData.map(d => {
                    const pct = Math.round(d.value / totals.total * 100)
                    return (
                      <div key={d.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                              style={{ backgroundColor: d.color }} />
                            <span className="text-gray-600">{d.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">{d.value}</span>
                            <span className="text-gray-400 w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: d.color }}
                          />
                        </div>
                      </div>
                    )
                  })}

                  <div className="mt-4 pt-3 border-t">
                    <p className="text-xs text-gray-400 mb-2">Distribución total</p>
                    <div className="flex rounded-full overflow-hidden h-4">
                      {pieData.map(d => {
                        const pct = Math.round(d.value / totals.total * 100)
                        if (pct === 0) return null
                        return (
                          <div
                            key={d.name}
                            className="h-4 transition-all"
                            style={{ width: `${pct}%`, backgroundColor: d.color }}
                            title={`${d.name}: ${d.value} (${pct}%)`}
                          />
                        )
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0</span>
                      <span>{totals.total} items</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>
              )}
            </div>
          </div>

          {/* ── Sprint activo + CARGA DE TRABAJO ── */}
          {data.sprints.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Sprint activo</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.sprints.map(s => {
                  const proj = data.projects.find(p => p.project_id === s.project_id)
                  return (
                    <div key={s.sprint_id} className="border rounded-lg p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-xs text-gray-400 font-mono">{proj?.project_code}</p>
                            <p className="font-medium text-sm text-gray-800">{proj?.project_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Sprint #{s.sprint_number} — {s.sprint_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-green-600">{s.completion_pct}%</p>
                            <p className="text-xs text-gray-400">{s.completed}/{s.total_items}</p>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                          <div className="bg-green-500 h-2 rounded-full transition-all duration-700"
                            style={{ width: `${s.completion_pct}%` }} />
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-center text-[10px] mb-2 font-bold uppercase tracking-tighter">
                          <div className="bg-blue-50 rounded p-1.5">
                            <p className="text-blue-700 text-sm">{s.in_progress}</p>
                            <p className="text-blue-400">Progreso</p>
                          </div>
                          <div className="bg-yellow-50 rounded p-1.5">
                            <p className="text-yellow-700 text-sm">{s.in_revision}</p>
                            <p className="text-yellow-400">Revisión</p>
                          </div>
                          <div className="bg-red-50 rounded p-1.5">
                            <p className="text-red-700 text-sm">{s.blocked}</p>
                            <p className="text-red-400">Bloqueados</p>
                          </div>
                          <div className="bg-orange-50 rounded p-1.5">
                            <p className="text-orange-700 text-sm">{s.overdue}</p>
                            <p className="text-orange-400">Vencidos</p>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1 mb-2">
                          {s.end_date && <span>Fin: {s.end_date.toString().slice(0, 10)}</span>}
                          {s.days_remaining !== null && (
                            <span className={s.days_remaining < 0 ? 'text-red-500 font-medium' : ''}>
                              {s.days_remaining >= 0
                                ? `${s.days_remaining} días restantes`
                                : `Vencido hace ${Math.abs(s.days_remaining)} días`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* KPI DE CARGA DE TALENTOS POR CADA SPRINT ACTIVO */}
                      <ActiveSprintDevLoad tenant={tenant} projectId={s.project_id} sprintNum={s.sprint_number} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Observaciones ── */}
          {data.obsStats && (
            <ObsStatsPanel stats={data.obsStats} overdueDevs={data.obsOverdueDevs} />
          )}

          {/* ── Estadísticas por desarrollador ── */}
          {data.devStats.length > 0 && (
            <DevStatsPanel devStats={data.devStats} />
          )}

          {/* ── Próximos a vencer + ETA vencida ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Próximos a vencer */}
            {data.upcomingItems && data.upcomingItems.length > 0 && (
              <div className="bg-white rounded-lg shadow p-5">
                <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>
                  Próximos a vencer — 7 días ({data.upcomingItems.length})
                </h2>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {data.upcomingItems.map(item => (
                    <div key={item.id}
                      className="flex items-start justify-between px-3 py-2 border rounded-lg hover:bg-yellow-50 transition-colors">
                      <div className="flex-1 min-w-0 mr-3 text-gray-800">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{item.code}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400 truncate font-medium">{item.project_name}</span>
                        </div>
                        <p className="text-sm text-gray-700 truncate font-medium">{item.description}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_TEXT[item.status] ?? ''}`}>
                            {item.status.replace(/_/g, ' ')}
                          </span>
                          {/* ETIQUETAS DE TALENTOS PARA ITEMS PRÓXIMOS A VENCER */}
                          <TicketTalents tenant={tenant} projectId={item.project_id} itemCode={item.code} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-gray-600">
                          {item.eta.toString().slice(0, 10)}
                        </p>
                        <span className={`text-[10px] font-black uppercase ${
                          item.days_until === 0 ? 'text-red-600'    :
                          item.days_until <= 2  ? 'text-orange-600' :
                          'text-gray-500'
                        }`}>
                          {item.days_until === 0 ? 'Vence hoy'    :
                           item.days_until === 1 ? 'Vence mañana' :
                           `${item.days_until} días`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ETA vencida */}
            {data.overdueItems.length > 0 && (
              <div className="bg-white rounded-lg shadow p-5">
                <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                  ETA vencida ({data.overdueItems.length})
                </h2>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1 text-gray-800">
                  {data.overdueItems.map(item => (
                    <div key={item.id}
                      className="flex items-start justify-between px-3 py-2 border rounded-lg hover:bg-red-50 transition-colors">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{item.code}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400 truncate font-medium">{item.project_name}</span>
                        </div>
                        <p className="text-sm text-gray-700 truncate font-medium">{item.description}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_TEXT[item.status] ?? ''}`}>
                            {item.status.replace(/_/g, ' ')}
                          </span>
                          {/* ETIQUETAS DE TALENTOS PARA ITEMS VENCIDOS */}
                          <TicketTalents tenant={tenant} projectId={item.project_id} itemCode={item.code} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-orange-600">
                          {item.eta.toString().slice(0, 10)}
                        </p>
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase tracking-tighter">
                          +{item.days_overdue} días
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Tabla detallada ── */}
          <div className="bg-white rounded-lg shadow p-5 text-gray-800">
            <h2 className="font-semibold text-gray-700 mb-4">Detalle por proyecto</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="px-3 py-3 text-left whitespace-nowrap">Proyecto</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Total</th>
                    <th className="px-3 py-3 text-center text-green-600 whitespace-nowrap">Completado</th>
                    <th className="px-3 py-3 text-center text-blue-600 whitespace-nowrap">Progreso</th>
                    <th className="px-3 py-3 text-center text-yellow-600 whitespace-nowrap">Revisión</th>
                    <th className="px-3 py-3 text-center text-gray-500 whitespace-nowrap">Pendiente</th>
                    <th className="px-3 py-3 text-center text-red-600 whitespace-nowrap">Bloqueado</th>
                    <th className="px-3 py-3 text-center text-orange-600 whitespace-nowrap">ETA vencida</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Avance prom.</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">% Completado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.projects.map(p => (
                    <tr key={p.project_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2">
                        <p className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-tighter">{p.project_code}</p>
                        <p className="font-medium text-gray-800">{p.project_name}</p>
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{p.total_backlog}</td>
                      <td className="px-3 py-2 text-center text-green-700 font-bold">{p.completed}</td>
                      <td className="px-3 py-2 text-center text-blue-700 font-bold">{p.in_progress}</td>
                      <td className="px-3 py-2 text-center text-yellow-700 font-bold">{p.in_revision}</td>
                      <td className="px-3 py-2 text-center text-gray-500 font-bold">{p.pending}</td>
                      <td className="px-3 py-2 text-center text-red-700 font-bold">{p.blocked}</td>
                      <td className="px-3 py-2 text-center font-bold">
                        {p.overdue > 0 ? (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase">
                            {p.overdue}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full"
                              style={{ width: `${p.avg_progress}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-gray-500">{p.avg_progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          p.completion_pct >= 80 ? 'bg-green-100 text-green-700'   :
                          p.completion_pct >= 50 ? 'bg-blue-100 text-blue-700'    :
                          p.completion_pct >= 25 ? 'bg-yellow-100 text-yellow-700':
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {p.completion_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.projects.length > 1 && totals && (
                    <tr className="bg-gray-50 font-black border-t-2 text-gray-800">
                      <td className="px-3 py-3">TOTAL GENERAL</td>
                      <td className="px-3 py-3 text-center">{totals.total}</td>
                      <td className="px-3 py-3 text-center text-green-700">{totals.completed}</td>
                      <td className="px-3 py-3 text-center text-blue-700">{totals.in_progress}</td>
                      <td className="px-3 py-3 text-center text-yellow-700">{totals.in_revision}</td>
                      <td className="px-3 py-3 text-center text-gray-500">{totals.pending}</td>
                      <td className="px-3 py-3 text-center text-red-700">{totals.blocked}</td>
                      <td className="px-3 py-3 text-center text-orange-700">{totals.overdue}</td>
                      <td className="px-3 py-3 text-center text-gray-600">{globalPct}%</td>
                      <td className="px-3 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-tighter">
                          {globalPct}%
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, color, bg }: {
  label: string; value: number; color: string; bg: string
}) {
  return (
    <div className={`${bg} rounded-lg shadow p-4 text-center border border-gray-100 hover:shadow-md transition-shadow`}>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</p>
    </div>
  )
}

// ─── COMPONENTE: CARGA DE TRABAJO Y TALENTOS EN SPRINT ───────────────────────
interface FetchedItem {
  status: string;
  code: string;
  tech_columns: string | Array<{ value?: string }>;
}

function ActiveSprintDevLoad({ tenant, projectId, sprintNum }: { tenant: string, projectId: number, sprintNum: number }) {
  const [devLoad, setDevLoad] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLoad() {
      try {
        const res = await fetch(`/api/${tenant}/backlog?projectId=${projectId}&sprintNum=${sprintNum}`)
        const json = await res.json()
        if (!res.ok) return
        
        const load: Record<string, number> = {}
        const items: FetchedItem[] = json.data || []
        
        items.forEach((item) => {
          let techCols = item.tech_columns
          if (typeof techCols === 'string') {
            try { techCols = JSON.parse(techCols) } catch { techCols = [] }
          }
          
          if (Array.isArray(techCols)) {
            techCols.forEach((tc) => {
              const dev = tc.value?.trim()
              if (dev && dev !== '-' && dev.toLowerCase() !== 'n/a' && dev.toLowerCase() !== 'na') {
                load[dev] = (load[dev] || 0) + 1
              }
            })
          }
        })
        setDevLoad(load)
      } catch (e) {
        // Fallo silencioso
      } finally {
        setLoading(false)
      }
    }
    fetchLoad()
  }, [tenant, projectId, sprintNum])

  if (loading) return <div className="text-[10px] text-gray-400 mt-auto pt-3 border-t font-bold uppercase tracking-widest">Calculando talentos...</div>
  
  const entries = Object.entries(devLoad).sort((a, b) => b[1] - a[1])
  const totalTalents = entries.length

  if (totalTalents === 0) return <div className="text-[10px] text-gray-400 italic mt-auto pt-3 border-t font-medium uppercase tracking-widest">0 Talentos asignados</div>

  return (
    <div className="mt-auto pt-4 border-t border-gray-100">
      <div className="flex justify-between items-center mb-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Carga de Trabajo
        </p>
        <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full uppercase border border-blue-100">
          {totalTalents} {totalTalents === 1 ? 'talento asignado' : 'talentos asignados'}
        </span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {entries.map(([dev, count]) => (
          <div key={dev} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2 py-1 rounded shadow-sm hover:border-blue-200 transition-colors group">
            <span className="font-bold text-[11px] text-gray-600 group-hover:text-blue-600 transition-colors">{dev}</span>
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black min-w-[20px] text-center shadow-sm">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── OBSERVACIONES ────────────────────────────────────────────────────────────
function ObsStatsPanel({ stats, overdueDevs }: { stats: ObsStats; overdueDevs: ObsOverdueDev[] }) {
  const total   = stats.abierta + stats.en_seguimiento + stats.resuelta + stats.cerrada
  if (total === 0) return null
  const activas = stats.abierta + stats.en_seguimiento

  const estados = [
    { label: 'Abiertas',       value: stats.abierta,        color: '#6b7280', bg: 'bg-gray-50',  text: 'text-gray-700'  },
    { label: 'En seguimiento', value: stats.en_seguimiento, color: '#3b82f6', bg: 'bg-blue-50',  text: 'text-blue-700'  },
    { label: 'Resueltas',      value: stats.resuelta,       color: '#22c55e', bg: 'bg-green-50', text: 'text-green-700' },
    { label: 'Cerradas',       value: stats.cerrada,        color: '#d1d5db', bg: 'bg-gray-100', text: 'text-gray-500'  },
  ]
  const eta = [
    { label: 'Vencidas',   value: stats.vencidas,   color: '#ef4444', text: 'text-red-700',    dot: 'bg-red-500'    },
    { label: 'Por vencer', value: stats.por_vencer, color: '#f97316', text: 'text-orange-700', dot: 'bg-orange-400' },
    { label: 'A tiempo',   value: stats.a_tiempo,   color: '#22c55e', text: 'text-green-700',  dot: 'bg-green-500'  },
  ]

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700">Observaciones</h2>
        <span className="text-xs text-gray-400">{total} total · {activas} activas</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Por estado */}
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Por estado</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {estados.map(e => (
              <div key={e.label} className={`${e.bg} rounded-lg p-3 text-center`}>
                <p className={`text-2xl font-black ${e.text}`}>{e.value}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{e.label}</p>
              </div>
            ))}
          </div>
          <div className="flex rounded-full overflow-hidden h-2.5">
            {estados.map(e => {
              const pct = total > 0 ? Math.round(e.value / total * 100) : 0
              if (pct === 0) return null
              return <div key={e.label} className="h-2.5 transition-all" title={`${e.label}: ${e.value} (${pct}%)`}
                style={{ width: `${pct}%`, backgroundColor: e.color }} />
            })}
          </div>
        </div>

        {/* ETA activas */}
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">ETA (activas)</p>
          <div className="space-y-2.5">
            {eta.map(e => {
              const pct = activas > 0 ? Math.round(e.value / activas * 100) : 0
              return (
                <div key={e.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${e.dot}`} />
                      <span className="text-gray-600">{e.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-black ${e.text}`}>{e.value}</span>
                      <span className="text-gray-400 w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: e.color }} />
                  </div>
                </div>
              )
            })}
          </div>
          {activas === 0 && <p className="text-xs text-gray-400 italic mt-2">Sin observaciones activas</p>}
        </div>

        {/* Devs en observaciones vencidas */}
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
            Responsables con obs. vencidas
          </p>
          {overdueDevs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Sin responsables en obs. vencidas</p>
          ) : (
            <div className="space-y-2">
              {overdueDevs.map(d => (
                <div key={d.developer_name} className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                  <span className="text-sm font-medium text-gray-700">{d.developer_name}</span>
                  <span className="text-xs font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                    {d.total} obs.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ESTADÍSTICAS POR DESARROLLADOR ──────────────────────────────────────────
function DevStatsPanel({ devStats }: { devStats: DevStat[] }) {
  const maxTotal = Math.max(...devStats.map(d => d.total), 1)

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700">Estadísticas por desarrollador</h2>
        <span className="text-xs text-gray-400">{devStats.length} desarrolladores</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
              <th className="px-3 py-3 text-left">Desarrollador</th>
              <th className="px-3 py-3 text-center">Carga</th>
              <th className="px-3 py-3 text-center text-green-600">Completado</th>
              <th className="px-3 py-3 text-center text-blue-600">En progreso</th>
              <th className="px-3 py-3 text-center text-yellow-600">Revisión</th>
              <th className="px-3 py-3 text-center text-gray-500">Pendiente</th>
              <th className="px-3 py-3 text-center text-red-600">Bloqueado</th>
              <th className="px-3 py-3 text-center text-orange-600">ETA vencida</th>
              <th className="px-3 py-3 text-center">Avance prom.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {devStats.map(d => {
              const completionPct = d.total > 0 ? Math.round(d.completado / d.total * 100) : 0
              const cargaPct      = Math.round(d.total / maxTotal * 100)
              return (
                <tr key={d.developer_name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center shrink-0">
                        {d.developer_name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800">{d.developer_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-indigo-500 h-2 rounded-full transition-all"
                          style={{ width: `${cargaPct}%` }} />
                      </div>
                      <span className="text-xs font-black text-gray-700 w-5 text-right">{d.total}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-black text-green-700">{d.completado}</span>
                      {completionPct > 0 && (
                        <span className="text-[9px] text-gray-400">{completionPct}%</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-blue-700">{d.en_progreso || '—'}</td>
                  <td className="px-3 py-3 text-center font-bold text-yellow-700">{d.en_revision || '—'}</td>
                  <td className="px-3 py-3 text-center font-bold text-gray-500">{d.pendiente || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    {d.bloqueado > 0
                      ? <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-black">{d.bloqueado}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {d.vencidas > 0
                      ? <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black">{d.vencidas}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-14 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${d.avg_progress}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{d.avg_progress}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── NUEVO COMPONENTE: TALENTOS POR TICKET VENCIDO ─────────────────────────
function TicketTalents({ tenant, projectId, itemCode }: { tenant: string, projectId: number, itemCode: string }) {
  const [talents, setTalents] = useState<string[]>([])

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await fetch(`/api/${tenant}/backlog?projectId=${projectId}&search=${itemCode}`)
        const json = await res.json()
        if (!res.ok) return

        const items: FetchedItem[] = json.data || []
        const targetItem = items.find(i => i.code === itemCode)
        
        if (targetItem) {
          let techCols = targetItem.tech_columns
          if (typeof techCols === 'string') {
            try { techCols = JSON.parse(techCols) } catch { techCols = [] }
          }
          
          const devs: string[] = []
          if (Array.isArray(techCols)) {
            techCols.forEach((tc) => {
              const dev = tc.value?.trim()
              if (dev && dev !== '-' && dev.toLowerCase() !== 'n/a' && dev.toLowerCase() !== 'na') {
                devs.push(dev)
              }
            })
          }
          setTalents(devs)
        }
      } catch (e) {
        // Silencioso
      }
    }
    fetchItem()
  }, [tenant, projectId, itemCode])

  if (talents.length === 0) return null

  return (
    <>
      {talents.map((t, idx) => (
        <span key={idx} className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter flex items-center gap-0.5 shadow-sm">
          👤 {t}
        </span>
      ))}
    </>
  )
}