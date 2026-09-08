'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface TenantBrand { name: string; logoUrl: string | null; colorHex: string | null }

export default function LoginForm({ slug, brand }: { slug: string; brand?: TenantBrand | null }) {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      redirect: false,
      email:    form.email,
      password: form.password,
      slug,
    })
    if (res?.error) {
      setError(res.error === 'CredentialsSignin' ? 'Credenciales incorrectas' : res.error)
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
      {brand?.logoUrl && (
        <img src={brand.logoUrl} alt={brand.name} className="h-12 mx-auto mb-3 object-contain" />
      )}
      <h1 className="text-2xl font-semibold mb-2 text-center">{brand?.name || 'Project Manager'}</h1>
      <p className="text-xs text-center text-gray-400 mb-6">
        {slug ? 'Acceso al portal corporativo' : 'Acceso de administrador'}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm font-medium border border-red-100">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {slug && (
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Empresa</label>
            <input
              type="text"
              readOnly
              className="w-full border rounded px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed outline-none"
              value={slug}
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">Email</label>
          <input
            type="email"
            required
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">Contraseña</label>
          <input
            type="password"
            required
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2.5 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
