import { NextResponse } from 'next/server';
import { query } from '@/lib/db'; 

export async function GET(req: Request, { params }: { params: { tenant: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const sprintNum = searchParams.get('sprintNum');

    if (!projectId || !sprintNum) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // 🚀 CORRECCIÓN: Quitamos 'project_manager.' para que respete el entorno actual (Staging o Prod)
    const rows: any = await query('CALL sp_sprint_obs_load(?, ?)', [
      Number(projectId),
      Number(sprintNum)
    ]);

    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error("Error en sprint_obs_load:", error);
    return NextResponse.json({ error: 'Error al obtener carga de observaciones' }, { status: 500 });
  }
}