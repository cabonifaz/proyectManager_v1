import { Suspense } from 'react'
import { decryptSlug } from '@/lib/tenant-crypto'
import LoginForm from './LoginForm'

interface Props {
  searchParams: { slug?: string }
}

export default function LoginPage({ searchParams }: Props) {
  let tenantSlug = ''
  if (searchParams.slug) {
    try {
      tenantSlug = decryptSlug(searchParams.slug)
    } catch {
      tenantSlug = ''
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense fallback={<div className="text-gray-400 font-medium">Cargando...</div>}>
        <LoginForm slug={tenantSlug} />
      </Suspense>
    </div>
  )
}
