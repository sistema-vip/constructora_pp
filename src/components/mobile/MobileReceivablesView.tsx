'use client';

import React, { useState } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle, 
  Plus, 
  Calendar,
  CreditCard
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface MobileReceivablesViewProps {
  projects: any[];
  loading: boolean;
  onNewPayment: (projectId?: string) => void;
  canEdit?: boolean;
}

export default function MobileReceivablesView({
  projects,
  loading,
  onNewPayment,
  canEdit = true
}: MobileReceivablesViewProps) {
  const [tab, setTab] = useState<'pendientes' | 'saldados'>('pendientes');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Calcular métricas
  const enriched = projects.map(p => {
    const totalPayments = (p.project_payments || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount_usd) || 0), 0);
    const totalExtras = (p.project_extras || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount_usd) || 0), 0);
    const totalBudget = (Number(p.budget_usd) || 0) + totalExtras;
    const balance = totalBudget - totalPayments;
    const isSettled = balance <= 0.01;
    const pct = totalBudget > 0 ? Math.min(100, Math.round((totalPayments / totalBudget) * 100)) : 0;

    return {
      ...p,
      totalPayments,
      totalBudget,
      balance,
      isSettled,
      pct
    };
  });

  const filtered = enriched.filter(p => {
    const matchesTab = tab === 'pendientes' ? !p.isSettled : p.isSettled;
    const matchesSearch = 
      p.title?.toLowerCase().includes(search.toLowerCase()) ||
      p.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      String(p.proposal_number || '').includes(search);
    return matchesTab && matchesSearch;
  });

  const totalPending = enriched.filter(p => !p.isSettled).reduce((acc, p) => acc + p.balance, 0);

  return (
    <div className="mobile-view-root" style={{ paddingBottom: '5rem' }}>
      {/* Header con tarjeta de Saldo Global por Cobrar */}
      <div style={{
        background: 'linear-gradient(135deg, #18202c 0%, #12161f 100%)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: '18px',
        padding: '1.25rem',
        marginBottom: '1.2rem',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.2rem' }}>
          <TrendingUp size={16} /> CUENTAS POR COBRAR
        </div>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Pendiente por Cobrar a Clientes:</span>
        <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#f8fafc', margin: '4px 0' }}>
          ${totalPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Tabs Pendientes / Saldados */}
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
            backgroundColor: tab === 'pendientes' ? 'var(--primary-color)' : 'transparent',
            color: tab === 'pendientes' ? '#000' : '#94a3b8'
          }}
        >
          Pendientes ({enriched.filter(p => !p.isSettled).length})
        </button>
        <button
          onClick={() => setTab('saldados')}
          style={{
            padding: '0.55rem',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: tab === 'saldados' ? '#10b981' : 'transparent',
            color: tab === 'saldados' ? '#000' : '#94a3b8'
          }}
        >
          Saldados ({enriched.filter(p => p.isSettled).length})
        </button>
      </div>

      {/* Buscador táctil */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder="Buscar por cliente o proyecto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ paddingLeft: '2.75rem', height: '44px', fontSize: '0.9rem', borderRadius: '12px' }}
        />
      </div>

      {/* Lista de Cuentas */}
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
          <p style={{ margin: 0, color: '#f8fafc', fontWeight: 600 }}>No hay proyectos en esta sección</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map(p => {
            const isExpanded = expandedId === p.id;

            return (
              <div
                key={p.id}
                style={{
                  backgroundColor: '#161a22',
                  borderRadius: '16px',
                  padding: '1.1rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                }}
              >
                {/* Header Proyecto */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary-color)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                    #{p.proposal_number || 'S/N'}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: p.isSettled ? '#10b981' : '#f59e0b' }}>
                    {p.pct}% Cobrado
                  </span>
                </div>

                <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                  {p.title}
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8', display: 'block', marginBottom: '0.75rem' }}>
                  Cliente: {p.clients?.name || 'Sin asignar'}
                </span>

                {/* Barra de progreso */}
                <div style={{ width: '100%', height: '7px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.85rem' }}>
                  <div style={{ width: `${p.pct}%`, height: '100%', backgroundColor: p.isSettled ? '#10b981' : 'var(--primary-color)', borderRadius: '999px' }} />
                </div>

                {/* Desglose Financiero */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', marginBottom: '0.85rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>Total Obra</span>
                    <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>${p.totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: p.isSettled ? '#10b981' : 'var(--primary-color)', display: 'block' }}>
                      {p.isSettled ? 'Estado' : 'Saldo x Cobrar'}
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: p.isSettled ? '#10b981' : '#ef4444' }}>
                      {p.isSettled ? 'Saldado' : `$${p.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    </strong>
                  </div>
                </div>

                {/* Botones de acción */}
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  {!p.isSettled && canEdit && (
                    <button
                      onClick={() => onNewPayment(p.id)}
                      style={{
                        flex: 1,
                        height: '42px',
                        backgroundColor: '#10b981',
                        color: '#000',
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
                      <DollarSign size={16} /> + Registrar Cobro
                    </button>
                  )}

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
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
                    <span>Historial ({p.project_payments?.length || 0})</span>
                    <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                </div>

                {/* Historial desplegable */}
                {isExpanded && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.45rem' }}>
                      Abonos recibidos:
                    </span>
                    {(!p.project_payments || p.project_payments.length === 0) ? (
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>No se han registrado abonos</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {p.project_payments.map((pay: any) => (
                          <div key={pay.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem' }}>
                            <div>
                              <span style={{ color: '#f8fafc', fontWeight: 600, display: 'block' }}>{pay.description || 'Cobro'}</span>
                              <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{pay.date || 'S/F'} {pay.reference ? `• Ref: ${pay.reference}` : ''}</span>
                            </div>
                            <strong style={{ color: '#10b981', fontSize: '0.88rem' }}>
                              +${Number(pay.amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
    </div>
  );
}
