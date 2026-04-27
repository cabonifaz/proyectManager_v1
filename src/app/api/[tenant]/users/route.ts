// src/app/api/[tenant]/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    // Cualquier rol con permiso 'user:read' puede ver la lista
    const { ctx, errorResponse } = await guardRoute(req, 'user:read')
    if (errorResponse) return errorResponse

    const results = await callProcedure('CALL sp_user_list(?)', [ctx.tenantId])
    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    // RESTRICCIÓN: Solo el super_admin puede CREAR usuarios
    const { ctx, errorResponse } = await guardRoute(req, 'user:create')
    if (errorResponse) return errorResponse

    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Solo el administrador puede crear usuarios' }, { status: 403 })
    }

    const body = await req.json()
    // ... resto de tu lógica de sp_user_upsert
  } catch (err) {
    return handleApiError(err)
  }
}