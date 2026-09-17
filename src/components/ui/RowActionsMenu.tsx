'use client'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

export interface RowActionItem {
  label: string
  onClick: () => void
  danger?: boolean
}

/**
 * Envuelve el código/id de una fila: al hacer clic abre un menú con las acciones (Editar,
 * Eliminar, etc.) en vez de ocupar una columna por botón. El menú se renderiza en un portal
 * (fuera de la tabla) para que nunca quede recortado ni tapado por otras columnas/filas,
 * sin importar que la tabla tenga scroll horizontal/vertical.
 */
export function RowActionsMenu({ trigger, items }: { trigger: React.ReactNode; items: RowActionItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(true)
  }

  // Si el menú (ya con su tamaño real) se saldría por abajo del viewport —típicamente el
  // último ticket/item de la tabla, pegado al borde inferior— se abre hacia arriba en vez
  // de hacia abajo, para que nunca quede oculto bajo el borde de la pantalla.
  useLayoutEffect(() => {
    if (!open) return
    const menuRect = menuRef.current?.getBoundingClientRect()
    const triggerRect = triggerRef.current?.getBoundingClientRect()
    if (!menuRect || !triggerRect) return

    if (menuRect.bottom > window.innerHeight - 8) {
      setPos((prev) => (prev && prev.bottom !== undefined ? prev : {
        bottom: window.innerHeight - triggerRect.top + 4,
        left: triggerRect.left,
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Si la tabla se desplaza (scroll horizontal/vertical) o cambia el tamaño de ventana,
  // la posición calculada queda desactualizada: se cierra el menú en vez de dejarlo flotando mal ubicado.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (items.length === 0) return <>{trigger}</>

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        title="Ver acciones"
        className={`inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md border transition-colors ${
          open
            ? 'bg-blue-50 border-blue-400 text-blue-700'
            : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700'
        }`}
      >
        {trigger}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            className="fixed z-[101] bg-white border border-gray-200 rounded-lg shadow-xl p-1.5 min-w-[160px] flex flex-col gap-1"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          >
            {items.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => { setOpen(false); item.onClick() }}
                className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  item.danger
                    ? 'text-red-600 bg-red-50 border-red-100 hover:bg-red-100 hover:border-red-200'
                    : 'text-gray-700 bg-gray-50 border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
