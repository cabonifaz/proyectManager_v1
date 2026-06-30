import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string; itemId: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:assign_talent')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const backlogItemId = Number(params.itemId) // El ID del cliente mapea a backlog_item_id
    const sprintNum = Number(params.id)         // El parámetro [id] mapea a sprint_num
    const columnId = Number(body.columnId)
    const userIds: number[] = body.userIds || []

    // 1. Resolver el verdadero ID de sprint_items cruzando el backlog_item_id y sprint_num
    const itemRows = await query<RowDataPacket>(
      'SELECT id, project_id FROM sprint_items WHERE backlog_item_id = ? AND sprint_num = ? AND deleted_at IS NULL',
      [backlogItemId, sprintNum]
    )
    
    if (!itemRows || itemRows.length === 0) {
      return NextResponse.json({ error: 'Item no encontrado en el sprint actual' }, { status: 404 })
    }
    
    const realSprintItemId = itemRows[0].id
    const projectId = itemRows[0].project_id

    // 2. Traer a los usuarios asignados utilizando la clave primaria real (realSprintItemId)
    const currentRows = await query<RowDataPacket>(
      'SELECT user_id FROM sprint_item_tech_users WHERE sprint_item_id = ? AND column_id = ? AND deleted_at IS NULL',
      [realSprintItemId, columnId]
    )
    const currentUserIds: number[] = currentRows.map(r => Number(r.user_id))

    // 3. Calcular diferencias
    const toAdd: number[] = userIds.filter((uid: number) => !currentUserIds.includes(uid))
    const toRemove: number[] = currentUserIds.filter((uid: number) => !userIds.includes(uid))

    // 4. Agregar los nuevos registros (o restaurar si existían previamente bajo borrado lógico)
    for (const uid of toAdd) {
      const exists = await query<RowDataPacket>(
        'SELECT id FROM sprint_item_tech_users WHERE sprint_item_id = ? AND column_id = ? AND user_id = ?',
        [realSprintItemId, columnId, uid]
      )
      
      if (exists && exists.length > 0) {
        // Restaurar registro limpiando las fechas de borrado (sin usar updated_by)
        await query(
          'UPDATE sprint_item_tech_users SET deleted_at = NULL, deleted_by = NULL WHERE id = ?',
          [exists[0].id]
        )
      } else {
        await query(
          'INSERT INTO sprint_item_tech_users (project_id, sprint_item_id, column_id, user_id, created_by) VALUES (?, ?, ?, ?, ?)',
          [projectId, realSprintItemId, columnId, uid, ctx.userId]
        )
      }
    }

    // 5. Remover las asignaciones desmarcadas aplicando borrado lógico
    if (toRemove.length > 0) {
      const placeholders = toRemove.map(() => '?').join(',')
      await query(
        `UPDATE sprint_item_tech_users 
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? 
         WHERE sprint_item_id = ? AND column_id = ? AND user_id IN (${placeholders}) AND deleted_at IS NULL`,
        [ctx.userId, realSprintItemId, columnId, ...toRemove]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}