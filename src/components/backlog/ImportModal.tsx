'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

interface TechCol { id: number; col_key: string; name: string }

interface Props {
  tenant: string
  projectId: number
  techCols: TechCol[]
  onClose: () => void
  onImported: () => void
}

interface PreviewRow {
  codigo: string
  modulo: string
  descripcion: string
  avance: string
  estado: string
  sprint: string
  eta: string
  comentario: string
  fech_reg: string
  [key: string]: string
}

interface ImportResult {
  created: number
  updated: number
  errors: string[]
}

const BASE_HEADERS: Record<string, string> = {
  'codigo':              'codigo',
  'code':                'codigo',
  'módulo':              'modulo',
  'modulo':              'modulo',
  'module':              'modulo',
  'descripción general': 'descripcion',
  'descripcion general': 'descripcion',
  'descripción':         'descripcion',
  'descripcion':         'descripcion',
  'description':         'descripcion',
  'avance':              'avance',
  'progress':            'avance',
  '%':                   'avance',
  'estado':              'estado',
  'status':              'estado',
  'sprint':              'sprint',
  'fech reg':            'fech_reg',
  'fecha reg':           'fech_reg',
  'fecha registro':      'fech_reg',
  'eta':                 'eta',
  'comentario':          'comentario',
  'comment':             'comentario',
  'comentarios':         'comentario',
}

