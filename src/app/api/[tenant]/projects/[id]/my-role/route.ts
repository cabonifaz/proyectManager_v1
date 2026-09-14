import { NextRequest, NextResponse } from 'next/server'
import { getContextFromHeaders, getEffectiveRole, handleApiError } from '@/lib/session'

/** Rol EFECTIVO del usuario actual para este proyecto (su rol global, elevado por su rol de proyecto si tiene uno asignado). */
export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const role = await getEffectiveRole(ctx, Number(params.id))
    return NextResponse.json({ role })
  } catch (err) {
    return handleApiError(err)
  }
}
