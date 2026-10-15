import { NextRequest, NextResponse } from 'next/server';
import {
  WEB_PEPE_SESSION_CHAT_ID,
  getPepeSessionMemory,
  clearPepeSessionMemory
} from '@/lib/pepe/pepeMemory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const memory = await getPepeSessionMemory(WEB_PEPE_SESSION_CHAT_ID);
    return NextResponse.json({
      success: true,
      sessionId: WEB_PEPE_SESSION_CHAT_ID,
      memory
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error al obtener sesión de Pepe' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await clearPepeSessionMemory(WEB_PEPE_SESSION_CHAT_ID);
    return NextResponse.json({ success: true, message: 'Memoria de sesión reiniciada con éxito' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error al reiniciar sesión de Pepe' },
      { status: 500 }
    );
  }
}
