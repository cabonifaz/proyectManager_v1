import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

function formatDate(val: unknown): string {
  if (!val) return ''
  const d = new Date(String(val))
  if (isNaN(d.getTime())) return String(val)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const userId = ctx.role === 'super_admin' ? null : ctx.userId

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?, ?)',
      [ctx.tenantId, Number(projectId), null, null, null, 9999, 0, userId],
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
        ETA:         formatDate(item.eta),
        FechaReg:    formatDate(item.reg_date),
        ...techData,
        Comentario:  item.comment     ?? '',
      }
    })

    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}