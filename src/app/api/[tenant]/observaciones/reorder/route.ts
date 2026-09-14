import { NextRequest, NextResponse } from 'next/server'
import { guardProjectRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, data } = body

    if (!projectId || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Parámetros obligatorios ausentes o inválidos' }, { status: 400 })
    }

    const { ctx, errorResponse } = await guardProjectRoute(req, 'observacion:update', Number(projectId) || null)
    if (errorResponse) return errorResponse

    const result: any = await callProcedureOut('sp_observaciones_reordenar', {
      p_tenant_id: ctx.tenantId, // 🚀 2. Usamos el tenantId real y numérico
      p_project_id: Number(projectId),
      p_data_json: JSON.stringify(data)
    }, ['p_error'])

    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    return NextResponse.json({ message: 'Prioridades reordenadas con éxito' })
  } catch (err) {
    return handleApiError(err)
  }
}