import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query, execute } from '@/lib/db'

/** Mueve un proyecto a otro tenant. Los miembros ya asignados (project_members) conservan su acceso. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'tenant:update')
    if (errorResponse) return errorResponse
    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Solo el administrador puede migrar proyectos' }, { status: 403 })
    }

    const projectId = Number(params.id)
    const body = await req.json()
    const tenantId = Number(body.tenantId)
    if (!tenantId) return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 })

    const projectRows: any = await query(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [projectId])
    if (!projectRows || projectRows.length === 0) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

    const tenantRows: any = await query(`SELECT id, name FROM tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [tenantId])
    if (!tenantRows || tenantRows.length === 0) return NextResponse.json({ error: 'Empresa destino no encontrada' }, { status: 404 })

    await execute(`UPDATE projects SET tenant_id = ?, updated_at = NOW(), updated_by = ? WHERE id = ?`, [tenantId, ctx.userId, projectId])

    return NextResponse.json({ ok: true, tenantName: tenantRows[0].name })
  } catch (err) {
    return handleApiError(err)
  }
}
