'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, handleMoneyInput, formatOnBlur } from '@/lib/formatters';
import { useUser } from '@/lib/UserContext';
import { useAdminAction } from '@/lib/useAdminAction';
import { 
  TrendingUp, CheckCircle, TrendingDown, 
  ChevronDown, ChevronRight, Briefcase
} from 'lucide-react';
import Link from 'next/link';

interface ProjectPayment {
  id: string;
  amount_usd: number;
  description: string;
  reference: string;
  date: string;
  created_at: string;
}

interface ProjectExtra {
  id: string;
  amount_usd: number;
}

interface ReceivableProject {
  id: string;
  title: string;
  proposal_number: number;
  budget_usd: number;
  status: string;
  client_id: string;
  clients: {
    name: string;
  };
  project_payments: ProjectPayment[];
  project_extras: ProjectExtra[];
}

export default function CuentasPorCobrarPage() {
  const [projects, setProjects] = useState<ReceivableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'pendientes' | 'saldados'>('pendientes');
  
  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Forms
  const [paymentForm, setPaymentForm] = useState({
    project_id: '', amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0]
  });

  const { role } = useUser();
  const { isObserver, isClient, isSales } = useAdminAction();
  const isViewer = isObserver || isClient;

  const isActionDisabledForSales = (projectId: string) => {
    if (!isSales) return false;
    const project = projects.find(p => p.id === projectId);
    return project ? project.status !== 'proposal' : true;
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, clients(name), project_payments(*), project_extras(*)')
        .in('status', ['in_progress', 'completed'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filtrar proyectos que aún tienen saldo pendiente
      // O podríamos mostrar todos, incluyendo los 100% cobrados. Mostrar todos permite ver el historial.
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewer) return;
    if (isActionDisabledForSales(paymentForm.project_id)) {
      return alert('Ventas no puede modificar proyectos aprobados.');
    }

    try {
      const { error } = await supabase.from('project_payments').insert([{
        project_id: paymentForm.project_id,
        amount_usd: parseFloat(paymentForm.amount_usd) || 0,
        description: paymentForm.description,
        reference: paymentForm.reference,
        date: paymentForm.date
      }]);

      if (error) throw error;
      setShowPaymentModal(false);
      fetchData();
    } catch (err: any) {
      alert("Error registrando cobro: " + err.message);
    }
  };

  // KPIs
  const totalContracted = projects.reduce((acc, p) => {
    const extras = p.project_extras?.reduce((s, e) => s + Number(e.amount_usd), 0) || 0;
    return acc + Number(p.budget_usd) + extras;
  }, 0);
  
  const totalCollected = projects.reduce((acc, p) => 
    acc + (p.project_payments?.reduce((s, pay) => s + Number(pay.amount_usd), 0) || 0)
  , 0);
  
  const pendingBalance = totalContracted - totalCollected;

  const projectsWithBalance = projects.map(project => {
    const extras = project.project_extras?.reduce((s, e) => s + Number(e.amount_usd), 0) || 0;
    const total = Number(project.budget_usd) + extras;
    const paid = project.project_payments?.reduce((s, p) => s + Number(p.amount_usd), 0) || 0;
    const balance = total - paid;
    return { ...project, total, paid, balance };
  });

  const pendientesProjects = projectsWithBalance.filter(p => p.balance > 0);
  const saldadosProjects = projectsWithBalance.filter(p => p.balance <= 0);

  const displayedProjects = activeTab === 'pendientes' ? pendientesProjects : saldadosProjects;

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <TrendingUp size={28} color="var(--success)" /> Cuentas por Cobrar
        </h1>
        <p className="text-muted" style={{ fontSize: '1rem', margin: 0 }}>
          Gestión de saldos pendientes y pagos recibidos de clientes por proyectos aprobados.
        </p>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(56,189,248,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(56,189,248,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-blue)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <Briefcase size={16} /> <span style={{ fontWeight: 700 }}>Proyectos Activos</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>{projects.length}</div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <TrendingUp size={16} /> <span style={{ fontWeight: 700 }}>Total Contratado</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(totalContracted)}</div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16, 185, 129, 0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <CheckCircle size={16} /> <span style={{ fontWeight: 700 }}>Total Cobrado</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(totalCollected)}</div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(239,68,68,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <TrendingDown size={16} /> <span style={{ fontWeight: 700 }}>Saldo por Cobrar</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(pendingBalance)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('pendientes')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'pendientes' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'pendientes' ? 'var(--primary-color)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <TrendingDown size={18} /> Saldos Pendientes
          <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{pendientesProjects.length}</span>
        </button>
        <button 
          onClick={() => setActiveTab('saldados')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'saldados' ? '2px solid var(--success)' : '2px solid transparent',
            color: activeTab === 'saldados' ? 'var(--success)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <CheckCircle size={18} /> Cuentas Saldadas
          <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{saldadosProjects.length}</span>
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando proyectos...</div>
        ) : displayedProjects.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {activeTab === 'pendientes' ? 'No hay cuentas pendientes por cobrar.' : 'No hay cuentas saldadas.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ width: '40px', padding: '1rem' }}></th>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>CLIENTE</th>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>CONTRATADO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>COBRADO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>SALDO</th>
                  <th style={{ textAlign: 'center', padding: '1rem' }}>ESTADO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {displayedProjects.map(project => {
                  const total = project.total;
                  const paid = project.paid;
                  const balance = project.balance;
                  const extras = project.project_extras?.reduce((s: any, x: any) => s + Number(x.amount_usd), 0) || 0;
                  const isExpanded = expandedRows.has(project.id);
                  const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

                  return (
                    <React.Fragment key={project.id}>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                        <td style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => toggleRow(project.id)}>
                          {isExpanded ? <ChevronDown size={18} className="text-muted" /> : <ChevronRight size={18} className="text-muted" />}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <Link href={`/clientes/${project.client_id}`} style={{ fontWeight: 'bold', color: 'var(--accent-blue)', textDecoration: 'none' }}>
                            {project.clients?.name || 'Desconocido'}
                          </Link>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <Link href={`/proyectos/${project.id}`} style={{ fontWeight: 'bold', color: 'white', textDecoration: 'none' }}>
                            {project.proposal_number ? `#${project.proposal_number} - ` : ''}{project.title}
                          </Link>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>${formatCurrency(total)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>${formatCurrency(paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          ${formatCurrency(balance)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          {balance <= 0 ? (
                            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', fontWeight: 'bold' }}>Saldado</span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: 'var(--primary-color)', fontWeight: 'bold' }}>Pendiente</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          {!isViewer && balance > 0 && !isActionDisabledForSales(project.id) && (
                            <button 
                              className="btn-primary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPaymentForm({ project_id: project.id, amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
                                setShowPaymentModal(true);
                              }}
                            >
                              Cobrar
                            </button>
                          )}
                        </td>
                      </tr>
                      
                      {/* Panel Expandido con Historial de Pagos */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              
                              {/* Barra de progreso */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? 'var(--success)' : 'var(--accent-blue)', transition: 'width 0.3s ease' }}></div>
                                </div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: progress >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>
                                  {progress}% Cobrado
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Historial de Cobros Recibidos</h4>
                                  
                                  {(!project.project_payments || project.project_payments.length === 0) ? (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No se han registrado cobros.</div>
                                  ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                      <thead>
                                        <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Concepto</th>
                                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Referencia</th>
                                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Monto</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {project.project_payments.map((p: any) => (
                                          <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '0.5rem' }}>{p.date || new Date(p.created_at).toISOString().split('T')[0]}</td>
                                            <td style={{ padding: '0.5rem' }}>{p.description || '-'}</td>
                                            <td style={{ padding: '0.5rem', color: 'var(--primary-color)' }}>{p.reference || '-'}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>${formatCurrency(p.amount_usd)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                                
                                <div>
                                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Desglose de Contrato</h4>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Presupuesto Base</span>
                                    <span style={{ fontWeight: 'bold' }}>${formatCurrency(project.budget_usd)}</span>
                                  </div>
                                  {project.project_extras && project.project_extras.length > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Adicionales ({project.project_extras.length})</span>
                                      <span style={{ fontWeight: 'bold' }}>${formatCurrency(extras)}</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', color: 'var(--primary-color)' }}>
                                    <span style={{ fontWeight: 'bold' }}>Total Contratado</span>
                                    <span style={{ fontWeight: 'bold' }}>${formatCurrency(total)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Cobro */}
      {showPaymentModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-scale">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={24} color="var(--success)" /> Registrar Cobro a Cliente
            </h2>
            <form onSubmit={handleSavePayment}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div className="form-group">
                  <label>Monto (USD)</label>
                  <input
                    type="text"
                    required
                    value={paymentForm.amount_usd}
                    onChange={(e) => setPaymentForm({...paymentForm, amount_usd: handleMoneyInput(e.target.value)})}
                    onBlur={(e) => setPaymentForm({...paymentForm, amount_usd: formatOnBlur(e.target.value)})}
                    placeholder="Ej. 1500.00"
                  />
                </div>
                <div className="form-group">
                  <label>Concepto / Descripción</label>
                  <input
                    type="text"
                    required
                    value={paymentForm.description}
                    onChange={e => setPaymentForm({...paymentForm, description: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Referencia / Banco</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Fecha del Cobro</label>
                  <input
                    type="date"
                    required
                    value={paymentForm.date}
                    onChange={e => setPaymentForm({...paymentForm, date: e.target.value})}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Registrar Cobro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
