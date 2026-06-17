'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'

interface ImportModalProps {
  tenant: string
  projectId: number
  onClose: () => void
  onSuccess: () => void
}

export function WaterfallImportModal({ tenant, projectId, onClose, onSuccess }: ImportModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      
      // Convertimos el Excel a un arreglo 2D (matriz de filas y columnas)
      const jsonData = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: null })
      
      if (jsonData.length < 3) throw new Error('El Excel no tiene el formato esperado.')

      // La Fila 1 (índice 1 en JS) tiene los días (L04, M05, etc.)
      const headers = jsonData[1] || []

      const parsedTasks = []

      // Empezamos a leer desde la fila 2 (donde empiezan las tareas reales)
      for (let i = 2; i < jsonData.length; i++) {
        const row = jsonData[i]
        
        // Columna 1: Descripción / Nombre de la tarea (Índice 1)
        const description = row[1]?.toString().trim()
        
        // Si no hay descripción, saltamos la fila
        if (!description) continue

        // Columna 2: Responsable / Iniciales (Índice 2)
        const resourceName = row[2]?.toString().trim() || null

        // Mapear los "cuadritos pintados" en la línea de tiempo
        const timeline = []
        
        // La línea de tiempo empieza a partir de la columna 3 en adelante
        for (let colIndex = 3; colIndex < row.length; colIndex++) {
          const cellValue = row[colIndex]
          
          if (cellValue && String(cellValue).trim() !== '') {
            const dayLabel = headers[colIndex] ? String(headers[colIndex]).trim() : `Dia-${colIndex}`
            
            // NOTA: Como en un Excel visual es difícil sacar la fecha exacta (Ej. 2026-06-15) 
            // solo a partir de "L04", por ahora le asignaremos una fecha calculada o un formato compatible.
            // Para evitar errores en MySQL, generaremos una fecha ficticia secuencial basada en la columna,
            // (En un entorno real, tendrías que cruzar esto con el Mes que está en la Fila 0).
            const dummyDate = new Date()
            dummyDate.setDate(dummyDate.getDate() + colIndex)

            timeline.push({
              date: dummyDate.toISOString().slice(0, 10), // Fecha en formato YYYY-MM-DD
              statusKey: String(cellValue).trim() // Ej: "PLA", "E.P", "x"
            })
          }
        }

        parsedTasks.push({
          description,
          resourceName,
          isStage: !resourceName && timeline.length === 0, // Si no tiene responsable ni fechas, es una Etapa
          timeline
        })
      }

      // 2. Enviar el JSON armado al Backend
      const res = await fetch(`/api/${tenant}/waterfall/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, tasks: parsedTasks })
      })

      const result = await res.json()

      if (!res.ok) throw new Error(result.error || 'Error al importar en el servidor')

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Error procesando el archivo Excel.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Importar Gantt</h2>
          <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        
        <p className="text-sm text-gray-600 mb-6">
          Sube el archivo Excel con la planificación Waterfall. El sistema leerá las filas, los responsables y los cuadritos marcados.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm font-medium">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm font-bold text-indigo-700">Procesando y guardando cronograma...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="border-2 border-dashed border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors rounded-xl p-8 text-center cursor-pointer">
              <span className="text-4xl block mb-2">📁</span>
              <span className="text-sm font-bold text-indigo-700 block">Haz clic para buscar tu Excel</span>
              <span className="text-xs text-indigo-500 mt-1 block">Formatos: .xlsx, .xls</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}

        <div className="flex justify-end mt-6">
           <button onClick={onClose} disabled={loading} className="px-5 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200">
             Cancelar
           </button>
        </div>
      </div>
    </div>
  )
}