import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query, withTransaction } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface AsignacionRow extends RowDataPacket {
  id: number
  column_id: number
  col_key: string
  tech_name: string
  developer_name: string
}

interface AsignacionInput {
  techColId: number
  colKey: string
  techName: string
  developerName: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:read')
    if (errorResponse) return errorResponse

    const rows = await query<AsignacionRow>(
      `SELECT id, column_id, col_key, tech_name, developer_name
       FROM observacion_asignaciones
       WHERE observacion_id = ? AND tenant_id = ?
       ORDER BY tech_name`,
      [Number(params.id), ctx.tenantId],
    )

    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:update')
    if (errorResponse) return errorResponse

    let body: { asignaciones: AsignacionInput[] } = { asignaciones: [] }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const observacionId = Number(params.id)
    const { asignaciones } = body

    await withTransaction(async (conn) => {
      await conn.execute(
        'DELETE FROM observacion_asignaciones WHERE observacion_id = ? AND tenant_id = ?',
        [observacionId, ctx.tenantId],
      )

      for (const a of asignaciones) {
        if (!a.developerName?.trim()) continue
        await conn.execute(
          `INSERT INTO observacion_asignaciones
             (tenant_id, observacion_id, column_id, col_key, tech_name, developer_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [ctx.tenantId, observacionId, a.techColId, a.colKey, a.techName, a.developerName],
        )
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
