import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const searchParams = req.nextUrl.searchParams
    const sprintNum = searchParams.get('sprint')

    // Consulta base: Busca a todos los desarrolladores del proyecto
    let sql = `
      SELECT DISTINCT bit.value AS name
      FROM backlog_item_tech bit
      INNER JOIN backlog_items bi ON bi.id = bit.backlog_item_id
      WHERE bi.project_id   = ?
        AND bit.value       IS NOT NULL
        AND bit.value       != ''
        AND bi.deleted_at   IS NULL
        AND bit.deleted_at  IS NULL
    `;
    const queryParams: any[] = [Number(params.id)];

    // Si la petición pide un sprint específico, agregamos el filtro
    if (sprintNum) {
      sql += ` AND bi.sprint_num = ?`;
      queryParams.push(Number(sprintNum));
    }

    sql += ` ORDER BY bit.value`;

    const rows = await query<RowDataPacket>(sql, queryParams);

    return NextResponse.json({ data: rows.map(r => r.name as string) })
  } catch (err) {
    return handleApiError(err)
  }
}