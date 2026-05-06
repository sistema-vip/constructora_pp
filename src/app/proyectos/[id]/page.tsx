'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  Calendar,
  FileText,
  Printer,
  Users,
  ClipboardList,
  CheckCircle,
  X,
  Archive,
  Edit3
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';
import { useUser } from '@/lib/UserContext';

interface Project {
  id: string;
  title: string;
  description: string;
  status: string;
  budget_usd: number;
  start_date: string;
  end_date: string;
  proposal_number?: number;
  clients?: { name: string };
  archived_at: string | null;
}

interface Payment {
  id: string;
  amount_usd: number;
  date: string;
  reference: string;
  description: string;
}

interface Cost {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  provider?: string;
  date?: string;
}

interface ProjectExtra {
  id: string;
  description: string;
  amount_usd: number;
  created_at: string;
}

export default function ProjectDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  function handleBack() {
    const urlParams = new URLSearchParams(window.location.search);
    const from = urlParams.get('from');
    const clientId = urlParams.get('clientId');
    if (from === 'client' && clientId) {
      router.push(`/clientes/${clientId}`);
    } else {
      router.push('/proyectos');
    }
  }

  const [project, setProject] = useState<Project | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [extras, setExtras] = useState<ProjectExtra[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'payments' | 'costs' | 'details' | 'advances'>('payments');

  // Permisos
  const { role } = useUser();
  const isViewer = role === 'viewer';
  const canEdit = !isViewer;

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);


  // Forms state
  const [paymentForm, setPaymentForm] = useState({ amount_usd: '', reference: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [costForm, setCostForm] = useState({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
  const [extraForm, setExtraForm] = useState({ description: '', amount_usd: '' });
  const [advanceForm, setAdvanceForm] = useState({ partner_name: 'Henry Peraza', amount_usd: '', description: '', date: new Date().toISOString().split('T')[0] });

  // Estado para cerrar/archivar proyecto
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Estado para edición de gastos
  const [editingCost, setEditingCost] = useState<Cost | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchProjectData();
    }
  }, [projectId]);

  async function fetchProjectData() {
    setLoading(true);
    try {
      const [
        projectRes,
        paymentsRes,
        costsRes,
        extrasRes,
        advancesRes
      ] = await Promise.all([
        supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
        supabase.from('project_payments').select('*').eq('project_id', projectId).order('date', { ascending: false }),
        supabase.from('project_costs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('project_extras').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
        supabase.from('partner_advances').select('*').eq('project_id', projectId).order('date', { ascending: false })
      ]);

      if (projectRes.error) throw projectRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (costsRes.error) throw costsRes.error;
      if (extrasRes.error) throw extrasRes.error;
      if (advancesRes.error) throw advancesRes.error;

      setProject(projectRes.data);
      setPayments(paymentsRes.data || []);
      setCosts(costsRes.data || []);
      setExtras(extrasRes.data || []);
      setAdvances(advancesRes.data || []);

    } catch (error: any) {
      console.error("Error fetching data:", error);
      alert(`Error al cargar datos del proyecto: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // KPIs Calculations
  const baseBudget = project?.budget_usd || 0;
  const totalExtra = extras.reduce((sum, e) => sum + Number(e.amount_usd), 0);
  const totalAdvances = advances.reduce((sum, a) => sum + Number(a.amount_usd), 0);
  const totalBudget = Number(project?.budget_usd || 0) + totalExtra;
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount_usd), 0);
  const balanceDue = totalBudget - totalPaid;
  const totalCosts = costs.reduce((sum, c) => sum + Number(c.total_usd), 0);
  const estimatedProfit = totalBudget - totalCosts;
  const netProfit = estimatedProfit - totalAdvances;

  // Partner advances calculation
  const partnerAdvances: { [key: string]: number } = {};
  advances.forEach(a => {
    const partner = a.partner_name;
    if (!partnerAdvances[partner]) partnerAdvances[partner] = 0;
    partnerAdvances[partner] += Number(a.amount_usd);
  });
  const profitPerPartner = estimatedProfit / 2;
  const partners = ['Henry Peraza', 'Losbers Perez'];

  // Handlers
  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('project_payments').insert([{
      project_id: projectId,
      ...paymentForm,
      amount_usd: parseCurrency(paymentForm.amount_usd)
    }]);

    if (error) {
      alert(`Error al registrar pago: ${error.message}`);
    } else {
      setShowPaymentModal(false);
      setPaymentForm({ amount_usd: '', reference: '', description: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    }
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      description: costForm.description,
      provider: costForm.provider,
      category: costForm.category,
      quantity: costForm.quantity,
      unit_price_usd: parseCurrency(String(costForm.unit_price_usd)),
      total_usd: costForm.quantity * parseCurrency(String(costForm.unit_price_usd)),
      date: costForm.date
    };

    const { error } = editingCost
      ? await supabase.from('project_costs').update(data).eq('id', editingCost.id)
      : await supabase.from('project_costs').insert([{ project_id: projectId, ...data }]);

    if (error) {
      alert(`Error al guardar gasto: ${error.message}`);
    } else {
      setShowCostModal(false);
      setEditingCost(null);
      setCostForm({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    }
  }

  function openEditCost(c: Cost) {
    setEditingCost(c);
    setCostForm({
      description: c.description,
      provider: c.provider || '',
      category: c.category,
      quantity: c.quantity,
      unit_price_usd: c.unit_price_usd.toString(),
      date: c.date || new Date().toISOString().split('T')[0]
    });
    setShowCostModal(true);
  }

  async function handleDeleteCost(id: string) {
    if (!confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return;
    const { error } = await supabase.from('project_costs').delete().eq('id', id);
    if (error) alert('Error al eliminar gasto: ' + error.message);
    else fetchProjectData();
  }

  async function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('project_extras').insert([{
      project_id: projectId,
      ...extraForm,
      amount_usd: parseCurrency(extraForm.amount_usd)
    }]);

    if (error) {
      alert(`Error al registrar adicional: ${error.message}`);
    }
    if (!error) {
      setShowExtraModal(false);
      setExtraForm({ description: '', amount_usd: '' });
      fetchProjectData();
    }
  }

  async function handleAddAdvance(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('partner_advances').insert([{
      project_id: projectId,
      partner_name: advanceForm.partner_name,
      amount_usd: parseCurrency(advanceForm.amount_usd),
      description: advanceForm.description,
      date: advanceForm.date
    }]);

    if (!error) {
      setShowAdvanceModal(false);
      setAdvanceForm({ ...advanceForm, amount_usd: '', description: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    }
  }

  async function handleCloseProject() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', projectId);

      if (error) throw error;
      setShowCloseConfirm(false);
      fetchProjectData();
    } catch (error: any) {
      alert('Error al cerrar proyecto: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveProject() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) throw error;
      setShowArchiveConfirm(false);
      handleBack();
    } catch (error: any) {
      alert('Error al archivar proyecto: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="btn-secondary" style={{ padding: '0.75rem' }} disabled>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ height: '2rem', width: '200px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '0.5rem' }}></div>
            <div style={{ height: '1rem', width: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
          </div>
        </div>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }}>⏳</div>
          Cargando datos financieros del proyecto...
        </div>
      </div>
    );
  }

  if (!project) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Proyecto no encontrado.</div>;
  }

  // DEBUG
  console.log('DEBUG - project:', { status: project.status, archived_at: project.archived_at, canEdit, role });
  console.log('Button conditions - canEdit:', canEdit, 'isViewer:', isViewer, 'role:', role);

  return (
    <>
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="btn-secondary" style={{ padding: '0.75rem' }} onClick={handleBack}>
            <ArrowLeft size={20} />
          </button>

        <div>
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>{project.clients?.name || 'Sin Cliente'}</h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 500, color: 'var(--primary-color)' }}>
              {project.proposal_number ? `Propuesta #${project.proposal_number} - ` : ''}
              {project.title}
            </span>
            <span>•</span>
            <span className={`badge ${
              project.status === 'in_progress' ? 'badge-success' :
              project.status === 'completed' ? 'badge-active' : ''
            }`}>
              {project.status === 'in_progress' ? 'En Ejecución' : 'Completado'}
            </span>
            {project.archived_at && (
              <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                Archivado {new Date(project.archived_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            className="btn-secondary"
            onClick={() => router.push(`/proyectos?print=${project.id}`)}
            title="Imprimir Propuesta Original"
            style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--card-bg)' }}
          >
            <Printer size={18} /> Reimprimir Propuesta
          </button>
          {project.status === 'in_progress' && (
            <button
              className="btn-primary"
              onClick={() => setShowCloseConfirm(true)}
              title="Cerrar proyecto"
              style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--success)', borderColor: 'var(--success)' }}
            >
              <CheckCircle size={18} /> Cerrar Proyecto
            </button>
          )}
          {project.status === 'completed' && !project.archived_at && (
            <button
              className="btn-secondary"
              onClick={() => setShowArchiveConfirm(true)}
              title="Archivar proyecto"
              style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              <Archive size={18} /> Archivar
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <DollarSign size={18} /> <span>Valor Total</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>
            ${totalBudget.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>
        
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
            <TrendingUp size={18} /> <span>Total Cobrado</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success)' }}>
            ${totalPaid.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.5)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.5rem' }}>
              <TrendingUp size={16} /> <span style={{ fontWeight: 600 }}>Ganancia Neta</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white' }}>
              ${netProfit.toLocaleString('es-VE', {minimumFractionDigits:2})}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Est. ${estimatedProfit.toLocaleString('es-VE', {minimumFractionDigits:2})}
            </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
            <Wallet size={18} /> <span>Saldo Pendiente</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
            ${balanceDue.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
            <TrendingDown size={18} /> <span>Costos Totales</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--danger)' }}>
            ${totalCosts.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
          <button 
            style={{ flex: 1, padding: '1rem', background: activeTab === 'payments' ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: activeTab === 'payments' ? 'white' : 'var(--text-muted)', borderBottom: activeTab === 'payments' ? '2px solid var(--primary-color)' : 'none', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setActiveTab('payments')}
          >
            Pagos del Cliente
          </button>
          <button 
            style={{ flex: 1, padding: '1rem', background: activeTab === 'costs' ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: activeTab === 'costs' ? 'white' : 'var(--text-muted)', borderBottom: activeTab === 'costs' ? '2px solid var(--primary-color)' : 'none', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setActiveTab('costs')}
          >
            Control de Gastos
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'details' ? 'btn-primary' : ''}`}
            style={{ flex: 1, padding: '0.5rem 1rem', background: activeTab === 'details' ? 'var(--accent-blue)' : 'transparent', border: 'none', borderBottom: activeTab === 'details' ? '2px solid var(--primary-color)' : 'none', color: activeTab === 'details' ? 'white' : 'var(--text-muted)' }}
            onClick={() => setActiveTab('details')}
          >
            Detalles
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'advances' ? 'btn-primary' : ''}`}
            style={{ flex: 1, padding: '0.5rem 1rem', background: activeTab === 'advances' ? '#8b5cf6' : 'transparent', border: 'none', borderBottom: activeTab === 'advances' ? '2px solid #8b5cf6' : 'none', color: activeTab === 'advances' ? 'white' : 'var(--text-muted)' }}
            onClick={() => setActiveTab('advances')}
          >
            Retiro de Socios
          </button>
        </div>

        <div style={{ padding: '2rem' }}>
          
          {activeTab === 'payments' && (
            <div className="animate-fade">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Historial de Pagos</h3>
                <button className="btn-primary" onClick={() => setShowPaymentModal(true)}>
                  <Plus size={16} /> Registrar Pago
                </button>
              </div>
              
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>REFERENCIA</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Aún no hay pagos registrados.</td></tr>
                  ) : (
                    payments.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem' }}>{new Date(p.date).toLocaleDateString()}</td>
                        <td style={{ padding: '1rem' }}>{p.description}</td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.reference}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                          ${Number(p.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'costs' && (
            <div className="animate-fade">
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Gastos de Ejecución</h3>
                <button className="btn-primary" onClick={() => setShowCostModal(true)}>
                  <Plus size={16} /> Registrar Gasto
                </button>
              </div>
              
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>CATEGORÍA</th>
                    <th style={{ textAlign: 'center', padding: '1rem' }}>CANT.</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>P. UNITARIO</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>TOTAL</th>
                    {canEdit && <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>}
                  </tr>
                </thead>
                <tbody>
                  {costs.length === 0 ? (
                    <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Aún no hay gastos registrados.</td></tr>
                  ) : (
                    costs.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem' }}>{c.description}</td>
                        <td style={{ padding: '1rem' }}>
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{c.category}</span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>{c.quantity}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)' }}>${Number(c.unit_price_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                          ${Number(c.total_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                        {canEdit && (
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                                title="Editar gasto"
                                onClick={() => openEditCost(c)}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }}
                                title="Eliminar gasto"
                                onClick={() => handleDeleteCost(c.id)}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="animate-fade">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                  <h3 style={{ marginBottom: '1rem' }}>Propuesta Original</h3>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      {project.description || 'Sin descripción detallada.'}
                  </div>
                  <div style={{ marginTop: '1rem', fontWeight: 'bold', fontSize: '1.1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                    Presupuesto Base: ${baseBudget.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button className="btn-secondary" onClick={() => window.print()} style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Printer size={16} /> Imprimir Propuesta
                    </button>
                    <button className="btn-secondary" onClick={() => setShowAdvanceModal(true)} style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: '#8b5cf6', color: '#8b5cf6' }}>
                      <Users size={16} /> Retiro de Socio
                    </button>
                    <button className="btn-secondary" onClick={() => setShowExtraModal(true)} style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Plus size={16} /> Trabajo Adicional
                    </button>
                  </div>
                  
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>DESCRIPCIÓN</th>
                          <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>MONTO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extras.length === 0 ? (
                          <tr><td colSpan={2} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay adicionales registrados.</td></tr>
                        ) : (
                          extras.map(e => (
                            <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <td style={{ padding: '1rem' }}>{e.description}</td>
                              <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
                                + ${Number(e.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '1rem', fontWeight: 'bold', textAlign: 'right' }}>Total Adicionales:</td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
                            ${totalExtra.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* DISTRIBUCIÓN DE GANANCIAS POR SOCIO - PARA IMPRESIÓN */}
              <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Distribución de Ganancias por Socio</h3>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>SOCIO</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>GANANCIA CORRESPONDIENTE</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>RETIROS REALIZADOS</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>SALDO DISPONIBLE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partners.map((partner, idx) => {
                        const totalRetired = partnerAdvances[partner] || 0;
                        const availableBalance = profitPerPartner - totalRetired;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '1rem', fontWeight: '600' }}>{partner}</td>
                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '500', color: 'var(--success)' }}>
                              ${profitPerPartner.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '500', color: '#a78bfa' }}>
                              ${totalRetired.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: availableBalance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                              {availableBalance < 0 ? '-' : ''}${Math.abs(availableBalance).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advances' && (
            <div>
              {advances.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay retiros registrados para este proyecto.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>SOCIO</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advances.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{a.date}</td>
                          <td style={{ padding: '1rem', fontWeight: 'bold' }}>{a.partner_name}</td>
                          <td style={{ padding: '1rem' }}>{a.description || 'Sin descripción'}</td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#a78bfa' }}>${Number(a.amount_usd).toLocaleString('es-VE', {minimumFractionDigits:2})}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                       <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 'bold' }}>
                         <td colSpan={3} style={{ padding: '1rem', textAlign: 'right' }}>Total Retirado:</td>
                         <td style={{ padding: '1rem', textAlign: 'right', color: '#a78bfa' }}>${totalAdvances.toLocaleString('es-VE', {minimumFractionDigits:2})}</td>
                       </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Pago</h2>
            <form onSubmit={handleAddPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                <input 
                  type="text" 
                  required 
                  className="input-field" 
                  value={paymentForm.amount_usd} 
                  onChange={e => setPaymentForm({...paymentForm, amount_usd: handleMoneyInput(e.target.value)})} 
                  onBlur={e => setPaymentForm({...paymentForm, amount_usd: formatOnBlur(e.target.value)})}
                />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                <input type="text" required placeholder="Ej. Anticipo 50%" className="input-field" value={paymentForm.description} onChange={e => setPaymentForm({...paymentForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Referencia (Opcional)</label>
                <input type="text" className="input-field" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                <input type="date" required className="input-field" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowPaymentModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCostModal && (
         <div className="modal-overlay">
         <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
           <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>{editingCost ? 'Editar Gasto' : 'Registrar Gasto'}</h2>
           <form onSubmit={handleAddCost} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha del Gasto</label>
               <input type="date" required className="input-field" value={costForm.date} onChange={e => setCostForm({...costForm, date: e.target.value})} />
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor / Trabajador</label>
               <input type="text" required placeholder="Ej. Ferretería EPA / Juan Pérez" className="input-field" value={costForm.provider} onChange={e => setCostForm({...costForm, provider: e.target.value})} />
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
               <input type="text" required placeholder="Ej. Cemento Portland" className="input-field" value={costForm.description} onChange={e => setCostForm({...costForm, description: e.target.value})} />
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Categoría</label>
               <select className="input-field" value={costForm.category} onChange={e => setCostForm({...costForm, category: e.target.value})}>
                 <option value="materials">Materiales</option>
                 <option value="labor">Mano de Obra</option>
                 <option value="equipment">Equipos</option>
                 <option value="permits">Permisos</option>
                 <option value="other">Otros</option>
               </select>
             </div>
             <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Cantidad</label>
                  <input type="number" step="0.01" required className="input-field" value={costForm.quantity} onChange={e => setCostForm({...costForm, quantity: parseFloat(e.target.value) || 0})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Precio Unitario (USD)</label>
                  <input 
                    type="text" 
                    required 
                    className="input-field" 
                    value={costForm.unit_price_usd} 
                    onChange={e => setCostForm({...costForm, unit_price_usd: handleMoneyInput(e.target.value)})} 
                    onBlur={e => setCostForm({...costForm, unit_price_usd: formatOnBlur(e.target.value)})}
                  />
                </div>
             </div>
             <div style={{ marginTop: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                Total: ${(costForm.quantity * parseCurrency(String(costForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits:2})}
             </div>
             <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
               <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowCostModal(false); setEditingCost(null); setCostForm({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] }); }}>Cancelar</button>
               <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{editingCost ? 'Guardar Cambios' : 'Guardar Gasto'}</button>
             </div>
           </form>
         </div>
       </div>
      )}

      {showExtraModal && (
         <div className="modal-overlay">
         <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%' }}>
           <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Trabajo Adicional</h2>
           <form onSubmit={handleAddExtra} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción del Adicional</label>
               <input type="text" required placeholder="Ej. Instalación de lámparas extras" className="input-field" value={extraForm.description} onChange={e => setExtraForm({...extraForm, description: e.target.value})} />
             </div>
             <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto Extra a Cobrar (USD)</label>
                <input 
                  type="text" 
                  required 
                  className="input-field" 
                  value={extraForm.amount_usd} 
                  onChange={e => setExtraForm({...extraForm, amount_usd: handleMoneyInput(e.target.value)})} 
                  onBlur={e => setExtraForm({...extraForm, amount_usd: formatOnBlur(e.target.value)})}
                />
              </div>
             
             <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
               <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowExtraModal(false)}>Cancelar</button>
               <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Adicional</button>
             </div>
           </form>
         </div>
       </div>
      )}

      {showAdvanceModal && (
        <div className="modal-overlay hide-on-print">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Retiro de Socio</h2>
            <form onSubmit={handleAddAdvance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Socio</label>
                <select className="input-field" required value={advanceForm.partner_name} onChange={e => setAdvanceForm({...advanceForm, partner_name: e.target.value})}>
                  <option value="Henry Peraza">Henry Peraza</option>
                  <option value="Losbers Perez">Losbers Perez</option>
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                <input type="text" required className="input-field" value={advanceForm.amount_usd} onChange={e => setAdvanceForm({...advanceForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setAdvanceForm({...advanceForm, amount_usd: formatOnBlur(e.target.value)})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                <input type="text" placeholder="Ej. Retiro de utilidad" className="input-field" value={advanceForm.description} onChange={e => setAdvanceForm({...advanceForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                <input type="date" required className="input-field" value={advanceForm.date} onChange={e => setAdvanceForm({...advanceForm, date: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAdvanceModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Retiro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Archivar Proyecto */}
      {showArchiveConfirm && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              <Archive size={48} style={{ margin: '0 auto' }} />
            </div>
            <h2 style={{ marginBottom: '0.5rem', color: 'white' }}>Archivar Proyecto</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              El proyecto pasará al Historial y dejará de aparecer en las listas activas. Podrás consultarlo en cualquier momento desde la pestaña Historial. Esta acción no elimina ningún dato.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowArchiveConfirm(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleArchiveProject}
                disabled={loading}
              >
                {loading ? 'Archivando...' : 'Confirmar Archivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Cerrar Proyecto */}
      {showCloseConfirm && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%', textAlign: 'center' }}>
            <div style={{ color: 'var(--success)', marginBottom: '1.5rem' }}>
              <CheckCircle size={48} style={{ margin: '0 auto' }} />
            </div>
            <h2 style={{ marginBottom: '0.5rem', color: 'white' }}>Cerrar Proyecto</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              ¿Está seguro que desea cerrar este proyecto? Una vez cerrado, no podrá agregar más registros de pagos, gastos o compromisos.
            </p>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowCloseConfirm(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, background: 'var(--success)', borderColor: 'var(--success)', justifyContent: 'center' }}
                onClick={handleCloseProject}
                disabled={loading}
              >
                {loading ? 'Cerrando...' : 'Confirmar Cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
