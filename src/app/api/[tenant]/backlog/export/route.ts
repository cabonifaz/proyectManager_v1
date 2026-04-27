import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?)',
      [ctx.tenantId, Number(projectId), null, null, null, 9999, 0],
    )

    const rows = (results[0] ?? []).map((item: RowDataPacket) => {
      const techCols = typeof item.tech_columns === 'string'
        ? JSON.parse(item.tech_columns)
        : (item.tech_columns ?? [])

      const techData: Record<string, string> = {}
      techCols.forEach((t: { name: string; value: string }) => {
        if (t.name) techData[t.name] = t.value ?? ''
      })

      return {
        Codigo:      item.code,
        Modulo:      item.module      ?? '',
        Descripcion: item.description,
        Avance:      item.progress,
        Estado:      item.status,
        Sprint:      item.sprint_num  ?? '',
        ETA:         item.eta         ? item.eta.toString().slice(0, 10) : '',
        FechaReg:    item.reg_date    ? item.reg_date.toString().slice(0, 10) : '',
        ...techData,
        Comentario:  item.comment     ?? '',
      }
    })

    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}