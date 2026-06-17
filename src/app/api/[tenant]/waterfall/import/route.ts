import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:update')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const projectId = Number(body.projectId)
    const tasks = body.tasks || []

    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    // 🚀 CORRECCIÓN: Quitamos el "WHERE tenant_id" para asegurar que lea los colores globales
    const dictRows: any = await query(
      `SELECT id, status_key FROM wf_status_dictionary ORDER BY sort_order ASC`
    )
    
    const statusMap = new Map<string, number>()
    for (const r of dictRows) {
      statusMap.set(String(r.status_key).toUpperCase(), Number(r.id))
    }

    // Usamos el ID del primer estado (ej. Planificado) como default si en el Excel ponen "x" o algo raro
    const defaultStatusId = dictRows.length > 0 ? Number(dictRows[0].id) : 1

    // Limpiar datos anteriores de este proyecto (Sincronización completa)
    await query(`DELETE FROM wf_tasks WHERE project_id = ?`, [projectId])
    await query(`DELETE FROM wf_resources WHERE project_id = ?`, [projectId])

    // Procesar las tareas fila por fila
    let order = 1
    for (const task of tasks) {
      if (!task.description) continue

      let resourceId = null
      if (task.resourceName && String(task.resourceName).trim() !== '') {
        const resName = String(task.resourceName).trim()
        const existingRes: any = await query(
          `SELECT id FROM wf_resources WHERE project_id = ? AND name = ? LIMIT 1`,
          [projectId, resName]
        )
        
        if (existingRes.length > 0) {
          resourceId = existingRes[0].id
        } else {
          const insertRes: any = await query(
            `INSERT INTO wf_resources (project_id, name) VALUES (?, ?)`,
            [projectId, resName]
          )
          resourceId = insertRes.insertId
        }
      }

      const taskType = task.isStage ? 'etapa' : 'ticket'
      const insertTask: any = await query(
        `INSERT INTO wf_tasks (project_id, parent_id, task_type, description, resource_id, sort_order)
         VALUES (?, NULL, ?, ?, ?, ?)`,
         [projectId, taskType, task.description, resourceId, order]
      )
      const taskId = insertTask.insertId
      order++

      // Insertar la línea de tiempo (Los cuadritos pintados)
      if (task.timeline && Array.isArray(task.timeline)) {
        for (const mark of task.timeline) {
          const key = String(mark.statusKey).trim().toUpperCase()
          let sId = statusMap.get(key)
          
          if (!sId) sId = defaultStatusId 

          try {
            await query(
              `INSERT INTO wf_task_timeline (task_id, target_date, status_id, sprint_label)
               VALUES (?, ?, ?, ?)`,
               [taskId, mark.date, sId, mark.sprintLabel || null]
            )
          } catch(e) {
            // 🚀 AHORA SÍ LOGUEAMOS EL ERROR EN CONSOLA POR SI ACASO
            console.error(`Error guardando cuadrito para tarea ${taskId}:`, e)
          }
        }
      }
    }

    return NextResponse.json({ ok: true, message: 'Cronograma importado con éxito' })
  } catch (err) {
    return handleApiError(err)
  }
}