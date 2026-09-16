'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  HardHat, 
  TrendingUp, 
  Users, 
  Clock, 
  DollarSign, 
  ChevronRight, 
  ArrowUpRight, 
  Receipt,
  Plus,
  Briefcase,
  AlertCircle
} from 'lucide-react';
import MobileBottomSheet from './MobileBottomSheet';
import MobileFloatingAction from './MobileFloatingAction';
import { handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';

interface MobileDashboardProps {
  stats: {
    clientsCount: number;
    activeProjectsCount: number;
    pendingQuotesCount: number;
    totalBalance: number;
  };
  recentProjects: any[];
  activeProjectsList: any[];
  loading: boolean;
  onRefresh: () => void;
  // Forms & Submit Handlers
  handleAddClient: (e: React.FormEvent) => Promise<void>;
  handleAddExpense: (e: React.FormEvent) => Promise<void>;
  handleAddPayment: (e: React.FormEvent) => Promise<void>;
  newClient: any;
  setNewClient: React.Dispatch<React.SetStateAction<any>>;
  expenseForm: any;
  setExpenseForm: React.Dispatch<React.SetStateAction<any>>;
  paymentForm: any;
  setPaymentForm: React.Dispatch<React.SetStateAction<any>>;
  clientsList?: any[];
  userName?: string;
}

export default function MobileDashboard({
  stats,
  recentProjects,
  activeProjectsList,
  loading,
  onRefresh,
  handleAddClient,
  handleAddExpense,
  handleAddPayment,
  newClient,
  setNewClient,
  expenseForm,
  setExpenseForm,
  paymentForm,
  setPaymentForm,
  clientsList = [],
  userName = 'Henry'
}: MobileDashboardProps) {
  const [sheetExpense, setSheetExpense] = useState(false);
  const [sheetPayment, setSheetPayment] = useState(false);
  const [sheetClient, setSheetClient] = useState(false);

  // Estados para selección en cascada (1. Cliente -> 2. Proyecto)
  const [selectedClientForExpense, setSelectedClientForExpense] = useState<string>('');
  const [selectedClientForPayment, setSelectedClientForPayment] = useState<string>('');

  // Proyectos filtrados por cliente seleccionado
  const projectsForExpense = selectedClientForExpense
    ? activeProjectsList.filter(p => p.client_id === selectedClientForExpense || p.clients?.id === selectedClientForExpense)
    : [];

  const projectsForPayment = selectedClientForPayment
    ? activeProjectsList.filter(p => p.client_id === selectedClientForPayment || p.clients?.id === selectedClientForPayment)
    : [];

  // Clientes disponibles (desde clientsList o derivados de proyectos activos)
  const availableClients = clientsList.length > 0
    ? clientsList
    : Array.from(new Map(activeProjectsList.filter(p => p.clients?.name).map(p => [p.client_id || p.clients?.id || p.clients?.name, { id: p.client_id || p.clients?.id || p.clients?.name, name: p.clients?.name }])).values());

  return (
    <div className="mobile-app-root" style={{ paddingBottom: '5rem' }}>
      {/* 1. Header Saludo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.25rem'
      }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Panel Operativo
          </span>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', margin: '2px 0 0 0' }}>
            Hola, {userName} 👷‍♂️
          </h1>
        </div>
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '999px',
          padding: '0.35rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          color: 'var(--primary-color)',
          fontSize: '0.75rem',
          fontWeight: 700
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          P&P CONSTRUYE
        </div>
      </div>

      {/* 2. Tarjeta Financiera Principal (Estilo App Bancaria / Fintech) */}
      <div style={{
        background: 'linear-gradient(135deg, #1c222d 0%, #12151b 100%)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: '20px',
        padding: '1.4rem',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '-30px',
          right: '-30px',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, rgba(245, 158, 11, 0) 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
            Saldo Disponible en Cuentas
          </span>
          <span style={{
            fontSize: '0.7rem',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            padding: '2px 8px',
            borderRadius: '999px',
            fontWeight: 700
          }}>
            Activo
          </span>
        </div>

        <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '1.2rem' }}>
          ${stats.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        {/* Resumen 2 columnas en la tarjeta */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '1rem'
        }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Obras en Marcha</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
              <HardHat size={16} color="var(--primary-color)" />
              <strong style={{ color: '#f8fafc', fontSize: '1.05rem' }}>{stats.activeProjectsCount}</strong>
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Clientes Totales</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
              <Users size={16} color="#38bdf8" />
              <strong style={{ color: '#f8fafc', fontSize: '1.05rem' }}>{stats.clientsCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Botones de Acción Rápida (Touch Shortcuts) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.65rem',
        marginBottom: '1.75rem'
      }}>
        <button
          onClick={() => setSheetExpense(true)}
          style={{
            background: '#161a22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.9rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Receipt size={20} />
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f8fafc' }}>
            + Gasto
          </span>
        </button>

        <button
          onClick={() => setSheetPayment(true)}
          style={{
            background: '#161a22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.9rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <DollarSign size={20} />
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f8fafc' }}>
            + Cobro
          </span>
        </button>

        <button
          onClick={() => setSheetClient(true)}
          style={{
            background: '#161a22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.9rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={20} />
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f8fafc' }}>
            + Cliente
          </span>
        </button>
      </div>

      {/* 4. Feed de Obras Activas (Mobile Project Cards) */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem'
        }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Obras en Marcha ({activeProjectsList.length})
          </h2>
          <Link href="/proyectos" style={{ fontSize: '0.8rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
            Ver todas <ChevronRight size={14} />
          </Link>
        </div>

        {activeProjectsList.length === 0 ? (
          <div style={{
            backgroundColor: '#161a22',
            borderRadius: '16px',
            padding: '2rem 1rem',
            textAlign: 'center',
            border: '1px dashed rgba(255, 255, 255, 0.15)'
          }}>
            <HardHat size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>No hay obras en ejecución activa</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeProjectsList.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                href={`/proyectos/${p.id}`}
                style={{
                  backgroundColor: '#161a22',
                  borderRadius: '16px',
                  padding: '1rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textDecoration: 'none',
                  color: 'inherit',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    color: 'var(--primary-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <HardHat size={22} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 700 }}>
                        #{p.proposal_number || 'OBRA'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>•</span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.clients?.name || 'Cliente'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </div>
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  marginLeft: '0.5rem',
                  flexShrink: 0
                }}>
                  <ChevronRight size={16} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 5. Floating Action Button (+) */}
      <MobileFloatingAction
        onNewExpense={() => setSheetExpense(true)}
        onNewPayment={() => setSheetPayment(true)}
        onNewClient={() => setSheetClient(true)}
      />

      {/* 6. BOTTOM SHEETS (FORMULARIOS NATIVOS DESLIZANTES) */}

      {/* A) Bottom Sheet: Registrar Gasto */}
      <MobileBottomSheet
        isOpen={sheetExpense}
        onClose={() => setSheetExpense(false)}
        title="Registrar Gasto de Obra"
      >
        <form onSubmit={async (e) => {
          await handleAddExpense(e);
          setSheetExpense(false);
        }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Paso 1: Seleccionar Cliente */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '0.35rem', fontWeight: 700 }}>
              1. Seleccionar Cliente *
            </label>
            <select
              value={selectedClientForExpense}
              onChange={e => {
                const clientId = e.target.value;
                setSelectedClientForExpense(clientId);
                const matching = activeProjectsList.filter(p => p.client_id === clientId || p.clients?.id === clientId || p.clients?.name === clientId);
                if (matching.length === 1) {
                  setExpenseForm({ ...expenseForm, project_id: matching[0].id });
                } else {
                  setExpenseForm({ ...expenseForm, project_id: '' });
                }
              }}
              className="input-field"
              required
              style={{ height: '48px', fontSize: '0.95rem' }}
            >
              <option value="">-- Elige primero el cliente --</option>
              {availableClients.map((c: any) => (
                <option key={c.id || c.name} value={c.id || c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Paso 2: Seleccionar Proyecto / Obra del Cliente */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: selectedClientForExpense ? 'var(--primary-color)' : '#94a3b8', marginBottom: '0.35rem', fontWeight: 700 }}>
              2. Seleccionar Proyecto / Obra *
            </label>
            <select
              value={expenseForm.project_id}
              onChange={e => setExpenseForm({ ...expenseForm, project_id: e.target.value })}
              className="input-field"
              required
              disabled={!selectedClientForExpense}
              style={{ 
                height: '48px', 
                fontSize: '0.95rem',
                opacity: selectedClientForExpense ? 1 : 0.6
              }}
            >
              {!selectedClientForExpense ? (
                <option value="">Primero selecciona el cliente arriba...</option>
              ) : projectsForExpense.length === 0 ? (
                <option value="">Este cliente no tiene obras activas</option>
              ) : (
                <>
                  <option value="">-- Elige la obra afectada --</option>
                  {projectsForExpense.map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.proposal_number || 'OBRA'} - {p.title}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Monto en USD ($) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="$ 0.00"
              value={expenseForm.unit_price_usd}
              onChange={e => setExpenseForm({ ...expenseForm, unit_price_usd: handleMoneyInput(e.target.value) })}
              onBlur={e => setExpenseForm({ ...expenseForm, unit_price_usd: formatOnBlur(e.target.value) })}
              className="input-field"
              required
              style={{ height: '52px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-color)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Proveedor / Destinatario *
            </label>
            <input
              type="text"
              placeholder="Ej. Ferretería Central / Wilder"
              value={expenseForm.provider}
              onChange={e => setExpenseForm({ ...expenseForm, provider: e.target.value })}
              className="input-field"
              required
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Concepto / Descripción *
            </label>
            <input
              type="text"
              placeholder="Ej. 10 sacos de cemento, pago nómina..."
              value={expenseForm.description}
              onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
              className="input-field"
              required
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                Categoría
              </label>
              <select
                value={expenseForm.category}
                onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="input-field"
                style={{ height: '48px', fontSize: '0.9rem' }}
              >
                <option value="materials">Materiales</option>
                <option value="labor">Mano de Obra</option>
                <option value="equipment">Equipos</option>
                <option value="subcontract">Subcontrato</option>
                <option value="other">Otros</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                Fecha
              </label>
              <input
                type="date"
                value={expenseForm.date}
                onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                className="input-field"
                style={{ height: '48px', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{
              width: '100%',
              height: '52px',
              fontSize: '1rem',
              fontWeight: 700,
              justifyContent: 'center',
              marginTop: '0.5rem'
            }}
          >
            Guardar Gasto
          </button>
        </form>
      </MobileBottomSheet>

      {/* B) Bottom Sheet: Registrar Cobro */}
      <MobileBottomSheet
        isOpen={sheetPayment}
        onClose={() => setSheetPayment(false)}
        title="Registrar Cobro de Cliente"
      >
        <form onSubmit={async (e) => {
          await handleAddPayment(e);
          setSheetPayment(false);
        }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Paso 1: Seleccionar Cliente */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#10b981', marginBottom: '0.35rem', fontWeight: 700 }}>
              1. Seleccionar Cliente *
            </label>
            <select
              value={selectedClientForPayment}
              onChange={e => {
                const clientId = e.target.value;
                setSelectedClientForPayment(clientId);
                const matching = activeProjectsList.filter(p => p.client_id === clientId || p.clients?.id === clientId || p.clients?.name === clientId);
                if (matching.length === 1) {
                  setPaymentForm({ ...paymentForm, project_id: matching[0].id });
                } else {
                  setPaymentForm({ ...paymentForm, project_id: '' });
                }
              }}
              className="input-field"
              required
              style={{ height: '48px', fontSize: '0.95rem' }}
            >
              <option value="">-- Elige primero el cliente --</option>
              {availableClients.map((c: any) => (
                <option key={c.id || c.name} value={c.id || c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Paso 2: Seleccionar Proyecto / Obra del Cliente */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: selectedClientForPayment ? '#10b981' : '#94a3b8', marginBottom: '0.35rem', fontWeight: 700 }}>
              2. Seleccionar Proyecto / Obra *
            </label>
            <select
              value={paymentForm.project_id}
              onChange={e => setPaymentForm({ ...paymentForm, project_id: e.target.value })}
              className="input-field"
              required
              disabled={!selectedClientForPayment}
              style={{ 
                height: '48px', 
                fontSize: '0.95rem',
                opacity: selectedClientForPayment ? 1 : 0.6
              }}
            >
              {!selectedClientForPayment ? (
                <option value="">Primero selecciona el cliente arriba...</option>
              ) : projectsForPayment.length === 0 ? (
                <option value="">Este cliente no tiene obras activas</option>
              ) : (
                <>
                  <option value="">-- Elige la obra afectada --</option>
                  {projectsForPayment.map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.proposal_number || 'OBRA'} - {p.title}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Monto Cobrado ($) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="$ 0.00"
              value={paymentForm.amount_usd}
              onChange={e => setPaymentForm({ ...paymentForm, amount_usd: handleMoneyInput(e.target.value) })}
              onBlur={e => setPaymentForm({ ...paymentForm, amount_usd: formatOnBlur(e.target.value) })}
              className="input-field"
              required
              style={{ height: '52px', fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Referencia / Banco
            </label>
            <input
              type="text"
              placeholder="Ej. Zelle #4982 / Efectivo"
              value={paymentForm.reference}
              onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              className="input-field"
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Concepto / Observación
            </label>
            <input
              type="text"
              placeholder="Ej. Anticipo 50%, abono partida 2..."
              value={paymentForm.description}
              onChange={e => setPaymentForm({ ...paymentForm, description: e.target.value })}
              className="input-field"
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Fecha
            </label>
            <input
              type="date"
              value={paymentForm.date}
              onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
              className="input-field"
              style={{ height: '48px', fontSize: '0.9rem' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{
              width: '100%',
              height: '52px',
              fontSize: '1rem',
              fontWeight: 700,
              justifyContent: 'center',
              marginTop: '0.5rem',
              backgroundColor: '#10b981',
              color: '#000'
            }}
          >
            Guardar Cobro
          </button>
        </form>
      </MobileBottomSheet>

      {/* C) Bottom Sheet: Nuevo Cliente */}
      <MobileBottomSheet
        isOpen={sheetClient}
        onClose={() => setSheetClient(false)}
        title="Crear Nuevo Cliente"
      >
        <form onSubmit={async (e) => {
          await handleAddClient(e);
          setSheetClient(false);
        }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Nombre Completo *
            </label>
            <input
              type="text"
              placeholder="Ej. Zully Marrero"
              value={newClient.name}
              onChange={e => setNewClient({ ...newClient, name: e.target.value })}
              className="input-field"
              required
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Teléfono WhatsApp *
            </label>
            <input
              type="tel"
              placeholder="Ej. +58 412 1234567"
              value={newClient.phone}
              onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
              className="input-field"
              required
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Correo Electrónico
            </label>
            <input
              type="email"
              placeholder="cliente@ejemplo.com"
              value={newClient.email}
              onChange={e => setNewClient({ ...newClient, email: e.target.value })}
              className="input-field"
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Dirección de Obra / Residencia
            </label>
            <input
              type="text"
              placeholder="Ej. TH 25, Los Samanes"
              value={newClient.address}
              onChange={e => setNewClient({ ...newClient, address: e.target.value })}
              className="input-field"
              style={{ height: '48px', fontSize: '0.95rem' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{
              width: '100%',
              height: '52px',
              fontSize: '1rem',
              fontWeight: 700,
              justifyContent: 'center',
              marginTop: '0.5rem',
              backgroundColor: '#38bdf8',
              color: '#000'
            }}
          >
            Crear Cliente
          </button>
        </form>
      </MobileBottomSheet>
    </div>
  );
}
