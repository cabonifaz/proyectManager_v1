import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { WaterfallClient } from '@/components/waterfall/WaterfallClient'

// 1. Definimos exactamente qué nos devuelve la base de datos
interface ProjectData {
  id: number;
  code: string;
  name: string;
  methodology: string;
}

interface StatusDict {
  id: number;
  status_key: string;
  status_name: string;
  color_hex: string;
  text_color: string;
}

export default async function WaterfallPage({ 
  params, 
  searchParams 
}: { 
  params: { tenant: string }, 
  searchParams: { projectId?: string } 
}) {
  
  // 🚀 ATENCIÓN AQUÍ: 
  // He puesto el rol en 'super_admin' temporalmente para que compile.
  // Revisa tu archivo "src/app/[tenant]/backlog/page.tsx" y fíjate cómo 
  // obtienes la sesión y el role en esa pantalla para pegarlo aquí después.
  const userRole = 'super_admin'

  const projectId = searchParams.projectId
  if (!projectId) redirect(`/${params.tenant}/projects`)

  // 2. Traemos el proyecto (Le decimos a TS que confíe en que es un ProjectData)
  const projects = (await query(
    `SELECT id, code, name, methodology FROM projects WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [Number(projectId)]
  )) as ProjectData[]

  if (projects.length === 0) {
    redirect(`/${params.tenant}/projects`)
  }

  const project = projects[0]

  // 3. Traemos el diccionario de colores
  // (Nota: Si tu tabla dictionary requiere el tenant_id, agrégalo al WHERE)
  const dictionary = (await query(
    `SELECT id, status_key, status_name, color_hex, text_color FROM wf_status_dictionary ORDER BY sort_order ASC`
  )) as StatusDict[]

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Cronograma Waterfall</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">
          {project.code} — {project.name}
        </p>
      </div>

      <WaterfallClient 
        tenant={params.tenant} 
        role={userRole as any} 
        projectId={Number(projectId)} 
        dictionary={dictionary}
      />
    </div>
  )
}