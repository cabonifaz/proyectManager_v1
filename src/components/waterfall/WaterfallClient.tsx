'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Role } from '@/lib/rbac'
import { WaterfallImportModal } from './WaterfallImportModal'

interface StatusDict {
  id: number;
  status_key: string;
  status_name: string;
  color_hex: string;
  text_color: string;
}

export function WaterfallClient({ 
  tenant, 
  role, 
  projectId,
  dictionary
}: { 
  tenant: string; 
  role: Role; 
  projectId: number;
  dictionary: StatusDict[];
}) {
  const [showImport, setShowImport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ tasks: any[], timeline: any[] }>({ tasks: [], timeline: [] })
  const [error, setError] = useState('')

  const canManage = ['super_admin', 'gestor_proyecto'].includes(role)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/waterfall?projectId=${projectId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar cronograma')
      setData({ tasks: json.tasks || [], timeline: json.timeline || [] })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tenant, projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 🚀 LÓGICA DE DIBUJADO DE LA MATRIZ 
  const { dates, timelineMap } = useMemo(() => {
    const dateSet = new Set<string>()
    const map = new Map<string, any>()

    data.timeline.forEach(t => {
      // Formatear la fecha para que sea consistente
      const dateStr = new Date(t.target_date).toISOString().slice(0, 10)
      dateSet.add(dateStr)
      // Llave única para cruzar Tarea + Fecha rápidamente en el ciclo de dibujado
      map.set(`${t.task_id}-${dateStr}`, t)
    })

    // Ordenar las fechas cronológicamente para crear las columnas
    const sortedDates = Array.from(dateSet).sort()
    return { dates: sortedDates, timelineMap: map }
  }, [data])

  return (
    <div className="space-y-4">
      {/* Controles y Leyenda */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-2">Leyenda:</span>
          {dictionary.map(status => (
            <div key={status.id} className="flex items-center gap-1.5 border px-2 py-1 rounded shadow-sm" style={{ borderColor: `${status.color_hex}40`, backgroundColor: `${status.color_hex}10` }}>
              <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shadow-sm" style={{ backgroundColor: status.color_hex, color: status.text_color }}>
                {status.status_key}
              </span>
              <span className="text-xs font-medium text-gray-700">{status.status_name}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {canManage && (
            <button onClick={() => setShowImport(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <span>↑</span> Importar Excel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Contenedor del Gantt */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden relative">
        {loading ? (
          <div className="min-h-[400px] flex items-center justify-center text-gray-400 text-sm">Cargando diagrama...</div>
        ) : data.tasks.length === 0 ? (
          <div className="min-h-[400px] flex items-center justify-center flex-col text-center">
            <p className="text-4xl mb-3">📊</p>
            <h3 className="text-lg font-bold text-gray-700">El Diagrama está vacío</h3>
            <p className="text-sm text-gray-400 mt-1">Importa el archivo Excel para visualizar el cronograma.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
              
              {/* Cabeceras de Fechas */}
              <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm">
                <tr>
                  <th className="sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-300 p-2 w-10 text-center text-gray-500 font-medium">Nro.</th>
                  <th className="sticky left-[40px] z-30 bg-gray-100 border-b border-r border-gray-300 p-2 w-80 font-bold text-gray-700">Actividades</th>
                  <th className="sticky left-[360px] z-30 bg-gray-100 border-b border-r border-gray-300 p-2 w-24 text-center font-bold text-gray-700">Resp.</th>
                  
                  {dates.map((date, index) => (
                    <th key={date} className="border-b border-r border-gray-300 p-1 min-w-[30px] text-center font-mono text-[10px] text-gray-500">
                      D{index + 1}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Filas de Tareas */}
              <tbody className="divide-y divide-gray-200">
                {data.tasks.map((task, index) => {
                  const isStage = task.task_type === 'etapa';
                  
                  return (
                    <tr key={task.id} className={`hover:bg-indigo-50/30 transition-colors ${isStage ? 'bg-gray-50' : ''}`}>
                      <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 p-1.5 text-center text-gray-400 font-mono text-[10px]">
                        {index + 1}
                      </td>
                      <td className={`sticky left-[40px] z-10 bg-inherit border-r border-gray-200 p-1.5 px-3 truncate max-w-[320px] ${isStage ? 'font-bold text-indigo-900' : 'text-gray-700'}`}>
                        {task.description}
                      </td>
                      <td className="sticky left-[360px] z-10 bg-inherit border-r border-gray-200 p-1.5 text-center text-gray-500">
                        {task.resource_name || ''}
                      </td>

                      {/* Dibujar cuadritos en la cuadrícula */}
                      {dates.map(date => {
                        const cellData = timelineMap.get(`${task.id}-${date}`)
                        
                        return (
                          <td key={date} className="border-r border-gray-100 p-0.5 relative group">
                            {cellData ? (
                              <div 
                                className="w-full h-full min-h-[22px] flex items-center justify-center rounded-sm text-[9px] font-bold shadow-sm"
                                style={{ backgroundColor: cellData.color_hex, color: cellData.text_color }}
                                title={`${task.description} - Estado: ${cellData.status_key}`}
                              >
                                {cellData.status_key}
                              </div>
                            ) : (
                              <div className="w-full h-full min-h-[22px]"></div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <WaterfallImportModal 
          tenant={tenant}
          projectId={projectId}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false)
            fetchData() // 🚀 Recargamos los datos al importar
          }}
        />
      )}
    </div>
  )
}