export function ImportModal({ tenant, projectId, techCols, onClose, onImported }: Props) {
  const [step, setStep]           = useState<'upload' | 'preview' | 'result'>('upload')
  const [rows, setRows]           = useState<PreviewRow[]>([])
  const [fileName, setFileName]   = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<ImportResult | null>(null)
  const [error, setError]         = useState('')
  const inputRef                  = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setError('')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const raw      = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

        if (raw.length === 0) { setError('El archivo está vacío'); return }

        const parsed: PreviewRow[] = raw.map(r => {
          const mapped: PreviewRow = {
            codigo: '', modulo: '', descripcion: '', avance: '',
            estado: '', sprint: '', eta: '', comentario: '', fech_reg: '',
          }

          // Inicializar columnas tech
          techCols.forEach(c => { mapped[c.col_key] = '' })

          Object.entries(r).forEach(([key, val]) => {
            const k      = key.toLowerCase().trim()
            const strVal = val !== null && val !== undefined ? String(val).trim() : ''

            const mappedKey = BASE_HEADERS[k]
            if (mappedKey) {
              mapped[mappedKey] = strVal
            } else {
              // Intentar mapear a columna tech
              const techCol = techCols.find(c =>
                c.name.toLowerCase() === k ||
                c.col_key.toLowerCase() === k ||
                c.col_key.toLowerCase() === k.replace(/[\s.]+/g, '_')
              )
              if (techCol) mapped[techCol.col_key] = strVal
            }
          })

          return mapped
        })

        setRows(parsed)
        setStep('preview')
      } catch (e) {
        setError(`Error al leer el archivo: ${e instanceof Error ? e.message : 'Formato inválido'}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    setImporting(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/backlog/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, rows }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`Error ${res.status}: ${json.error}`); setImporting(false); return }
      setResult(json)
      setStep('result')
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const headers = [
      'Codigo', 'Modulo', 'Descripcion General', 'Avance', 'Estado',
      'Sprint', 'ETA', 'Comentario',
      ...techCols.map(c => c.name),
    ]
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      [
        'BC-001', 'Auth', 'Login de usuario', '0', 'pendiente',
        '1', '2025-06-30', '',
        ...techCols.map(() => ''),
      ],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Backlog')
    XLSX.writeFile(wb, 'backlog_template.xlsx')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Importar backlog desde Excel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Indicador de pasos */}
        <div className="px-6 pt-4 flex items-center gap-2 text-xs text-gray-400">
          <span className={step === 'upload'  ? 'text-blue-600 font-medium' : ''}>1. Subir archivo</span>
          <span>→</span>
          <span className={step === 'preview' ? 'text-blue-600 font-medium' : ''}>2. Vista previa</span>
          <span>→</span>
          <span className={step === 'result'  ? 'text-blue-600 font-medium' : ''}>3. Resultado</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded text-sm text-blue-700">
                <span className="mt-0.5">💡</span>
                <div>
                  <p className="font-medium mb-1">Notas de importación</p>
                  <p>Si el código del RQ ya existe en el proyecto, se <strong>actualizará</strong> con los datos del Excel.</p>
                  <p className="mt-1">Si no existe, se <strong>creará</strong> como nuevo item.</p>
                  <p className="mt-1">Las columnas de tecnología deben coincidir con las configuradas en el proyecto.</p>
                </div>
              </div>

              {/* Columnas tech configuradas */}
              {techCols.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Columnas tech del proyecto ({techCols.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {techCols.map(c => (
                      <span key={c.col_key} className="px-2 py-1 bg-gray-100 rounded text-xs">{c.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
              )}

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              >
                <p className="text-gray-500 text-sm">Arrastra tu archivo Excel aquí o haz clic para seleccionar</p>
                <p className="text-xs text-gray-400 mt-1">Formatos soportados: .xlsx, .xls</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>

              <button
                onClick={downloadTemplate}
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                ↓ Descargar plantilla Excel
              </button>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{fileName}</span> — {rows.length} fila(s) detectadas
                </p>
                <button
                  onClick={() => setStep('upload')}
                  className="text-xs text-gray-500 hover:underline"
                >
                  ← Cambiar archivo
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
              )}

              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">#</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Código</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Módulo</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-40">Descripción</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Avance</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Estado</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Sprint</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">ETA</th>
                      {techCols.map(c => (
                        <th key={c.col_key} className="px-2 py-2 text-left font-medium text-blue-600">{c.name}</th>
                      ))}
                      <th className="px-2 py-2 text-left font-medium text-gray-600">Comentario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 20).map((row, i) => (
                      <tr
                        key={i}
                        className={!row.codigo || !row.descripcion ? 'bg-red-50' : 'hover:bg-gray-50'}
                      >
                        <td className="px-2 py-1.5 text-gray-400">{i + 2}</td>
                        <td className="px-2 py-1.5 font-mono">
                          {row.codigo || <span className="text-red-500">!</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-600">{row.modulo}</td>
                        <td className="px-2 py-1.5 max-w-48 truncate">
                          {row.descripcion || <span className="text-red-500">!</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-600">{row.avance}</td>
                        <td className="px-2 py-1.5 text-gray-600">{row.estado}</td>
                        <td className="px-2 py-1.5 text-gray-600">{row.sprint}</td>
                        <td className="px-2 py-1.5 text-gray-600">{row.eta}</td>
                        {techCols.map(c => (
                          <td key={c.col_key} className="px-2 py-1.5 text-blue-700">{row[c.col_key]}</td>
                        ))}
                        <td className="px-2 py-1.5 text-gray-500 max-w-32 truncate">{row.comentario}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <p className="text-xs text-gray-400 text-center py-2">
                    Mostrando 20 de {rows.length} filas
                  </p>
                )}
              </div>

              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                Las filas con fondo rojo tienen datos incompletos y serán omitidas.
                Los RQ con código existente serán <strong>actualizados</strong>.
                Los nuevos serán <strong>creados</strong>.
              </div>
            </div>
          )}

          {/* ── Step 3: Result ── */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${
                result.errors.length === 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                {result.created > 0 && (
                  <p className="font-medium text-green-700">
                    ✓ {result.created} item(s) creados correctamente
                  </p>
                )}
                {result.updated > 0 && (
                  <p className="font-medium text-blue-700 mt-1">
                    ↺ {result.updated} item(s) actualizados correctamente
                  </p>
                )}
                {result.created === 0 && result.updated === 0 && (
                  <p className="font-medium text-gray-600">No se procesó ningún item</p>
                )}
                {result.errors.length > 0 && (
                  <p className="text-yellow-700 mt-2">
                    ⚠ {result.errors.length} fila(s) con errores
                  </p>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="border rounded p-3 space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium text-gray-500 mb-2">Detalle de errores:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">• {e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          {step === 'upload' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                Atrás
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? 'Importando...' : `Importar ${rows.length} filas`}
              </button>
            </>
          )}
          {step === 'result' && (
            <button
              onClick={() => { onImported(); onClose() }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Cerrar y actualizar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}