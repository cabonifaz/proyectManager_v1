import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; taskId: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:update')
    if (errorResponse) return errorResponse

    const taskId = Number(params.taskId)
    const body = await req.json()

    // ESCENARIO 1: Toggle de estado (Check / Uncheck)
    if (body.completado !== undefined) {
      const result: any = await callProcedureOut('sp_task_toggle', {
        p_task_id: taskId,
        p_completado: Number(body.completado),
        p_updated_by: ctx.userId 
      }, ['p_error'])

      if (result.p_error) {
        return NextResponse.json({ error: result.p_error }, { status: 400 })
      }
      return NextResponse.json({ message: 'Estado de la tarea actualizado con éxito' })
    }

    // ESCENARIO 2: Edición en línea (Descripción y Peso)
    if (body.descripcion !== undefined) {
      if (!body.descripcion.trim()) {
        return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 })
      }

      await query(
        `UPDATE backlog_item_tasks 
         SET descripcion = ?, peso = ?, updated_at = NOW()
         WHERE id = ?`,
        [body.descripcion.trim(), Number(body.peso) || 0, taskId]
      )

      // Al cambiar el peso, recalculamos el progreso del ticket principal
      const taskRows: any = await query('SELECT backlog_item_id FROM backlog_item_tasks WHERE id = ?', [taskId])
      
      if (taskRows.length > 0) {
        const backlogItemId = taskRows[0].backlog_item_id

        // 🚀 APLICAMOS EL FILTRO DE BORRADO LÓGICO AQUÍ
        const statsRows: any = await query(
          `SELECT COUNT(*) as total, SUM(IF(completado = 1, 1, 0)) as compl, SUM(peso) as total_peso, SUM(IF(completado = 1, peso, 0)) as compl_peso 
           FROM backlog_item_tasks 
           WHERE backlog_item_id = ? AND deleted_at IS NULL`, 
          [backlogItemId]
        )

        let nuevoAvance = 0
        const { total, compl, total_peso, compl_peso } = statsRows[0]

        if (total_peso > 0) {
          nuevoAvance = Math.round((compl_peso / total_peso) * 100)
        } else if (total > 0) {
          nuevoAvance = Math.round((compl / total) * 100)
        }

        await query(
          `UPDATE backlog_items 
           SET progress = ?, status = IF(? = 100, 'completado', IF(? > 0, 'en_progreso', status)), updated_at = NOW(), updated_by = ? 
           WHERE id = ?`,
          [nuevoAvance, nuevoAvance, nuevoAvance, ctx.userId, backlogItemId]
        )
      }

      return NextResponse.json({ message: 'Tarea actualizada correctamente' })
    }

    return NextResponse.json({ error: 'Estructura de petición no válida' }, { status: 400 })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE: Elimina LÓGICAMENTE una tarea y recalcula el progreso restante
export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; taskId: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:delete')
    if (errorResponse) return errorResponse

    const taskId = Number(params.taskId)
    
    // 1. Buscamos el ID del ticket padre
    const taskRows: any = await query('SELECT backlog_item_id FROM backlog_item_tasks WHERE id = ?', [taskId])
    if (taskRows.length === 0) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
    }
    const backlogItemId = taskRows[0].backlog_item_id

    // 2. 🚀 ELIMINACIÓN LÓGICA DE LA TAREA (Asignando fecha y usuario)
    await query(
      'UPDATE backlog_item_tasks SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', 
      [ctx.userId, taskId]
    )

    // 3. Recalculamos ignorando las eliminadas
    const statsRows: any = await query(
      `SELECT COUNT(*) as total, SUM(IF(completado = 1, 1, 0)) as compl, SUM(peso) as total_peso, SUM(IF(completado = 1, peso, 0)) as compl_peso 
       FROM backlog_item_tasks 
       WHERE backlog_item_id = ? AND deleted_at IS NULL`, 
      [backlogItemId]
    )

    let nuevoAvance = 0
    const { total, compl, total_peso, compl_peso } = statsRows[0]

    if (total_peso > 0) {
      nuevoAvance = Math.round((compl_peso / total_peso) * 100)
    } else if (total > 0) {
      nuevoAvance = Math.round((compl / total) * 100)
    }

    // 4. Actualizamos ticket padre
    await query(
      `UPDATE backlog_items 
       SET progress = ?, status = IF(? = 100, 'completado', IF(? > 0, 'en_progreso', status)), updated_at = NOW(), updated_by = ? 
       WHERE id = ?`,
      [nuevoAvance, nuevoAvance, nuevoAvance, ctx.userId, backlogItemId]
    )

    return NextResponse.json({ message: 'Tarea eliminada (Soft Delete) y progreso actualizado' })
  } catch (err) {
    return handleApiError(err)
  }
}