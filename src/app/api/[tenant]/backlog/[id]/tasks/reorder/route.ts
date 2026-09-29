import { NextRequest, NextResponse } from 'next/server'
import { getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'

// POST: Reordena (drag & drop) las tareas/checklist de un ticket
export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const backlogItemId = Number(params.id)
    const projRows: any = await query(`SELECT project_id FROM backlog_items WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [backlogItemId])
    if (!projRows || projRows.length === 0) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'backlog:update', projRows[0].project_id)
    if (permError) return permError

    const body = await req.json()
    const ids: unknown = body.ids
    if (!Array.isArray(ids) || ids.some(id => !Number.isFinite(Number(id)))) {
      return NextResponse.json({ error: 'ids debe ser un arreglo de ids de tareas' }, { status: 400 })
    }

    await Promise.all(
      ids.map((id, idx) =>
        query(
          `UPDATE backlog_item_tasks SET orden = ?, updated_at = NOW() WHERE id = ? AND backlog_item_id = ? AND deleted_at IS NULL`,
          [idx + 1, Number(id), backlogItemId]
        )
      )
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
