'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

interface TechCol { id: number; col_key: string; name: string }

interface Props {
  tenant: string
  projectId: number
  techCols: TechCol[]
  onClose: () => void
  // 👇 Cambiado para mandar la data al padre y procesar en segundo plano
  onStartImport: (payload: any) => void 
}

const BASE_HEADERS: Record<string, string> = {
  // Código
  'codigo': 'codigo',
  'cod': 'codigo',
  
  // Módulo
  'modulo': 'modulo',
  'módulo': 'modulo',
  'module': 'modulo',
  
  // Descripción
  'descripcion': 'descripcion',
  'descripción': 'descripcion',
  'descripcion general': 'descripcion',
  'descripción general': 'descripcion',
  
  // Avance
  'avance': 'avance',
  'progress': 'avance',
  '%': 'avance',
  
  // Estado
  'estado': 'estado',
  'status': 'estado',
  
  // Sprint
  'sprint': 'sprint',
  'sprin': 'sprint', // Esto arregla el error de "SPRIN"
  
  // Fechas y ETA
  'fech reg': 'fech_reg',
  'fecha reg': 'fech_reg',
  'fech rec': 'fech_reg', // Ajuste para "FECH REC" que vi en tu captura
  'eta': 'eta',
  
  // Comentarios
  'comentario': 'comentario',
  'comentarios': 'comentario',
  
  // Prioridad
  'prio': 'prioridad',      // Esto arregla el error de "PRIO"
  'prioridad': 'prioridad',
  
  // Fechas Revisión
  'fech rev': 'fech_rev',   // Esto arregla el error de "FECH REV"
  'fecha rev': 'fech_rev',
  
  // Otros
  'ticket relacionado': 'ticket_relacionado',
  'ticket': 'ticket_relacionado',
  'tipo': 'tipo'
}

