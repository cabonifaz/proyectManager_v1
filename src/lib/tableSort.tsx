export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> { key: K | null; dir: SortDir }

export function SortIcon<K extends string>({ col, sort }: { col: K; sort: SortState<K> }) {
  if (sort.key !== col) {
    return (
      <span className="ml-1 inline-flex flex-col leading-none opacity-30 text-[10px]">
        <span>▲</span><span>▼</span>
      </span>
    )
  }
  return <span className="ml-1 text-blue-600 text-[10px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>
}

export function thClass<K extends string>(col: K, sort: SortState<K>) {
  return `text-left px-3 py-3 font-medium whitespace-nowrap select-none cursor-pointer transition-colors ${
    sort.key === col ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
  }`
}

/** Compara dos valores string/number/null para ordenar una columna; los vacíos siempre van al final. */
export function compareValues(valA: string | number | null | undefined, valB: string | number | null | undefined, dir: SortDir): number {
  const a = valA ?? ''
  const b = valB ?? ''

  if (a === '' && b !== '') return 1
  if (b === '' && a !== '') return -1

  let result = 0
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b
  } else {
    result = String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
  }

  return dir === 'asc' ? result : -result
}
