'use client'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function Pagination({ page, totalItems, pageSize, onPageChange, onPageSizeChange }: {
  page: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-t border-gray-100 text-sm">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Mostrando {from}–{to} de {totalItems}</span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="border rounded px-2 py-1 text-xs outline-none"
        >
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / página</option>)}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded border text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹ Anterior
        </button>

        {pageNumbers.map((n, idx) => n === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-xs text-gray-400">…</span>
        ) : (
          <button
            key={n}
            onClick={() => onPageChange(n as number)}
            className={`px-2.5 py-1 rounded border text-xs transition-colors ${
              n === page ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {n}
          </button>
        ))}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2.5 py-1 rounded border text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente ›
        </button>
      </div>
    </div>
  )
}

function getPageNumbers(page: number, totalPages: number): (number | '...')[] {
  const delta = 1
  const range: (number | '...')[] = []
  const start = Math.max(2, page - delta)
  const end = Math.min(totalPages - 1, page + delta)

  range.push(1)
  if (start > 2) range.push('...')
  for (let i = start; i <= end; i++) range.push(i)
  if (end < totalPages - 1) range.push('...')
  if (totalPages > 1) range.push(totalPages)

  return range
}
