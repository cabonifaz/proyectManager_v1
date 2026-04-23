import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'

interface Props {
  children: React.ReactNode
  params: { tenant: string }
}

export default async function TenantLayout({ children, params }: Props) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (session.user.tenantSlug !== params.tenant && session.user.role !== 'super_admin') {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        tenant={params.tenant}
        role={session.user.role}
        userName={session.user.name}
      />
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}