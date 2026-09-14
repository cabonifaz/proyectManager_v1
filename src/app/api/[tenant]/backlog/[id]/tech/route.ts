import { NextRequest, NextResponse } from 'next/server'
import { getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const projRows: any = await query(`SELECT project_id FROM backlog_items WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.id)])
    if (!projRows || projRows.length === 0) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'backlog:update_tech', projRows[0].project_id)
    if (permError) return permError

    const body = await req.json()
    const result = await callProcedureOut(
      'sp_backlog_tech_upsert',
      {
        p_tenant_id: ctx.tenantId,
        p_item_id:   Number(params.id),
        p_column_id: body.columnId,
        p_value:     body.value   ?? null,
        p_eta:       body.eta     ?? null,
        p_user_id:   ctx.userId,
        p_user_ids:  body.userIds ? JSON.stringify(body.userIds) : '[]', // 🚀 NUEVO PARÁMETRO: Convertimos el array a JSON
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}