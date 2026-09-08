import type { CSSProperties } from 'react'

/** Oscurece un color hex (#rrggbb) un porcentaje (0-1). Usado para el estado hover del color de marca de un tenant. */
export function darken(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16)
  if (Number.isNaN(num)) return hex

  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)))

  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export const DEFAULT_TENANT_ACCENT = '#2563eb'

export function tenantAccentStyle(colorHex: string | null | undefined): CSSProperties {
  const accent = colorHex || DEFAULT_TENANT_ACCENT
  return {
    ['--tenant-accent' as string]: accent,
    ['--tenant-accent-hover' as string]: darken(accent, 0.15),
  } as CSSProperties
}
