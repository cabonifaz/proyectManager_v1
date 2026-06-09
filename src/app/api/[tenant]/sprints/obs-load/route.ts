import { NextResponse } from 'next/server';
import { query } from '@/lib/db'; // 🚀 1. Le quitamos los "//" para activar la importación

export async function GET(req: Request, { params }: { params: { tenant: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const sprintNum = searchParams.get('sprintNum');

    if (!projectId || !sprintNum) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // Adaptar según tu lógica para obtener el tenant_id numérico. 
    // Si tu sistema actualmente quema el 1, déjalo así por ahora.
    const tenantId = 1; 

    // 🚀 2. Ahora 'query' funcionará correctamente
    const rows = await query('CALL project_manager.sp_sprint_obs_load(?, ?, ?)', [
      tenantId,
      Number(projectId),
      Number(sprintNum)
    ]);

    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error("Error en sprint_obs_load:", error);
    return NextResponse.json({ error: 'Error al obtener carga de observaciones' }, { status: 500 });
  }
}