export function ImportModal({ tenant, projectId, techCols, onClose, onStartImport }: Props) {
  const [step, setStep]           = useState<'upload' | 'preview'>('upload')
  const [fileName, setFileName]   = useState('')
  const [error, setError]         = useState('')
  const inputRef                  = useRef<HTMLInputElement>(null)

  const [sheetsData, setSheetsData] = useState({ backlog: [] as any[], sprints: [] as any[], obs: [] as any[] })
  const [activeTab, setActiveTab] = useState<'backlog' | 'sprints' | 'obs'>('backlog')
  
  // Guardará las columnas dinámicas (tecnologías) encontradas en el Excel
  const [dynamicCols, setDynamicCols] = useState<string[]>([])

  function handleFile(file: File) {
    setError('')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })

        const backlogName = workbook.SheetNames.find(n => /backlog/i.test(n) && !/sprint/i.test(n) && !/estimacion/i.test(n))
        const sprintsName = workbook.SheetNames.find(n => /sprint/i.test(n))
        const obsName     = workbook.SheetNames.find(n => /observacion/i.test(n) || /obs/i.test(n))

        const foundDynamicCols = new Set<string>()

        const parseSheet = (sheetName: string | undefined) => {
          if (!sheetName) return []
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' })
          
          return raw.map(r => {
            const mapped: any = { codigo: '', descripcion: '' }
            
            Object.entries(r).forEach(([key, val]) => {
              const k = key.toLowerCase().trim()
              let strVal = val instanceof Date ? val.toISOString().split('T')[0] : (val !== null && val !== undefined ? String(val).trim() : '')

              let mappedKey = BASE_HEADERS[k]
              
              // Búsqueda inteligente por si Excel añade espacios invisibles
              if (!mappedKey) {
                if (k.includes('avance') || k.includes('progreso') || k.includes('%')) mappedKey = 'avance'
                else if (k.includes('estado') || k.includes('status')) mappedKey = 'estado'
                else if (k.includes('sprint')) mappedKey = 'sprint'
              }
              
              if (mappedKey === 'avance') {
                let num = 0;
                if (typeof val === 'number') {
                  num = val <= 1 && val > 0 ? val * 100 : val;
                } else {
                  let parsed = parseFloat(strVal.replace(/[%,\s]/g, ''));
                  if (!isNaN(parsed)) {
                    num = parsed <= 1 && parsed > 0 ? parsed * 100 : parsed;
                  }
                }
                mapped['avance'] = Math.round(num).toString();
              } else if (mappedKey) {
                mapped[mappedKey] = strVal
              } else {
                // Si no es una columna base, la guardamos (ignorando la basura de Excel)
                const cleanOriginalKey = key.trim()
                if (!cleanOriginalKey.toUpperCase().includes('__EMPTY') && cleanOriginalKey !== '') {
                  mapped[cleanOriginalKey] = strVal
                  foundDynamicCols.add(cleanOriginalKey)
                }
              }
            })
            return mapped
          })
        }

        const parsedBacklog = parseSheet(backlogName)
        const parsedSprints = parseSheet(sprintsName)
        const parsedObs     = parseSheet(obsName)

        if (parsedBacklog.length === 0 && parsedSprints.length === 0 && parsedObs.length === 0) {
          setError('El archivo está vacío o no contiene hojas reconocibles (Backlog, Sprints, Observaciones).')
          return
        }

        // Guardamos las cabeceras dinámicas encontradas para dibujarlas en la tabla
        setDynamicCols(Array.from(foundDynamicCols))

        setSheetsData({ backlog: parsedBacklog, sprints: parsedSprints, obs: parsedObs })
        setActiveTab(parsedBacklog.length > 0 ? 'backlog' : (parsedSprints.length > 0 ? 'sprints' : 'obs'))
        setStep('preview')
      } catch (e) {
        setError(`Error al leer el archivo: ${e instanceof Error ? e.message : 'Formato inválido'}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleImport() {
    // 👇 Le pasamos toda la data al componente padre para que lo suba en segundo plano
    onStartImport({
      projectId, 
      backlogRows: sheetsData.backlog,
      sprintRows: sheetsData.sprints,
      obsRows: sheetsData.obs
    })
    
  }

  const totalRows = sheetsData.backlog.length + sheetsData.sprints.length + sheetsData.obs.length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col relative overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Preparar Importación (Paso previo)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Indicador de pasos */}
        <div className="px-6 pt-4 flex items-center gap-2 text-xs text-gray-400">
          <span className={step === 'upload'  ? 'text-blue-600 font-medium' : ''}>1. Subir archivo</span>
          <span>→</span>
          <span className={step === 'preview' ? 'text-blue-600 font-medium' : ''}>2. Vista previa Multi-hoja</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded text-sm text-blue-700">
                <span className="mt-0.5">💡</span>
                <div>
                  <p className="font-medium mb-1">Detección automática de Tecnologías</p>
                  <p>Ahora cualquier columna que no sea estándar (como "codigo" o "estado") será detectada y **creada automáticamente** como una nueva tecnología/responsable.</p>
                </div>
              </div>

              {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              >
                <p className="text-gray-500 text-sm">Arrastra tu archivo Excel completo aquí o haz clic</p>
                <p className="text-xs text-gray-400 mt-1">Formatos soportados: .xlsx, .xls</p>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{fileName}</span> — {totalRows} filas detectadas en total
                </p>
                <button onClick={() => setStep('upload')} className="text-xs text-gray-500 hover:underline">
                  ← Cambiar archivo
                </button>
              </div>

              {/* TABS */}
              <div className="flex border-b">
                <button onClick={() => setActiveTab('backlog')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'backlog' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  Backlog ({sheetsData.backlog.length})
                </button>
                <button onClick={() => setActiveTab('sprints')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'sprints' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  Sprints / Detalles ({sheetsData.sprints.length})
                </button>
                <button onClick={() => setActiveTab('obs')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'obs' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  Observaciones ({sheetsData.obs.length})
                </button>
              </div>

              <div className="overflow-x-auto border rounded max-h-96">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">#</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Código</th>
                      {activeTab === 'obs' && <th className="px-2 py-2 text-left font-medium text-gray-600">Ticket Relacionado</th>}
                      <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-40">Descripción</th>
                      
                      {activeTab === 'backlog' && (
                        <>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Avance</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Estado</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Sprint</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">ETA</th>
                        </>
                      )}
                      {activeTab === 'sprints' && (
                        <>
                          <th className="px-2 py-2 text-left font-medium text-orange-600">Prioridad</th>
                          <th className="px-2 py-2 text-left font-medium text-orange-600">Fech. Rev</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">Sprint</th>
                        </>
                      )}
                      {activeTab === 'obs' && <th className="px-2 py-2 text-left font-medium text-gray-600">Estado</th>}
                      
                      {/* 👇 PINTAMOS LAS COLUMNAS DINÁMICAS (TECNOLOGÍAS) EN AZUL 👇 */}
                      {dynamicCols.map(col => (
                        <th key={col} className="px-2 py-2 text-left font-medium text-blue-600 whitespace-nowrap bg-blue-50/50">
                          {col}
                        </th>
                      ))}

                      <th className="px-2 py-2 text-left font-medium text-gray-600">Fec. Reg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sheetsData[activeTab].slice(0, 50).map((row, i) => (
                      <tr key={i} className={!row.codigo || !row.descripcion ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-2 py-1.5 text-gray-400">{i + 2}</td>
                        <td className="px-2 py-1.5 font-mono">{row.codigo || <span className="text-red-500">!</span>}</td>
                        {activeTab === 'obs' && <td className="px-2 py-1.5 text-gray-600">{row.ticket_relacionado}</td>}
                        <td className="px-2 py-1.5 max-w-48 truncate">{row.descripcion || <span className="text-red-500">!</span>}</td>
                        
                        {activeTab === 'backlog' && (
                          <>
                            <td className="px-2 py-1.5 text-gray-600 font-bold">{row.avance}%</td>
                            <td className="px-2 py-1.5 text-gray-600">{row.estado}</td>
                            <td className="px-2 py-1.5 text-gray-600">{row.sprint}</td>
                            <td className="px-2 py-1.5 text-gray-600">{row.eta}</td>
                          </>
                        )}
                        {activeTab === 'sprints' && (
                          <>
                            <td className="px-2 py-1.5 text-gray-600">{row.prioridad}</td>
                            <td className="px-2 py-1.5 text-gray-600">{row.fech_rev}</td>
                            <td className="px-2 py-1.5 text-gray-600">{row.sprint}</td>
                          </>
                        )}
                        {activeTab === 'obs' && <td className="px-2 py-1.5 text-gray-600">{row.estado}</td>}

                        {/* 👇 PINTAMOS LOS VALORES DE LAS COLUMNAS DINÁMICAS 👇 */}
                        {dynamicCols.map(col => (
                          <td key={col} className="px-2 py-1.5 text-gray-700 font-medium whitespace-nowrap bg-blue-50/10">
                            {row[col] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}

                        <td className="px-2 py-1.5 text-gray-600">{row.fech_reg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          {step === 'upload' && <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancelar</button>}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Atrás</button>
              <button onClick={handleImport} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-bold shadow-sm">
                Procesar en segundo plano 
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}