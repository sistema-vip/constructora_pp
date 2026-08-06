'use client';

import React, { useState, useEffect } from 'react';
import { TelegramPendingEntry, approveTelegramEntry, rejectTelegramEntry, getTelegramPendingEntries } from '@/app/actions/telegram-actions';
import { Check, X, Edit2, AlertCircle, RefreshCw, Send, ChevronDown, Building, User, DollarSign } from 'lucide-react';

interface ProjectOption {
  id: string;
  title: string;
  clientName: string;
}

interface TelegramPendingPanelProps {
  projects: ProjectOption[];
}

export default function TelegramPendingPanel({ projects }: TelegramPendingPanelProps) {
  const [entries, setEntries] = useState<TelegramPendingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Form de edición inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProjectId, setEditProjectId] = useState<string>('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDescription, setEditDescription] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('other');
  const [editPartnerName, setEditPartnerName] = useState<string>('');

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await getTelegramPendingEntries();
      setEntries(data);
    } catch (err) {
      console.error('Error cargando entradas de Telegram:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleStartEdit = (entry: TelegramPendingEntry) => {
    setEditingId(entry.id);
    setEditProjectId(entry.project_id || '');
    setEditAmount(entry.amount_usd);
    setEditDescription(entry.description);
    setEditCategory(entry.category || 'other');
    setEditPartnerName(entry.partner_name || '');
  };

  const handleApprove = async (entry: TelegramPendingEntry) => {
    const targetProjectId = editingId === entry.id ? editProjectId : entry.project_id;
    if (!targetProjectId && entry.entry_type !== 'partner_advance') {
      alert('Por favor selecciona un proyecto antes de aprobar este registro.');
      return;
    }

    setProcessingId(entry.id);
    try {
      await approveTelegramEntry(entry.id, {
        project_id: targetProjectId || undefined,
        amount_usd: editingId === entry.id ? editAmount : entry.amount_usd,
        description: editingId === entry.id ? editDescription : entry.description,
        category: editingId === entry.id ? editCategory : entry.category,
        partner_name: editingId === entry.id ? editPartnerName : entry.partner_name,
      });
      setEditingId(null);
      await loadEntries();
    } catch (err: any) {
      alert(`Error al aprobar: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas rechazar y descartar este registro enviado por Telegram?')) return;
    setProcessingId(id);
    try {
      await rejectTelegramEntry(id);
      await loadEntries();
    } catch (err: any) {
      alert(`Error al rechazar: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center justify-center gap-3 text-zinc-500">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Cargando registros pendientes de Telegram...</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return null; // Ocultar panel si no hay pendientes
  }

  const getEntryBadge = (type: string) => {
    switch (type) {
      case 'cost':
        return <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">🏗️ Gasto</span>;
      case 'partner_advance':
        return <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">👤 Retiro Socio</span>;
      case 'client_payment':
        return <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">💵 Pago Cliente</span>;
      case 'commitment':
        return <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">📝 Compromiso</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-sm overflow-hidden mb-8">
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-6 py-4 border-b border-amber-200 dark:border-amber-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Pendientes de Telegram
              <span className="bg-amber-500 text-white text-xs font-extrabold px-2 py-0.5 rounded-full">
                {entries.length}
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Registros enviados por Telegram en espera de tu confirmación para agregarse a la plataforma.
            </p>
          </div>
        </div>

        <button
          onClick={loadEntries}
          className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Actualizar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {entries.map((entry) => {
          const isEditing = editingId === entry.id;
          const isProcessing = processingId === entry.id;

          return (
            <div key={entry.id} className="p-6 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getEntryBadge(entry.entry_type)}
                    <span className="text-xs text-zinc-400">
                      vía @{entry.telegram_user_name || 'bot'} • {new Date(entry.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Mensaje original de Telegram */}
                  <div className="bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-2.5 text-xs text-zinc-600 dark:text-zinc-300 italic border border-zinc-200/50 dark:border-zinc-700/50">
                    💬 &quot;{entry.raw_message}&quot;
                  </div>

                  {/* Modo edición o vista */}
                  {isEditing ? (
                    <div className="mt-3 space-y-3 bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Descripción</label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Monto ($ USD)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Proyecto Destino</label>
                          <select
                            value={editProjectId}
                            onChange={(e) => setEditProjectId(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                          >
                            <option value="">-- Seleccionar Proyecto --</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.clientName} → {p.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        {entry.entry_type === 'cost' && (
                          <div>
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Categoría</label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            >
                              <option value="materials">Materiales</option>
                              <option value="labor">Mano de Obra</option>
                              <option value="equipment">Equipos / Alquiler</option>
                              <option value="subcontract">Subcontrato</option>
                              <option value="other">Otros</option>
                            </select>
                          </div>
                        )}

                        {entry.entry_type === 'partner_advance' && (
                          <div>
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">Nombre del Socio</label>
                            <input
                              type="text"
                              value={editPartnerName}
                              onChange={(e) => setEditPartnerName(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                          ${entry.amount_usd.toFixed(2)} USD
                        </span>
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          — {entry.description}
                        </span>
                      </div>

                      {/* Info de proyecto y cliente sugerido */}
                      <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                        {entry.projects ? (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Building className="w-3.5 h-3.5" />
                            <span>{entry.projects.clients?.name} → {entry.projects.title}</span>
                          </div>
                        ) : entry.suggested_project_name || entry.suggested_client_name ? (
                          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Sugerido por IA: {entry.suggested_client_name || ''} {entry.suggested_project_name ? `→ ${entry.suggested_project_name}` : ''}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-zinc-400">
                            <Building className="w-3.5 h-3.5" />
                            <span>Sin proyecto asignado</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleApprove(entry)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                      >
                        <Check className="w-4 h-4" />
                        Guardar y Aprobar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-semibold hover:bg-zinc-300 transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApprove(entry)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        Aprobar
                      </button>
                      <button
                        onClick={() => handleStartEdit(entry)}
                        className="p-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        title="Editar antes de aprobar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleReject(entry.id)}
                        disabled={isProcessing}
                        className="p-1.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                        title="Rechazar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
