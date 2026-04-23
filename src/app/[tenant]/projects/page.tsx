import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProjectsClient } from '@/components/projects/ProjectsClient'

export default async function ProjectsPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Proyectos</h1>
      <ProjectsClient
        tenant={params.tenant}
        role={session.user.role}
        userId={session.user.id}
      />
    </div>
  )
}