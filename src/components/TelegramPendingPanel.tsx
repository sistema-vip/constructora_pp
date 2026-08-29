'use client';

import React, { useState, useEffect } from 'react';
import { TelegramPendingEntry, approveTelegramEntry, rejectTelegramEntry, getTelegramPendingEntries } from '@/app/actions/telegram-actions';
import { Check, X, Edit2, AlertCircle, RefreshCw, Send, ChevronDown, Building, User, DollarSign } from 'lucide-react';

interface ProjectOption {
  id: string;
  title: string;
  clientName: string;
}

interface ProjectOption {
  id: string;
  title: string;
  clientName: string;
}

interface TelegramPendingPanelProps {
  projects: ProjectOption[];
  projectIdFilter?: string;
  clientIdFilter?: string;
}

export default function TelegramPendingPanel({ projects, projectIdFilter, clientIdFilter }: TelegramPendingPanelProps) {
  const [entries, setEntries] = useState<TelegramPendingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');

  // Mapeo dinámico de Cliente -> Proyecto por cada tarjeta
  const [selectedClientMap, setSelectedClientMap] = useState<Record<string, string>>({});
  const [selectedProjectMap, setSelectedProjectMap] = useState<Record<string, string>>({});

  // Lista única de clientes disponibles
  const clientOptions = Array.from(new Set(projects.map((p) => p.clientName || 'Cliente sin nombre')));

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

      // Pre-seleccionar cliente y proyecto para cada entrada si la IA los reconoció
      const clientMap: Record<string, string> = {};
      const projMap: Record<string, string> = {};
      data.forEach((e) => {
        if (e.projects) {
          projMap[e.id] = e.projects.id;
          clientMap[e.id] = e.projects.clients?.name || '';
        } else if (e.project_id) {
          projMap[e.id] = e.project_id;
          const matchProj = projects.find((p) => p.id === e.project_id);
          if (matchProj) clientMap[e.id] = matchProj.clientName;
        }
      });
      setSelectedClientMap(clientMap);
      setSelectedProjectMap(projMap);
    } catch (err) {
      console.error('Error cargando entradas de Telegram:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleClientChange = (entryId: string, clientName: string) => {
    setSelectedClientMap((prev) => ({ ...prev, [entryId]: clientName }));
    // Auto-seleccionar primer proyecto del cliente elegido
    const clientProjects = projects.filter((p) => p.clientName === clientName);
    if (clientProjects.length > 0) {
      setSelectedProjectMap((prev) => ({ ...prev, [entryId]: clientProjects[0].id }));
    } else {
      setSelectedProjectMap((prev) => ({ ...prev, [entryId]: '' }));
    }
  };

  const handleProjectChange = (entryId: string, projectId: string) => {
    setSelectedProjectMap((prev) => ({ ...prev, [entryId]: projectId }));
  };

  const handleStartEdit = (entry: TelegramPendingEntry) => {
    setEditingId(entry.id);
    setEditProjectId(selectedProjectMap[entry.id] || entry.project_id || '');
    setEditAmount(entry.amount_usd);
    setEditDescription(entry.description);
    setEditCategory(entry.category || 'other');
    setEditPartnerName(entry.partner_name || '');
  };

  const handleApprove = async (entry: TelegramPendingEntry) => {
    const targetProjectId = editingId === entry.id ? editProjectId : (selectedProjectMap[entry.id] || entry.project_id);
    if (!targetProjectId && entry.entry_type !== 'partner_advance') {
      alert('Por favor selecciona un proyecto antes de aprobar este registro.');
      return;
    }

    const finalAmount = editingId === entry.id ? editAmount : entry.amount_usd;
    if (finalAmount <= 0) {
      alert('Debes establecer un monto en USD válido mayor a 0 antes de aprobar. Haz clic en el botón de Editar (lápiz) para ingresar la conversión.');
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
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
        <RefreshCw size={20} />
        <span>Cargando registros pendientes de Telegram...</span>
      </div>
    );
  }

  // Filtrado por proyecto o cliente opcional
  const targetEntries = entries.filter((e) => {
    if (projectIdFilter && e.project_id !== projectIdFilter) return false;
    if (clientIdFilter && e.projects?.client_id !== clientIdFilter) return false;
    return true;
  });

  // Filtrado por Tab activo
  const filteredEntries = targetEntries.filter((e) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'client_payment') return e.entry_type === 'client_payment';
    if (activeTab === 'cost_materials') return e.entry_type === 'cost' && (e.category === 'materials' || !e.category);
    if (activeTab === 'cost_labor') return e.entry_type === 'cost' && e.category === 'labor';
    if (activeTab === 'partner_advance') return e.entry_type === 'partner_advance';
    if (activeTab === 'commitment') return e.entry_type === 'commitment';
    return true;
  });

  const getBadge = (entry: TelegramPendingEntry) => {
    if (entry.entry_type === 'client_payment') {
      return <span className="badge badge-success">💰 Abono Cliente</span>;
    }
    if (entry.entry_type === 'partner_advance') {
      return <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>💼 Retiro Socio</span>;
    }
    if (entry.entry_type === 'commitment') {
      return <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>📝 Cuenta por Pagar</span>;
    }
    if (entry.entry_type === 'cost') {
      if (entry.category === 'labor') {
        return <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }}>🔨 Mano de Obra</span>;
      }
      return <span className="badge badge-warning">🏗️ Materiales/Gasto</span>;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
        <RefreshCw size={20} className="animate-spin" />
        <span>Cargando registros pendientes de Telegram...</span>
      </div>
    );
  }

  if (targetEntries.length === 0) {
    return null; // Ocultar panel si no hay pendientes
  }

  return (
    <div className="card" style={{ marginBottom: '2rem', padding: 0, overflow: 'hidden', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
      <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
            <Send size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              Cargos Pendientes (Pepe AI & Telegram)
              <span style={{ background: 'var(--primary-color)', color: 'black', fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: '99px' }}>
                {targetEntries.length}
              </span>
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem', marginBottom: 0 }}>
              Movimientos enviados por Telegram en espera de tu confirmación en 1 clic.
            </p>
          </div>
        </div>

        <button
          onClick={loadEntries}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', borderRadius: '8px' }}
          title="Actualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Tabs de categorías */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', overflowX: 'auto' }}>
        {[
          { id: 'all', label: 'Todos', count: targetEntries.length },
          { id: 'client_payment', label: '💰 Abonos', count: targetEntries.filter(e => e.entry_type === 'client_payment').length },
          { id: 'cost_materials', label: '🏗️ Materiales', count: targetEntries.filter(e => e.entry_type === 'cost' && (e.category === 'materials' || !e.category)).length },
          { id: 'cost_labor', label: '🔨 Mano de Obra', count: targetEntries.filter(e => e.entry_type === 'cost' && e.category === 'labor').length },
          { id: 'partner_advance', label: '💼 Retiro Socios', count: targetEntries.filter(e => e.entry_type === 'partner_advance').length },
          { id: 'commitment', label: '📝 Cuentas por Pagar', count: targetEntries.filter(e => e.entry_type === 'commitment').length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              border: activeTab === tab.id ? '1px solid var(--primary-color)' : '1px solid transparent',
              background: activeTab === tab.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: activeTab === tab.id ? 'var(--primary-color)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: '99px', background: activeTab === tab.id ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)', color: activeTab === tab.id ? 'black' : 'white' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filteredEntries.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No hay registros pendientes en esta categoría.
          </div>
        ) : (
          filteredEntries.map((entry, index) => {
          const isEditing = editingId === entry.id;
          const isProcessing = processingId === entry.id;
          const isLast = index === entries.length - 1;

          return (
            <div key={entry.id} style={{ padding: '1.5rem', borderBottom: isLast ? 'none' : '1px solid var(--border-color)', transition: 'background 0.2s' }}>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {getBadge(entry)}
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                      vía @{entry.telegram_user_name || 'bot'} • {new Date(entry.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Mensaje original de Telegram */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.85rem', color: '#cbd5e1', fontStyle: 'italic', border: '1px solid rgba(255,255,255,0.05)' }}>
                    💬 &quot;{entry.raw_message}&quot;
                  </div>

                  {/* Modo edición o vista */}
                  {isEditing ? (
                    <div style={{ marginTop: '0.75rem', background: 'rgba(245, 158, 11, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Descripción</label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="input-field"
                            style={{ padding: '0.5rem 0.75rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Monto ($ USD)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                            className="input-field"
                            style={{ padding: '0.5rem 0.75rem', width: '100%' }}
                          />
                          {entry.ai_parsed_data?.original_currency === 'VES' && entry.ai_parsed_data?.original_amount > 0 && (
                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monto original: {entry.ai_parsed_data.original_amount} Bs</span>
                              <button
                                onClick={() => {
                                  const rate = parseFloat(prompt('Ingresa la tasa de cambio (VES por USD):', '42') || '0');
                                  if (rate > 0) setEditAmount(Number((entry.ai_parsed_data.original_amount / rate).toFixed(2)));
                                }}
                                className="btn-secondary"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                title="Calcular monto en USD usando tasa"
                                type="button"
                              >
                                ÷ Tasa
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Proyecto Destino</label>
                          <select
                            value={editProjectId}
                            onChange={(e) => setEditProjectId(e.target.value)}
                            className="input-field"
                            style={{ padding: '0.5rem 0.75rem' }}
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
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Categoría</label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="input-field"
                              style={{ padding: '0.5rem 0.75rem' }}
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
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Nombre del Socio</label>
                            <input
                              type="text"
                              value={editPartnerName}
                              onChange={(e) => setEditPartnerName(e.target.value)}
                              className="input-field"
                              style={{ padding: '0.5rem 0.75rem' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: entry.amount_usd > 0 ? 'var(--success)' : 'var(--warning)' }}>
                          {entry.amount_usd > 0 ? `$${entry.amount_usd.toFixed(2)} USD` : (
                            entry.ai_parsed_data?.original_currency === 'VES' 
                              ? `${entry.ai_parsed_data.original_amount} Bs (Falta Tasa)` 
                              : '$0.00 USD (Falta Monto)'
                          )}
                        </span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'white' }}>
                          — {entry.description}
                        </span>
                      </div>

                      {/* Selector directo de Cliente -> Proyecto en 2 niveles */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                          <User size={14} style={{ color: 'var(--primary-color)' }} />
                          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Cliente:</span>
                          <select
                            value={selectedClientMap[entry.id] || ''}
                            onChange={(e) => handleClientChange(entry.id, e.target.value)}
                            className="input-field"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'rgba(15,23,42,0.8)', borderColor: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            <option value="">-- Seleccionar Cliente --</option>
                            {clientOptions.map((client) => (
                              <option key={client} value={client}>
                                {client}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                          <Building size={14} style={{ color: 'var(--success)' }} />
                          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Proyecto:</span>
                          <select
                            value={selectedProjectMap[entry.id] || ''}
                            onChange={(e) => handleProjectChange(entry.id, e.target.value)}
                            className="input-field"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'rgba(15,23,42,0.8)', borderColor: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            <option value="">-- Seleccionar Proyecto --</option>
                            {projects
                              .filter((p) => !selectedClientMap[entry.id] || p.clientName === selectedClientMap[entry.id])
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              ))}
                          </select>
                        </div>

                        {entry.suggested_project_name && !selectedProjectMap[entry.id] && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontStyle: 'italic' }}>
                            (Sugerido por IA: {entry.suggested_project_name})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleApprove(entry)}
                        disabled={isProcessing}
                        className="btn-primary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      >
                        <Check size={16} /> Guardar y Aprobar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="btn-secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApprove(entry)}
                        disabled={isProcessing}
                        className="btn-primary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', opacity: isProcessing ? 0.5 : 1 }}
                      >
                        <Check size={16} /> Aprobar
                      </button>
                      <button
                        onClick={() => handleStartEdit(entry)}
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer' }}
                        title="Editar antes de aprobar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleReject(entry.id)}
                        disabled={isProcessing}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer' }}
                        title="Rechazar"
                      >
                        <X size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        }))}
      </div>
    </div>
  );
}

