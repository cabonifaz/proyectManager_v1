import { NextRequest, NextResponse } from 'next/server'
import { guardProjectRoute, handleApiError } from '@/lib/session'
import { execute } from '@/lib/db'

// DELETE: Elimina (soft-delete) una columna dinamica del proyecto. Afecta
// tanto a Backlog como a Sprint (y a Observaciones si llega a usar columnas
// del proyecto), ya que todas leen las mismas project_columns activas.
export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string; columnId: string } }) {
  try {
    const { ctx, errorResponse } = await guardProjectRoute(req, 'project:manage_columns', Number(params.id))
    if (errorResponse) return errorResponse

    await execute(
      `UPDATE project_columns SET deleted_at = NOW(), deleted_by = ?, active = 0, updated_at = NOW(), updated_by = ?
       WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
      [ctx.userId, ctx.userId, Number(params.columnId), Number(params.id)]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
