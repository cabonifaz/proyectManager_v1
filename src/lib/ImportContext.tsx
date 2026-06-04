'use client'
import React, { createContext, useContext, useState, ReactNode } from 'react'

interface ImportContextType {
  startBackgroundImport: (tenant: string, payload: any, onSuccess?: () => void) => Promise<void>;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [bgImportState, setBgImportState] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [bgImportResult, setBgImportResult] = useState<any>(null)
  const [bgImportError, setBgImportError] = useState('')
  const [showImportResult, setShowImportResult] = useState(false)

  const startBackgroundImport = async (tenant: string, payload: any, onSuccess?: () => void) => {
    setBgImportState('processing');
    setBgImportError('');
    try {
      const res = await fetch(`/api/${tenant}/backlog/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al importar')
      
      setBgImportResult(json)
      setBgImportState('done')
      if (onSuccess) onSuccess()
    } catch (e: any) {
      setBgImportError(e.message)
      setBgImportState('error')
    }
  }

  return (
    <ImportContext.Provider value={{ startBackgroundImport }}>
      {children}

      {/* 👇 WIDGET FLOTANTE GLOBAL 👇 */}
      {bgImportState !== 'idle' && (
        <div className="fixed bottom-6 right-6 w-80 bg-white border border-gray-200 shadow-2xl rounded-xl p-4 z-[9999] transition-all">
          {bgImportState === 'processing' && (
            <div className="flex items-center gap-4">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div>
                <p className="text-sm font-bold text-gray-800">Procesando Excel...</p>
                <p className="text-[11px] text-gray-500">Puedes navegar por el sistema.</p>
              </div>
            </div>
          )}
          {bgImportState === 'done' && (
            <div className="flex items-start gap-3">
              <span className="text-green-500 text-xl font-bold">✓</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">Importación exitosa</p>
                <button onClick={() => setShowImportResult(true)} className="text-[11px] text-blue-600 font-bold hover:underline mt-1">
                  Ver especificaciones
                </button>
              </div>
              <button onClick={() => setBgImportState('idle')} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
          )}
          {bgImportState === 'error' && (
            <div className="flex items-start gap-3">
              <span className="text-red-500 text-xl font-bold">⚠</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">Error en importación</p>
                <p className="text-[10px] text-red-500 mt-1 line-clamp-2">{bgImportError}</p>
              </div>
              <button onClick={() => setBgImportState('idle')} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
          )}
        </div>
      )}

      {/* 👇 PANTALLA FINAL DE ESPECIFICACIONES GLOBAL 👇 */}
      {showImportResult && bgImportResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="font-bold text-gray-800 mb-3 border-b border-gray-200 pb-2 text-lg">Resumen de Importación</h3>
            <ul className="space-y-2 text-sm mb-4">
              {bgImportResult.sprintsCreated > 0 && <li className="text-purple-700 font-medium">⏱️ {bgImportResult.sprintsCreated} nuevos Sprints creados</li>}
              <li className="text-blue-700 font-medium">📋 Backlog: {bgImportResult.backlogCreated} creados, {bgImportResult.backlogUpdated} actualizados</li>
              {(bgImportResult.obsCreated > 0 || bgImportResult.obsUpdated > 0) && (
                <li className="text-orange-700 font-medium">🔍 Observaciones: {bgImportResult.obsCreated} creadas, {bgImportResult.obsUpdated} actualizadas</li>
              )}
            </ul>
            {bgImportResult.errors && bgImportResult.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-yellow-700 font-bold mb-2">⚠ {bgImportResult.errors.length} advertencias encontradas:</p>
                <div className="border rounded p-3 bg-yellow-50 max-h-40 overflow-y-auto">
                  {bgImportResult.errors.map((e: string, i: number) => <p key={i} className="text-xs text-red-600 mb-1">• {e}</p>)}
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button onClick={() => { setShowImportResult(false); setBgImportState('idle'); }} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </ImportContext.Provider>
  )
}

export function useImport() {
  const context = useContext(ImportContext)
  if (!context) throw new Error('useImport must be used within ImportProvider')
  return context
}