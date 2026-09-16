'use client';

import React, { useState } from 'react';
import { 
  Wallet, 
  Search, 
  ChevronDown, 
  CheckCircle, 
  Plus, 
  Briefcase,
  AlertCircle,
  Receipt
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface MobilePayablesViewProps {
  accounts: any[];
  loading: boolean;
  onOpenPaymentModal: (account: any, mode: 'abono' | 'total') => void;
  onNewAccount?: () => void;
  canEdit?: boolean;
}

export default function MobilePayablesView({
  accounts,
  loading,
  onOpenPaymentModal,
  onNewAccount,
  canEdit = true
}: MobilePayablesViewProps) {
  const [tab, setTab] = useState<'pendientes' | 'pagados'>('pendientes');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Enriquecer y calcular saldos
  const enriched = accounts.map(a => {
    const paid = (a.payable_payments || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount_usd) || 0), 0);
    const total = Number(a.total_amount_usd) || 0;
    const balance = Math.max(0, total - paid);
    const isPaid = balance <= 0.01 || a.status === 'paid';
    const isCancelled = a.status === 'cancelled';
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

    return {
      ...a,
      paid,
      total,
      balance,
      isPaid,
      isCancelled,
      pct
    };
  });

  const filtered = enriched.filter(a => {
    if (a.isCancelled) return false;
    const matchesTab = tab === 'pendientes' ? !a.isPaid : a.isPaid;
    const matchesSearch = 
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase()) ||
      a.project?.title?.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const totalPending = enriched.filter(a => !a.isPaid && !a.isCancelled).reduce((acc, a) => acc + a.balance, 0);

  return (
    <div className="mobile-view-root" style={{ paddingBottom: '5rem' }}>
      {/* Header con tarjeta de Saldo Global por Pagar */}
      <div style={{
        background: 'linear-gradient(135deg, #241619 0%, #151012 100%)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: '18px',
        padding: '1.25rem',
        marginBottom: '1.2rem',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.2rem' }}>
          <Wallet size={16} /> CUENTAS POR PAGAR
        </div>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Pendiente por Pagar a Proveedores:</span>
        <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#f8fafc', margin: '4px 0' }}>
          ${totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Tabs Pendientes / Pagados */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.5rem',
        backgroundColor: '#161a22',
        padding: '4px',
        borderRadius: '12px',
        marginBottom: '0.85rem'
      }}>
        <button
          onClick={() => setTab('pendientes')}
          style={{
            padding: '0.55rem',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: tab === 'pendientes' ? '#ef4444' : 'transparent',
            color: tab === 'pendientes' ? '#fff' : '#94a3b8'
          }}
        >
          Pendientes ({enriched.filter(a => !a.isPaid && !a.isCancelled).length})
        </button>
        <button
          onClick={() => setTab('pagados')}
          style={{
            padding: '0.55rem',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: tab === 'pagados' ? '#10b981' : 'transparent',
            color: tab === 'pagados' ? '#000' : '#94a3b8'
          }}
        >
          Pagadas ({enriched.filter(a => a.isPaid && !a.isCancelled).length})
        </button>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder="Buscar por proveedor o concepto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ paddingLeft: '2.75rem', height: '44px', fontSize: '0.9rem', borderRadius: '12px' }}
        />
      </div>

      {/* Lista de Cuentas por Pagar */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>Cargando cuentas...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          backgroundColor: '#161a22',
          borderRadius: '16px',
          padding: '2rem 1rem',
          textAlign: 'center',
          border: '1px dashed rgba(255, 255, 255, 0.15)'
        }}>
          <CheckCircle size={36} color="#10b981" style={{ margin: '0 auto 0.5rem auto' }} />
          <p style={{ margin: 0, color: '#f8fafc', fontWeight: 600 }}>No hay cuentas en esta sección</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map(a => {
            const isExpanded = expandedId === a.id;

            return (
              <div
                key={a.id}
                style={{
                  backgroundColor: '#161a22',
                  borderRadius: '16px',
                  padding: '1.1rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                }}
              >
                {/* Header de Cuenta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}>
                    {a.type === 'materials' ? 'Materiales' : a.type === 'labor' ? 'Mano de Obra' : a.type === 'contractor' ? 'Subcontratista' : 'General'}
                  </span>

                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: a.isPaid ? '#10b981' : '#ef4444' }}>
                    {a.pct}% Pagado
                  </span>
                </div>

                <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                  {a.name}
                </h3>

                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
                  {a.description}
                </p>

                {a.project && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.75rem' }}>
                    <Briefcase size={13} /> Obra: #{a.project.proposal_number || ''} {a.project.title}
                  </span>
                )}

                {/* Barra de progreso */}
                <div style={{ width: '100%', height: '7px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.85rem' }}>
                  <div style={{ width: `${a.pct}%`, height: '100%', backgroundColor: a.isPaid ? '#10b981' : '#ef4444', borderRadius: '999px' }} />
                </div>

                {/* Desglose Financiero */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', marginBottom: '0.85rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>Total Deuda</span>
                    <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>${a.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: a.isPaid ? '#10b981' : '#ef4444', display: 'block' }}>
                      {a.isPaid ? 'Estado' : 'Saldo Pendiente'}
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: a.isPaid ? '#10b981' : '#ef4444' }}>
                      {a.isPaid ? 'Pagado Total' : `$${a.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    </strong>
                  </div>
                </div>

                {/* Botones de acción */}
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  {!a.isPaid && canEdit && (
                    <button
                      onClick={() => onOpenPaymentModal(a, 'abono')}
                      style={{
                        flex: 1,
                        height: '42px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Receipt size={16} /> + Abonar / Pagar
                    </button>
                  )}

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : a.id)}
                    style={{
                      padding: '0 0.85rem',
                      height: '42px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: '#f8fafc',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      cursor: 'pointer'
                    }}
                  >
                    <span>Pagos ({a.payable_payments?.length || 0})</span>
                    <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                </div>

                {/* Historial desplegable de abonos a proveedores */}
                {isExpanded && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.45rem' }}>
                      Pagos realizados a proveedor:
                    </span>
                    {(!a.payable_payments || a.payable_payments.length === 0) ? (
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>No se han emitido pagos</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {a.payable_payments.map((pay: any) => (
                          <div key={pay.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem' }}>
                            <div>
                              <span style={{ color: '#f8fafc', fontWeight: 600, display: 'block' }}>{pay.description || 'Abono'}</span>
                              <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{pay.date || 'S/F'} {pay.reference ? `• Ref: ${pay.reference}` : ''}</span>
                            </div>
                            <strong style={{ color: '#ef4444', fontSize: '0.88rem' }}>
                              -${Number(pay.amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button para crear cuenta si se desea */}
      {canEdit && onNewAccount && (
        <button
          onClick={onNewAccount}
          style={{
            position: 'fixed',
            right: '1.25rem',
            bottom: 'calc(76px + env(safe-area-inset-bottom))',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 25px rgba(239, 68, 68, 0.45)',
            cursor: 'pointer',
            zIndex: 100
          }}
        >
          <Plus size={28} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
