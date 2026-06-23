'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, handleMoneyInput, formatOnBlur } from '@/lib/formatters';
import { useUser } from '@/lib/UserContext';
import { useAdminAction } from '@/lib/useAdminAction';
import { 
  Wallet, Users, DollarSign, TrendingDown, 
  PlusCircle, Edit3, Trash2, CheckCircle, 
  ChevronDown, ChevronRight, AlertCircle, X, Eye, Printer, FileText
} from 'lucide-react';
import Image from 'next/image';

interface PayablePayment {
  id: string;
  amount_usd: number;
  description: string;
  reference: string;
  date: string;
  created_at: string;
}

interface PayableAccount {
  id: string;
  name: string;
  type: string;
  description: string;
  total_amount_usd: number;
  project_id: string | null;
  commitment_id?: string | null;
  project?: {
    title: string;
    proposal_number?: number;
  };
  contact_info: string;
  status: string;
  created_at: string;
  payable_payments: PayablePayment[];
}

export default function CuentasPorPagarPage() {
  const [accounts, setAccounts] = useState<PayableAccount[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedAccountForDetails, setSelectedAccountForDetails] = useState<any>(null);

  // Print Job
  const [activePrintJob, setActivePrintJob] = useState<'none' | 'payable-voucher'>('none');
  const [printPayableData, setPrintPayableData] = useState<any>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);

  function handlePrintPayable(account: any) {
    setPrintPayableData(account);
    setActivePrintJob('payable-voucher');
    setTimeout(() => {
      window.print();
      setActivePrintJob('none');
      setPrintPayableData(null);
    }, 300);
  }
  
  // Forms
  const [accountForm, setAccountForm] = useState<any>({
    name: '', type: 'obrero', description: '', total_amount_usd: '', project_id: '', contact_info: '', status: 'active'
  });
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  
  const [paymentForm, setPaymentForm] = useState({
    payable_account_id: '', amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0]
  });

  // Admin Delete Auth
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'account' | 'payment' } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { role } = useUser();
  const { isObserver, isClient, isSales } = useAdminAction();
  const isViewer = isObserver || isClient;

  const isActionDisabledForSales = (projectId: string | null) => {
    if (!isSales || !projectId) return false;
    const project = projects.find(p => p.id === projectId);
    return project ? project.status !== 'proposal' : true;
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [accountsRes, projectsRes] = await Promise.all([
        supabase.from('payable_accounts')
          .select('*, project:projects(title, proposal_number), payable_payments(*)')
          .order('created_at', { ascending: false }),
        supabase.from('projects')
          .select('id, title, proposal_number')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (projectsRes.error) throw projectsRes.error;

      setAccounts(accountsRes.data || []);
      setProjects(projectsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewer) return;
    if (isActionDisabledForSales(accountForm.project_id)) {
      return alert('Ventas no puede modificar proyectos aprobados.');
    }
    
    try {
      const payload = {
        name: accountForm.name,
        type: accountForm.type,
        description: accountForm.description,
        total_amount_usd: parseFloat(accountForm.total_amount_usd) || 0,
        project_id: accountForm.project_id || null,
        contact_info: accountForm.contact_info,
        status: accountForm.status
      };

      let error;
      if (editingAccountId) {
        const res = await supabase.from('payable_accounts').update(payload).eq('id', editingAccountId);
        error = res.error;
      } else {
        const res = await supabase.from('payable_accounts').insert([payload]);
        error = res.error;
      }

      if (error) throw error;
      
      setShowAccountModal(false);
      setEditingAccountId(null);
      fetchData();
    } catch (err: any) {
      alert("Error guardando cuenta: " + err.message);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewer) return;
    const account = accounts.find(a => a.id === paymentForm.payable_account_id);
    if (account && isActionDisabledForSales(account.project_id)) {
      return alert('Ventas no puede modificar proyectos aprobados.');
    }

    try {
      const paymentAmount = parseFloat(paymentForm.amount_usd) || 0;
      const { error } = await supabase.from('payable_payments').insert([{
        payable_account_id: paymentForm.payable_account_id,
        amount_usd: paymentAmount,
        description: paymentForm.description,
        reference: paymentForm.reference,
        date: paymentForm.date
      }]);

      if (error) throw error;

      if (account && account.project_id) {
        let costCategory = 'materials';
        if (account.type === 'obrero') costCategory = 'labor';
        else if (account.type === 'alquiler') costCategory = 'equipment';
        else if (account.type === 'subcontratista') costCategory = 'subcontract';

        const { error: costError } = await supabase.from('project_costs').insert([{
          project_id: account.project_id,
          description: `Abono a CxP: ${account.name} - ${paymentForm.description}`,
          provider: account.name,
          category: costCategory,
          quantity: 1,
          unit_price_usd: paymentAmount,
          total_usd: paymentAmount,
          date: paymentForm.date
        }]);

        if (costError) console.error("Error al registrar gasto:", costError);
      }

      if (account) {
        const previouslyPaid = account.payable_payments?.reduce((sum: number, p: any) => sum + Number(p.amount_usd), 0) || 0;
        const totalAmount = Number(account.total_amount_usd);
        const remainingBalance = totalAmount - previouslyPaid - paymentAmount;

        if (remainingBalance <= 0.01 && previouslyPaid + paymentAmount >= totalAmount) {
          const { error: statusError } = await supabase.from('payable_accounts')
            .update({ status: 'paid' })
            .eq('id', account.id);
          if (statusError) console.error("Error al actualizar estado CxP:", statusError);
        }
      }

      setShowPaymentModal(false);
      fetchData();
    } catch (err: any) {
      alert("Error registrando abono: " + err.message);
    }
  };

  const initiateDelete = (id: string, type: 'account' | 'payment') => {
    setItemToDelete({ id, type });
    setShowAdminAuth(true);
    setAdminPassword('');
    setAuthError('');
  };

  const handleConfirmDelete = async () => {
    const MASTER_KEY = '080911'; 
    if (adminPassword !== MASTER_KEY) {
      setAuthError('Contraseña incorrecta. Solo administradores autorizados.');
      return;
    }

    if (!itemToDelete) return;
    setDeleting(true);
    
    try {
      const table = itemToDelete.type === 'account' ? 'payable_accounts' : 'payable_payments';
      const { error } = await supabase.from(table).delete().eq('id', itemToDelete.id);
      if (error) throw error;

      setShowAdminAuth(false);
      setItemToDelete(null);
      fetchData();
    } catch (error: any) {
      alert('Error al eliminar: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  // KPIs
  const activeAccounts = accounts.filter(a => a.status === 'active');
  const totalCommitted = activeAccounts.reduce((acc, a) => acc + Number(a.total_amount_usd), 0);
  const totalPaidActive = activeAccounts.reduce((acc, a) => 
    acc + (a.payable_payments?.reduce((s, p) => s + Number(p.amount_usd), 0) || 0)
  , 0);
  const pendingBalance = totalCommitted - totalPaidActive;

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Wallet size={28} color="var(--primary-color)" /> Cuentas por Pagar
        </h1>
        <p className="text-muted" style={{ fontSize: '1rem', margin: 0 }}>
          Gestión de contratos y pagos pendientes a obreros, proveedores y subcontratistas.
        </p>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(56,189,248,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(56,189,248,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-blue)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <Users size={16} /> <span style={{ fontWeight: 700 }}>Cuentas Activas</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>{activeAccounts.length}</div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <DollarSign size={16} /> <span style={{ fontWeight: 700 }}>Total Comprometido</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(totalCommitted)}</div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16, 185, 129, 0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <CheckCircle size={16} /> <span style={{ fontWeight: 700 }}>Total Abonado</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(totalPaidActive)}</div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(239,68,68,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>
            <TrendingDown size={16} /> <span style={{ fontWeight: 700 }}>Saldo Pendiente</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(pendingBalance)}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        {!isViewer && (
          <button 
            className="btn-primary"
            onClick={() => {
              setEditingAccountId(null);
              setAccountForm({ name: '', type: 'obrero', description: '', total_amount_usd: '', project_id: '', contact_info: '', status: 'active' });
              setShowAccountModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <PlusCircle size={16} /> Nueva Cuenta
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando cuentas...</div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay cuentas por pagar registradas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>NOMBRE</th>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>TIPO</th>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>CONTRATO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>ABONADO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>SALDO</th>
                  <th style={{ textAlign: 'center', padding: '1rem' }}>ESTADO</th>
                  <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => {
                  const paid = account.payable_payments?.reduce((s, p) => s + Number(p.amount_usd), 0) || 0;
                  const balance = Number(account.total_amount_usd) - paid;
                  const isFromCommitment = Boolean(account.commitment_id);

                  return (
                    <tr key={account.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {account.name}
                            {isFromCommitment && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(59,130,246,0.2)' }}>
                                COMPROMISO
                              </span>
                            )}
                          </div>
                          {account.contact_info && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{account.contact_info}</div>}
                        </td>
                        <td style={{ padding: '1rem', textTransform: 'capitalize' }}>{account.type}</td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                          {account.project ? `${account.project.proposal_number ? `#${account.project.proposal_number} ` : ''}${account.project.title}` : 'General'}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(account.total_amount_usd)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>${formatCurrency(paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: balance > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                          ${formatCurrency(balance)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span className={`badge ${account.status === 'active' ? 'badge-primary' : account.status === 'paid' ? 'badge-success' : 'badge-danger'}`}>
                            {account.status === 'active' ? 'Activa' : account.status === 'paid' ? 'Saldada' : 'Cancelada'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }}
                            onClick={() => setSelectedAccountForDetails(account)}
                            title="Ver detalles e imprimir"
                          >
                            <Eye size={14} /> Detalles
                          </button>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                            onClick={() => handlePrintPayable(account)}
                            title="Imprimir"
                          >
                            <Printer size={14} />
                          </button>
                          {!isViewer && account.status === 'active' && !isActionDisabledForSales(account.project_id) && (
                            <button 
                              className="btn-primary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => {
                                setPaymentForm({ payable_account_id: account.id, amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
                                setShowPaymentModal(true);
                              }}
                            >
                              <DollarSign size={14} /> Abonar
                            </button>
                          )}
                          {!isViewer && !isActionDisabledForSales(account.project_id) && (
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => {
                                setEditingAccountId(account.id);
                                setAccountForm({
                                  name: account.name, type: account.type, description: account.description || '',
                                  total_amount_usd: account.total_amount_usd.toString(),
                                  project_id: account.project_id || '', contact_info: account.contact_info || '',
                                  status: account.status
                                });
                                setShowAccountModal(true);
                              }}
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          {!isViewer && !isActionDisabledForSales(account.project_id) && (
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                              onClick={() => initiateDelete(account.id, 'account')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETALLES DE CUENTA POR PAGAR */}
      {selectedAccountForDetails && (
        <div className="modal-overlay hide-on-print" style={{ zIndex: 1000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '700px', width: '95%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', color: 'white', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={24} color="var(--primary-color)" /> Detalles de la Cuenta
                </h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <strong>Nombre:</strong> {selectedAccountForDetails.name} <br/>
                  <strong>Proyecto:</strong> {selectedAccountForDetails.project ? `${selectedAccountForDetails.project.proposal_number ? `#${selectedAccountForDetails.project.proposal_number} ` : ''}${selectedAccountForDetails.project.title}` : 'General'}
                </div>
              </div>
              <button onClick={() => setSelectedAccountForDetails(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            {(() => {
              const account = selectedAccountForDetails;
              const paid = account.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
              const total = Number(account.total_amount_usd);
              const balance = total - paid;
              const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Total Contrato</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white' }}>${formatCurrency(total)}</div>
                    </div>
                    <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.05)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Total Abonado</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--success)' }}>${formatCurrency(paid)}</div>
                    </div>
                    <div style={{ padding: '1rem', background: balance > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', border: `1px solid ${balance > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}` }}>
                      <div style={{ fontSize: '0.75rem', color: balance > 0 ? 'var(--danger)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Saldo Pendiente</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: balance > 0 ? 'var(--danger)' : 'white' }}>${formatCurrency(balance)}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '2rem' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Descripción del Contrato</h4>
                      <p style={{ margin: 0, fontSize: '0.95rem' }}>{account.description || 'Sin descripción'}</p>
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Progreso de Pago ({progress}%)</h4>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? 'var(--success)' : 'var(--primary-color)' }}></div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 1rem 0', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                      <Wallet size={18} /> Historial de Abonos
                    </h4>
                    {!account.payable_payments || account.payable_payments.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                        No hay abonos registrados para esta cuenta.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>FECHA</th>
                              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>CONCEPTO</th>
                              <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>REFERENCIA</th>
                              <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>MONTO</th>
                              {!isViewer && <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {account.payable_payments.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((p: any) => (
                              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{p.date}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{p.description}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{p.reference || '-'}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>+ ${formatCurrency(p.amount_usd)}</td>
                                {!isViewer && !isActionDisabledForSales(account.project_id) && (
                                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: 'var(--danger)', borderColor: 'transparent' }}
                                      onClick={() => { setSelectedAccountForDetails(null); initiateDelete(p.id, 'payment'); }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelectedAccountForDetails(null)}>Cerrar</button>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => handlePrintPayable(account)}>
                      <Printer size={16} /> Imprimir Vale
                    </button>
                    {!isViewer && account.status === 'active' && !isActionDisabledForSales(account.project_id) && (
                      <button 
                        className="btn-primary" 
                        style={{ flex: 1, justifyContent: 'center' }} 
                        onClick={() => {
                          setSelectedAccountForDetails(null);
                          setPaymentForm({ payable_account_id: account.id, amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
                          setShowPaymentModal(true);
                        }}
                      >
                        <DollarSign size={16} /> Abonar
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAccountModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '600px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'white' }}>{editingAccountId ? 'Editar Cuenta' : 'Nueva Cuenta por Pagar'}</h2>
              <button onClick={() => setShowAccountModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Nombre / Razón Social</label>
                  <input type="text" required className="input-field" value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} placeholder="Ej. Juan Pérez" />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Tipo</label>
                  <select className="input-field" value={accountForm.type} onChange={e => setAccountForm({...accountForm, type: e.target.value})}>
                    <option value="obrero">Obrero</option>
                    <option value="subcontratista">Subcontratista</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="alquiler">Alquiler de Equipo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto Pactado (USD)</label>
                <input type="text" required className="input-field" value={accountForm.total_amount_usd} onChange={e => setAccountForm({...accountForm, total_amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setAccountForm({...accountForm, total_amount_usd: formatOnBlur(e.target.value)})} />
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto (Opcional)</label>
                <select className="input-field" value={accountForm.project_id} onChange={e => setAccountForm({...accountForm, project_id: e.target.value})}>
                  <option value="">General (No asociado a proyecto)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción del Contrato / Acuerdo</label>
                <textarea className="input-field" rows={3} value={accountForm.description} onChange={e => setAccountForm({...accountForm, description: e.target.value})} placeholder="Detalles de lo que se va a pagar..."></textarea>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Información de Contacto (Opcional)</label>
                  <input type="text" className="input-field" value={accountForm.contact_info} onChange={e => setAccountForm({...accountForm, contact_info: e.target.value})} placeholder="Teléfono o Email" />
                </div>
                {editingAccountId && (
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Estado</label>
                    <select className="input-field" value={accountForm.status} onChange={e => setAccountForm({...accountForm, status: e.target.value})}>
                      <option value="active">Activa</option>
                      <option value="paid">Saldada</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAccountModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Abono</h2>
            <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                <input type="text" required className="input-field" value={paymentForm.amount_usd} onChange={e => setPaymentForm({...paymentForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setPaymentForm({...paymentForm, amount_usd: formatOnBlur(e.target.value)})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                <input type="text" required className="input-field" value={paymentForm.description} onChange={e => setPaymentForm({...paymentForm, description: e.target.value})} placeholder="Ej. Abono semana 1" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                  <input type="date" required className="input-field" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Referencia (Opcional)</label>
                  <input type="text" className="input-field" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})} placeholder="Nº Transacción" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Delete Auth */}
      {showAdminAuth && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%', padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                <AlertCircle size={30} color="var(--danger)" />
              </div>
              <h2 style={{ fontSize: '1.25rem', color: 'white', margin: '0 0 0.5rem 0' }}>Autorización Requerida</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Ingresa la contraseña maestra para eliminar este registro. Esta acción no se puede deshacer.</p>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <input type="password" placeholder="Contraseña de administrador" className="input-field" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConfirmDelete()} autoFocus />
              {authError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{authError}</p>}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowAdminAuth(false); setItemToDelete(null); }}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)', justifyContent: 'center' }} onClick={handleConfirmDelete} disabled={deleting}>{deleting ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
      {/* VALE DE CUENTA POR PAGAR DE IMPRESIÓN */}
      {activePrintJob === 'payable-voucher' && printPayableData && (() => {
        const account = printPayableData;
        const paid = account.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
        const total = Number(account.total_amount_usd);
        const balance = total - paid;

        return (
          <div className="show-only-on-print" style={{ display: 'none', color: 'black', background: 'white', padding: '2rem', width: '100%', maxWidth: '800px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '2rem' }}>
              <div>
                <Image src="/logo_3d.png" alt="Logo" width={150} height={60} style={{ objectFit: 'contain' }} />
                <div style={{ fontSize: '11px', color: '#555', marginTop: '0.5rem' }}>P&P Construye</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'uppercase' }}>COMPROBANTE DE CUENTA POR PAGAR</h2>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '12px', color: '#555' }}>Fecha Emisión: {new Date().toLocaleDateString('es-VE')}</p>
                <p style={{ margin: '0', fontSize: '12px', color: '#555' }}>ID: {account.id.split('-')[0].toUpperCase()}</p>
              </div>
            </div>

            <div style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '13px' }}>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px', background: '#f8f9fa' }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Proyecto:</strong> {account.project ? account.project.title : 'General'}</div>
                <div style={{ marginBottom: '0.5rem' }}><strong>Nombre:</strong> {account.name}</div>
                <div><strong>Tipo:</strong> <span style={{ textTransform: 'capitalize' }}>{account.type}</span></div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px', background: '#f8f9fa' }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Contacto:</strong> {account.contact_info || 'N/A'}</div>
                <div style={{ marginBottom: '0.5rem' }}><strong>Descripción:</strong> {account.description || 'N/A'}</div>
                <div><strong>Estado:</strong> {account.status === 'active' ? 'Activa' : account.status === 'paid' ? 'Saldada' : 'Cancelada'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem', textAlign: 'center' }}>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#555' }}>Total Contrato</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>${formatCurrency(total)}</div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#555' }}>Total Abonado</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'green' }}>${formatCurrency(paid)}</div>
              </div>
              <div style={{ padding: '1rem', border: '2px solid #000', borderRadius: '4px', background: '#eee' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#000' }}>Saldo Pendiente</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: balance > 0 ? '#d32f2f' : '#000' }}>${formatCurrency(balance)}</div>
              </div>
            </div>

            <h3 style={{ fontSize: '14px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>HISTORIAL DE ABONOS</h3>
            {(!account.payable_payments || account.payable_payments.length === 0) ? (
              <p style={{ fontSize: '12px', color: '#555', textAlign: 'center', padding: '1rem', border: '1px dashed #ccc' }}>No hay abonos registrados.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '2rem' }}>
                <thead>
                  <tr style={{ background: '#eee' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem', border: '1px solid #ccc' }}>FECHA</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', border: '1px solid #ccc' }}>CONCEPTO</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', border: '1px solid #ccc' }}>REFERENCIA</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', border: '1px solid #ccc' }}>MONTO (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {account.payable_payments.sort((a:any, b:any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.date}</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.description}</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{p.reference || '-'}</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right' }}>${formatCurrency(p.amount_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', marginTop: '5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #000', marginBottom: '0.5rem' }}></div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Preparado Por</div>
                <div style={{ fontSize: '10px', color: '#555' }}>Firma Autorizada</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #000', marginBottom: '0.5rem' }}></div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Recibido Conforme</div>
                <div style={{ fontSize: '10px', color: '#555' }}>Beneficiario / Proveedor</div>
              </div>
            </div>

            <div style={{ marginTop: '3rem', textAlign: 'center', fontSize: '10px', color: '#777' }}>
              <p>Documento generado por el Sistema Administrativo de P&P Construye</p>
            </div>
          </div>
        );
      })()}

      <style dangerouslySetInnerHTML={{ __html: `
        .show-only-on-print { display: none; }
        @media print {
          body { 
            background: white !important; 
            color: black !important; 
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
          }
          .hide-on-print, nav, header, aside, .sidebar, .top-bar { display: none !important; }
          .show-only-on-print { 
            display: block !important; 
            width: 100% !important;
            position: absolute;
            top: 0;
            left: 0;
          }
          .card { border: none !important; box-shadow: none !important; background: transparent !important; }
          @page { margin: 1cm; size: auto; }
        }
      `}} />
    </div>
  );
}
