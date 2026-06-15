import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    // 🚀 1. Ahora sí extraemos 'ctx' de tu guardRoute
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:update')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const { projectId, data } = body

    if (!projectId || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Parámetros obligatorios ausentes o inválidos' }, { status: 400 })
    }

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