'use client'
import { useState, useEffect, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') // Buscamos ?token=... en la URL

  const [form, setForm] = useState({
    email:    '',
    password: '',
    slug:     '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Efecto para decodificar el token cuando carga la página
  useEffect(() => {
    if (!token) {
      setError('Enlace inválido: Falta el identificador de la empresa.')
      return
    }
    
    try {
      // Decodificamos el token (Base64)
      // Ejemplo: "c2lzdGVtYQ==" se convierte en "sistema"
      const decodedSlug = atob(token)
      setForm(f => ({ ...f, slug: decodedSlug }))
    } catch (e) {
      setError('El enlace proporcionado está corrupto o es inválido.')
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!form.slug) {
      setError('No se puede ingresar sin una empresa válida.')
      return
    }

    setLoading(true)
    setError('')
    
    const res = await signIn('credentials', {
      redirect: false,
      email:    form.email,
      password: form.password,
      slug:     form.slug, // Enviamos el slug ya decodificado
    })
    
    if (res?.error) {
      setError('Credenciales incorrectas')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
      <h1 className="text-2xl font-semibold mb-2 text-center">Project Manager</h1>
      <p className="text-xs text-center text-gray-400 mb-6">
        Acceso al portal corporativo
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm font-medium border border-red-100">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">Empresa (slug)</label>
          <input 
            type="text" 
            required 
            readOnly // El usuario ya no puede modificar este campo
            className="w-full border rounded px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed outline-none"
            value={form.slug}
            placeholder={token ? "Validando..." : "Esperando enlace válido"}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">Email</label>
          <input 
            type="email" 
            required 
            disabled={!form.slug} // Deshabilita el email si no hay slug válido
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} 
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">Contraseña</label>
          <input 
            type="password" 
            required 
            disabled={!form.slug} // Deshabilita el password si no hay slug válido
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} 
          />
        </div>
        <button 
          type="submit" 
          disabled={loading || !form.slug}
          className="w-full bg-blue-600 text-white py-2.5 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}

// Envolvemos el formulario en Suspense para evitar errores de compilación en Next.js
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense fallback={<div className="text-gray-400 font-medium">Cargando acceso seguro...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}