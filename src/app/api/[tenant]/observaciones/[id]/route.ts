import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:update')
    if (errorResponse) return errorResponse

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const result = await callProcedureOut(
      'sp_observacion_update',
      {
        p_tenant_id:    ctx.tenantId,
        p_id:           Number(params.id),
        p_tipo:         body.tipo,
        p_prioridad:    body.prioridad,
        p_titulo:       body.titulo,
        p_descripcion:  body.descripcion   ?? null,
        p_estado:       body.estado,
        p_eta:          body.eta           ?? null,
        p_entregado_at: body.entregadoAt   ?? null,
        p_updated_by:   ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:delete')
    if (errorResponse) return errorResponse

    const result = await callProcedureOut(
      'sp_observacion_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_id:         Number(params.id),
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
