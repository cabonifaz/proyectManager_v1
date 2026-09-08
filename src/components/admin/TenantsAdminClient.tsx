'use client'
import { useState } from 'react'

interface Tenant {
  id: number
  name: string
  slug: string
  plan: 'trial' | 'basic' | 'pro'
  active: number
  logo_url: string | null
  color_hex: string | null
}

const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-gray-100 text-gray-600',
  basic: 'bg-blue-50 text-blue-600 border border-blue-200',
  pro:   'bg-purple-50 text-purple-600 border border-purple-200',
}

function generateSlug(name: string): string {
  // Descompone acentos (NFD) y descarta los marcadores diacríticos combinados (rango Unicode 0x300-0x36F)
  const withoutAccents = name
    .normalize('NFD')
    .split('')
    .filter(ch => {
      const code = ch.codePointAt(0) || 0
      return code < 0x300 || code > 0x36f
    })
    .join('')

  return withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function TenantsAdminClient({ tenants: initial }: { tenants: Tenant[] }) {
  const [tenants, setTenants] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)

  async function refresh() {
    const res = await fetch('/api/admin/tenants')
    const json = await res.json()
    if (res.ok) setTenants(json.data ?? [])
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setEditTenant(null); setShowForm(true) }}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Nueva empresa
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {tenants.map(tenant => (
          <div
            key={tenant.id}
            className={`bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-all relative overflow-hidden ${!tenant.active ? 'opacity-50' : ''}`}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: tenant.color_hex || '#2563eb' }} />

            <div className="flex items-center gap-3 mb-2">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="w-10 h-10 rounded object-contain border border-gray-100" />
              ) : (
                <div
                  className="w-10 h-10 rounded flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: tenant.color_hex || '#2563eb' }}
                >
                  {tenant.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{tenant.name}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{tenant.slug}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2 mb-4">
              <span className={`text-xs px-2 py-0.5 rounded ${PLAN_COLORS[tenant.plan]}`}>{tenant.plan}</span>
              {!tenant.active && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">inactiva</span>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <a href={`/${tenant.slug}/projects`} className="text-xs text-blue-600 hover:underline">Entrar</a>
              <button onClick={() => { setEditTenant(tenant); setShowForm(true) }} className="text-xs text-gray-600 hover:underline">Editar</button>
            </div>
          </div>
        ))}

        {tenants.length === 0 && (
          <p className="text-gray-500 col-span-full">No hay empresas registradas.</p>
        )}
      </div>

      {showForm && (
        <TenantForm
          tenant={editTenant}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refresh() }}
        />
      )}
    </div>
  )
}

function TenantForm({ tenant, onClose, onSaved }: {
  tenant: Tenant | null; onClose: () => void; onSaved: () => void
}) {
  const [autoSlug, setAutoSlug] = useState(!tenant)
  const [form, setForm] = useState({
    name:  tenant?.name  ?? '',
    slug:  tenant?.slug  ?? '',
    plan:  tenant?.plan  ?? 'trial',
    active: tenant?.active ?? 1,
    colorHex: tenant?.color_hex ?? '#2563eb',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(tenant?.logo_url ?? null)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      setLogoDataUrl(result)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const url    = tenant ? `/api/admin/tenants/${tenant.id}` : '/api/admin/tenants'
      const method = tenant ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        plan: form.plan,
      }
      if (tenant) {
        body.active = form.active
        body.colorHex = form.colorHex
      }
      if (logoDataUrl) body.logoDataUrl = logoDataUrl

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al guardar'); setSaving(false); return }
      onSaved()
    } catch (e) {
      setError(`Error de red: ${e instanceof Error ? e.message : 'Sin conexión'}`)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">{tenant ? 'Editar Empresa' : 'Nueva Empresa'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {error && <div className="mb-5 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm font-medium">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre *</label>
              <input
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm(f => ({ ...f, name, slug: autoSlug ? generateSlug(name) : f.slug }))
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Identificador (URL)</label>
              <div className="flex gap-2">
                <input
                  required
                  className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none ${autoSlug ? 'bg-gray-100 text-gray-500' : ''}`}
                  value={form.slug}
                  readOnly={autoSlug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!autoSlug) setForm(f => ({ ...f, slug: generateSlug(f.name) }))
                    setAutoSlug(v => !v)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs border whitespace-nowrap font-medium ${autoSlug ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-300'}`}
                >
                  {autoSlug ? '✎ Personalizar' : '↺ Auto'}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Se usa en las URLs: /{form.slug || '...'}/projects</p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Plan</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={form.plan}
                onChange={e => setForm(f => ({ ...f, plan: e.target.value as Tenant['plan'] }))}
              >
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
              </select>
            </div>

            {tenant && (
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4"
                />
                Empresa activa
              </label>
            )}

            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Logo</label>
              <div className="flex items-center gap-3">
                {logoPreview && <img src={logoPreview} alt="Logo" className="w-12 h-12 rounded object-contain border" />}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="text-sm" />
              </div>
            </div>

            {tenant && (
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Color de marca</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <input
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-5 mt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors">Cancelar</button>
              <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg shadow hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
