import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint_item:update')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const sprintId = Number(body.sprintId)
    const data = body.data

    if (!sprintId || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Datos de reordenamiento inválidos' }, { status: 400 })
    }

    const result = await callProcedureOut(
      'sp_sprint_items_reordenar',
      {
        p_tenant_id: ctx.tenantId,
        p_sprint_id: sprintId,
        p_data_json: JSON.stringify(data),
      },
      ['p_error']
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}