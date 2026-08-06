'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';

export interface TelegramPendingEntry {
  id: string;
  entry_type: 'cost' | 'partner_advance' | 'client_payment' | 'commitment';
  description: string;
  amount_usd: number;
  category?: string;
  provider?: string;
  partner_name?: string;
  payment_reference?: string;
  date: string;
  project_id?: string;
  raw_message: string;
  suggested_client_name?: string;
  suggested_project_name?: string;
  confidence_score: number;
  status: 'pending' | 'approved' | 'rejected';
  telegram_chat_id: number;
  telegram_user_name?: string;
  created_at: string;
  projects?: {
    id: string;
    title: string;
    client_id?: string;
    clients?: {
      id: string;
      name: string;
    };
  };
}

// Obtener todas las entradas pendientes de Telegram
export async function getTelegramPendingEntries(): Promise<TelegramPendingEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('telegram_pending_entries')
    .select(`
      *,
      projects (
        id,
        title,
        client_id,
        clients (
          id,
          name
        )
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando entradas pendientes de Telegram:', error);
    return [];
  }

  return (data as any) || [];
}

// Aprobar entrada pendiente y crear el registro real en la tabla destino
export async function approveTelegramEntry(
  entryId: string,
  overrides?: {
    project_id?: string;
    entry_type?: 'cost' | 'partner_advance' | 'client_payment' | 'commitment';
    amount_usd?: number;
    description?: string;
    category?: string;
    partner_name?: string;
    provider?: string;
  }
) {
  // 1. Obtener la entrada
  const { data: entry, error: fetchErr } = await supabaseAdmin
    .from('telegram_pending_entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (fetchErr || !entry) {
    throw new Error('Entrada de Telegram no encontrada');
  }

  const finalProjectId = overrides?.project_id || entry.project_id;
  const finalType = overrides?.entry_type || entry.entry_type;
  const finalAmount = overrides?.amount_usd ?? entry.amount_usd;
  const finalDescription = overrides?.description || entry.description;
  const finalCategory = overrides?.category || entry.category || 'other';
  const finalPartner = overrides?.partner_name || entry.partner_name || 'Socio';
  const finalProvider = overrides?.provider || entry.provider || '';

  if (!finalProjectId && finalType !== 'partner_advance') {
    throw new Error('Se debe asignar un proyecto antes de aprobar.');
  }

  let createdRecordId: string | null = null;
  let createdRecordTable: string | null = null;

  // 2. Crear registro real según tipo
  if (finalType === 'cost') {
    const { data: newCost, error: costErr } = await supabaseAdmin
      .from('project_costs')
      .insert({
        project_id: finalProjectId,
        description: finalDescription,
        category: finalCategory,
        quantity: entry.quantity || 1,
        unit_price_usd: finalAmount,
        total_usd: finalAmount,
        provider: finalProvider,
        date: entry.date || new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (costErr) throw new Error(`Error al crear costo de proyecto: ${costErr.message}`);
    createdRecordId = newCost.id;
    createdRecordTable = 'project_costs';

  } else if (finalType === 'partner_advance') {
    const { data: newAdvance, error: advErr } = await supabaseAdmin
      .from('partner_advances')
      .insert({
        project_id: finalProjectId || null,
        partner_name: finalPartner,
        amount_usd: finalAmount,
        description: finalDescription,
        date: entry.date || new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (advErr) throw new Error(`Error al crear retiro de socio: ${advErr.message}`);
    createdRecordId = newAdvance.id;
    createdRecordTable = 'partner_advances';

  } else if (finalType === 'client_payment') {
    const { data: newPayment, error: payErr } = await supabaseAdmin
      .from('project_payments')
      .insert({
        project_id: finalProjectId,
        amount_usd: finalAmount,
        description: finalDescription,
        reference: entry.payment_reference || 'Telegram',
        date: entry.date || new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (payErr) throw new Error(`Error al crear pago de cliente: ${payErr.message}`);
    createdRecordId = newPayment.id;
    createdRecordTable = 'project_payments';

  } else if (finalType === 'commitment') {
    const { data: newCommitment, error: comErr } = await supabaseAdmin
      .from('project_commitments')
      .insert({
        project_id: finalProjectId,
        description: finalDescription,
        amount_usd: finalAmount,
        provider: finalProvider,
        category: finalCategory,
        date: entry.date || new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (comErr) throw new Error(`Error al crear compromiso: ${comErr.message}`);
    createdRecordId = newCommitment.id;
    createdRecordTable = 'project_commitments';
  }

  // 3. Actualizar estado a approved
  const { error: updateErr } = await supabaseAdmin
    .from('telegram_pending_entries')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      project_id: finalProjectId,
      created_record_id: createdRecordId,
      created_record_table: createdRecordTable,
    })
    .eq('id', entryId);

  if (updateErr) {
    throw new Error(`Error actualizando entrada pendiente: ${updateErr.message}`);
  }

  // Notify user in Telegram asynchronously if bot token configured
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const msg = `✅ *Gasto Aprobado*\n\n📝 ${finalDescription}\n💰 *$${finalAmount.toFixed(2)}*\n📌 Registrado exitosamente en la plataforma.`;
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: entry.telegram_chat_id,
        text: msg,
        parse_mode: 'Markdown',
      }),
    }).catch((err) => console.error('Error enviando notificación Telegram:', err));
  }

  revalidatePath('/');
  revalidatePath('/proyectos');
  return { success: true };
}

// Rechazar entrada pendiente
export async function rejectTelegramEntry(entryId: string) {
  const { data: entry } = await supabaseAdmin
    .from('telegram_pending_entries')
    .select('telegram_chat_id, description')
    .eq('id', entryId)
    .single();

  const { error } = await supabaseAdmin
    .from('telegram_pending_entries')
    .update({ status: 'rejected' })
    .eq('id', entryId);

  if (error) throw new Error(error.message);

  if (process.env.TELEGRAM_BOT_TOKEN && entry) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const msg = `❌ *Registro Rechazado*\n\n📝 ${entry.description}\nEl registro fue descartado por un administrador.`;
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: entry.telegram_chat_id,
        text: msg,
        parse_mode: 'Markdown',
      }),
    }).catch((err) => console.error('Error enviando rechazo Telegram:', err));
  }

  revalidatePath('/');
  return { success: true };
}

// Vincular telegram_chat_id a un perfil de usuario
export async function linkTelegramProfile(userId: string, chatId: number) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ telegram_chat_id: chatId })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  revalidatePath('/administracion');
  return { success: true };
}
