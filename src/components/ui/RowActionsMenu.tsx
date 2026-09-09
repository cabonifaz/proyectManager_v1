'use client'
import { useState } from 'react'

export interface RowActionItem {
  label: string
  onClick: () => void
  danger?: boolean
}

/** Envuelve el código/id de una fila: al hacer clic abre un menú con las acciones (Editar, Eliminar, etc.) en vez de ocupar una columna por botón. */
export function RowActionsMenu({ trigger, items }: { trigger: React.ReactNode; items: RowActionItem[] }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return <>{trigger}</>

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors"
      >
        {trigger}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
            {items.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => { setOpen(false); item.onClick() }}
                className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors whitespace-nowrap ${item.danger ? 'text-red-600' : 'text-gray-700'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
