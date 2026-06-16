import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:update')
    if (errorResponse) return errorResponse

    const id = Number(params.id)
    const body = await req.json()

    // 🚀 EL RASTREADOR: Esto imprimirá en la terminal de tu VSCode (no en el navegador)
    console.log("=== DATOS RECIBIDOS EN EL BACKEND ===")
    console.log("ID del ticket:", id)
    console.log("Prioridad recibida:", body.priority)
    console.log("Número de Sprint:", body.sprintNum)
    console.log("=====================================")

    // ... resto de la función (callProcedureOut, etc.)

    // 1. Guardar la data general a través del Procedimiento Almacenado original
    const result = await callProcedureOut(
      'sp_backlog_update',
      {
        p_tenant_id:    ctx.tenantId,
        p_item_id:      id,
        p_code:         body.code        ?? null,
        p_module:       body.module      ?? null,
        p_description:  body.description ?? null,
        p_progress:     body.progress    ?? null,
        p_status:       body.status      ?? null,
        p_sprint_num:   body.sprintNum   ?? null,
        p_eta:          body.eta         ?? null,
        p_comment:      body.comment     ?? null,
        p_updated_by:   ctx.userId,
        p_eta_explicit: 'eta' in body ? 1 : 0,
      },
      ['p_error']
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })

    // Sincronizar el código si existe
    if (body.code) {
      await query(
        `UPDATE sprint_items SET code = ? WHERE backlog_item_id = ? AND deleted_at IS NULL`,
        [String(body.code).trim(), id]
      )
    }

   // 2. Lógica UPSERT para Prioridad y Fecha de Revisión
    if (body.priority !== undefined || body.reviewDate !== undefined) {
      // Verificamos si el registro ya existe en la tabla sprint_items
      const exist: any = await query(
        `SELECT id FROM sprint_items WHERE backlog_item_id = ? AND deleted_at IS NULL LIMIT 1`, 
        [id]
      )

      if (exist && exist.length > 0) {
        // a) El registro EXISTE: Ejecutamos el UPDATE
        await query(
          `UPDATE sprint_items 
           SET priority = ?, review_date = ?, updated_by = ?, updated_at = NOW() 
           WHERE backlog_item_id = ? AND deleted_at IS NULL`,
          [String(body.priority ?? 0), body.reviewDate || null, ctx.userId, id]
        )
      // 🚀 CORRECCIÓN AQUÍ: Aseguramos que pase aunque el sprint sea 0
      } else if (body.sprintNum !== null && body.sprintNum !== undefined) { 
        // b) El registro NO EXISTE: Lo insertamos copiando los datos base del backlog
        const backlogInfo: any = await query(
          `SELECT project_id, code, description, status FROM backlog_items WHERE id = ? LIMIT 1`, 
          [id]
        )

        if (backlogInfo && backlogInfo.length > 0) {
          // Buscamos el ID real del sprint activo para hacer la inserción correctamente
          const sprintInfo: any = await query(
            `SELECT id FROM sprints WHERE number = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1`, 
            [body.sprintNum, backlogInfo[0].project_id]
          )

          if (sprintInfo && sprintInfo.length > 0) {
            await query(
              `INSERT INTO sprint_items 
               (sprint_id, backlog_item_id, project_id, code, description, sprint_num, status, priority, review_date, created_by, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [
                sprintInfo[0].id, 
                id, 
                backlogInfo[0].project_id, 
                backlogInfo[0].code, 
                backlogInfo[0].description,
                body.sprintNum, 
                backlogInfo[0].status, 
                String(body.priority ?? 0), 
                body.reviewDate || null, 
                ctx.userId
              ]
            )
          }
        }
      }
    }
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:delete')
    if (errorResponse) return errorResponse

    const result = await callProcedureOut(
      'sp_backlog_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_item_id:    Number(params.id),
        p_deleted_by: ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}