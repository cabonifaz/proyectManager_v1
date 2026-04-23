import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:read')
    if (errorResponse) return errorResponse

    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const userId = ctx.role === 'super_admin' ? null : ctx.userId

    // Todos los items del backlog del proyecto
    const allBacklogResults = await callProcedure<RowDataPacket>(
      'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?, ?)',
      [ctx.tenantId, Number(projectId), null, null, null, 999, 0, userId],
    )

    const allBacklog = allBacklogResults[0] ?? []

    // Items ya en el sprint
    const sprintItemsResult = await callProcedure<RowDataPacket>(
      'CALL sp_sprint_items_list(?, ?, ?, ?, ?, ?, ?, ?)',
      [ctx.tenantId, Number(projectId), Number(params.id), null, null, null, 999, 0],
    )

    const sprintCodes = new Set(
      (sprintItemsResult[0] ?? []).map((i: RowDataPacket) => i.code)
    )

    const available = allBacklog.filter(
      (item: RowDataPacket) => !sprintCodes.has(item.code)
    )

    return NextResponse.json({ data: available })
  } catch (err) {
    return handleApiError(err)
  }
}