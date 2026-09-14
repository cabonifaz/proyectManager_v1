import { NextRequest, NextResponse } from 'next/server'
import { getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json()
    const sprintId = Number(body.sprintId)
    const data = body.data

    if (!sprintId || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Datos de reordenamiento inválidos' }, { status: 400 })
    }

    const sprintRows: any = await query(`SELECT project_id FROM sprints WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [sprintId])
    if (!sprintRows || sprintRows.length === 0) return NextResponse.json({ error: 'Sprint no encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'sprint_item:update', sprintRows[0].project_id)
    if (permError) return permError

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