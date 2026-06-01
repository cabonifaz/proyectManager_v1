import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:read')
    if (errorResponse) return errorResponse

    // 1. Verificamos la sesión
    const session = await getServerSession(authOptions)
    const isSuperAdmin = session?.user?.role === 'super_admin'
    
    // 2. Aplicamos la regla del SP
    const pUserId = isSuperAdmin ? null : ctx.userId

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const statusList   = searchParams.getAll('status[]')
    const singleStatus = searchParams.get('status') ?? null
    const sprintNum    = searchParams.get('sprintNum') ? Number(searchParams.get('sprintNum')) : null
    const search       = searchParams.get('search')   ?? null
    const limit        = Number(searchParams.get('limit')  ?? 200)
    const offset       = Number(searchParams.get('offset') ?? 0)

    let rawItems: any[] = [];

    // Bloque para múltiples estados
    if (statusList.length > 1) {
      for (const status of statusList) {
        const results = await callProcedure<RowDataPacket>(
          'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?, ?)',
          [ctx.tenantId, Number(projectId), status, sprintNum, search, limit, offset, pUserId],
        )
        rawItems.push(...(results[0] ?? []))
      }
    } else {
      // Bloque para un solo estado o ninguno
      const results = await callProcedure<RowDataPacket>(
        'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?, ?)',
        [
          ctx.tenantId,
          Number(projectId),
          statusList.length === 1 ? statusList[0] : singleStatus,
          sprintNum,
          search,
          limit,
          offset,
          pUserId, 
        ],
      )
      rawItems = results[0] ?? []
    }

    // 🚀 PARCHE SUPER SEGURO: Inyectamos TODAS las columnas sin romper la librería
    if (rawItems.length > 0) {
      // 1. Clonamos los items a objetos nativos para quitar la restricción de "Solo Lectura"
      rawItems = rawItems.map(item => ({ ...item }));
      
      const itemIds = rawItems.map(i => i.id);
      // Creamos los marcadores exactos (?, ?, ?) para evitar crasheos de sintaxis SQL
      const placeholders = itemIds.map(() => '?').join(',');
      
      const techRows = await query<RowDataPacket>(
        `SELECT t.backlog_item_id, c.col_key, c.name, t.value, t.eta 
         FROM backlog_item_tech t
         JOIN project_columns c ON t.column_id = c.id
         WHERE t.backlog_item_id IN (${placeholders}) AND c.deleted_at IS NULL`,
        [...itemIds] // <-- Pasamos los IDs desestructurados
      );

      // Mapeamos las tecnologías
      const techMap = new Map<number, any[]>();
      for (const row of techRows) {
        if (!techMap.has(row.backlog_item_id)) techMap.set(row.backlog_item_id, []);
        techMap.get(row.backlog_item_id)!.push({
          col_key: row.col_key,
          name: row.name,
          value: row.value,
          eta: row.eta
        });
      }

      // Reemplazamos la data incompleta del SP por la data completa
      for (const item of rawItems) {
        item.tech_columns = JSON.stringify(techMap.get(item.id) || []);
      }
    }

    return NextResponse.json({ data: rawItems })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:create')
    if (errorResponse) return errorResponse

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const result = await callProcedureOut(
      'sp_backlog_create',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  body.projectId,
        p_code:        body.code,
        p_module:      body.module      ?? null,
        p_description: body.description,
        p_status:      body.status      ?? null,
        p_sprint_num:  body.sprintNum   ?? null,
        p_eta:         body.eta         ?? null,
        p_comment:     body.comment     ?? null,
        p_created_by:  ctx.userId, 
      },
      ['p_new_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_new_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}