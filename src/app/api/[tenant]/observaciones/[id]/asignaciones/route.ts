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
  user_id: number // 🚀 Nuevo: Agregamos el ID relacional
}

interface AsignacionInput {
  techColId: number
  colKey: string
  techName: string
  userIds: number[] // 🚀 Nuevo: Ahora recibe un arreglo de IDs en lugar de un texto
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tenant: string; id: string } },
) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:read')
    if (errorResponse) return errorResponse

    // 🚀 LECTURA RELACIONAL: Cruzamos con 'users' para obtener el nombre real siempre actualizado
    const rows = await query<AsignacionRow>(
      `SELECT oa.id, oa.column_id, oa.col_key, oa.tech_name, oa.user_id, u.name as developer_name
       FROM observacion_asignaciones oa
       INNER JOIN users u ON u.id = oa.user_id
       WHERE oa.observacion_id = ? AND oa.tenant_id = ?
       ORDER BY oa.tech_name`,
      [Number(params.id), ctx.tenantId],
    )

    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tenant: string; id: string } },
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
      // 1. Limpiamos asignaciones previas
      await conn.execute(
        'DELETE FROM observacion_asignaciones WHERE observacion_id = ? AND tenant_id = ?',
        [observacionId, ctx.tenantId],
      )

      // 2. Insertamos las nuevas asignaciones iterando sobre los checkboxes seleccionados
      for (const a of asignaciones) {
        const userIds = a.userIds || []
        
        for (const uid of userIds) {
          await conn.execute(
            `INSERT INTO observacion_asignaciones
               (tenant_id, observacion_id, column_id, col_key, user_id, tech_name, developer_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?, '', NOW())`,
            [ctx.tenantId, observacionId, a.techColId, a.colKey, uid, a.techName],
          )
        }
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}