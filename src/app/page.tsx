'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  TrendingUp, 
  Clock, 
  DollarSign,
  ArrowUpRight,
  Plus,
  Briefcase,
  ChevronRight,
  PieChart
} from "lucide-react";
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';
import TelegramPendingPanel from '@/components/TelegramPendingPanel';
import RecentActivityFeed from '@/components/RecentActivityFeed';
import { Activity } from 'lucide-react';

export default function Home() {
  const [stats, setStats] = useState({
    clientsCount: 0,
    activeProjectsCount: 0,
    pendingQuotesCount: 0,
    totalBalance: 0
  });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [activeProjectsList, setActiveProjectsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showClientModal, setShowClientModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Forms state
  const [newClient, setNewClient] = useState({ name: '', company_name: '', tax_id: '', phone: '', email: '', address: '' });
  const [expenseForm, setExpenseForm] = useState({ project_id: '', description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
  const [paymentForm, setPaymentForm] = useState({ project_id: '', amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const { count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      const { count: activeProjectsCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress');

      const { count: pendingQuotesCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('status', ['proposal', 'quoted']);

      const { data: accounts } = await supabase
        .from('financial_accounts')
        .select('balance');
      
      const totalBalance = accounts?.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0) || 0;

      setStats({
        clientsCount: clientsCount || 0,
        activeProjectsCount: activeProjectsCount || 0,
        pendingQuotesCount: pendingQuotesCount || 0,
        totalBalance: totalBalance
      });

      const { data: projects } = await supabase
        .from('projects')
        .select('*, clients(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentProjects(projects || []);

      const { data: activeList } = await supabase
        .from('projects')
        .select('id, title, proposal_number, clients(name)')
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false });
        
      setActiveProjectsList(activeList || []);
      
      if (activeList && activeList.length > 0) {
        setExpenseForm(prev => ({ ...prev, project_id: activeList[0].id }));
        setPaymentForm(prev => ({ ...prev, project_id: activeList[0].id }));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('clients').insert([newClient]);
    if (!error) {
      setShowClientModal(false);
      setNewClient({ name: '', company_name: '', tax_id: '', phone: '', email: '', address: '' });
      fetchDashboardData();
    } else {
      alert(`Error: ${error.message}`);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expenseForm.project_id) return alert('Seleccione un proyecto');
    
    const costData = {
      project_id: expenseForm.project_id,
      description: expenseForm.description,
      provider: expenseForm.provider,
      category: expenseForm.category,
      quantity: expenseForm.quantity,
      unit_price_usd: parseCurrency(expenseForm.unit_price_usd),
      date: expenseForm.date
    };

    const { error } = await supabase.from('project_costs').insert([costData]);
    if (!error) {
      setShowExpenseModal(false);
      setExpenseForm({ ...expenseForm, description: '', provider: '', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchDashboardData();
    } else {
      alert(`Error: ${error.message}`);
    }
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.project_id) return alert('Seleccione un proyecto');

    const paymentData = {
      project_id: paymentForm.project_id,
      amount_usd: parseCurrency(paymentForm.amount_usd),
      description: paymentForm.description,
      reference: paymentForm.reference,
      date: paymentForm.date
    };

    const { error } = await supabase.from('project_payments').insert([paymentData]);
    if (!error) {
      setShowPaymentModal(false);
      setPaymentForm({ ...paymentForm, amount_usd: '', description: '', reference: '' });
      fetchDashboardData();
    } else {
      alert(`Error: ${error.message}`);
    }
  }

  return (
    <div className="animate-fade">
      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '3rem'
      }}>
        <Link href="/clientes" prefetch={false} className="card" style={{ textDecoration: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--accent-blue)' }}>
              <Users size={24} />
            </div>
            <ArrowUpRight size={18} className="text-muted" />
          </div>
          <p className="text-muted" style={{ marginTop: '1rem' }}>Total Clientes</p>
          <h2 style={{ color: 'white', marginTop: '0.25rem', fontSize: '1.8rem' }}>
            {loading ? '...' : stats.clientsCount}
          </h2>
        </Link>

        <Link href="/proyectos" prefetch={false} className="card" style={{ textDecoration: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--primary-color)' }}>
              <TrendingUp size={24} />
            </div>
            <ArrowUpRight size={18} className="text-muted" />
          </div>
          <p className="text-muted" style={{ marginTop: '1rem' }}>Proyectos Activos</p>
          <h2 style={{ color: 'white', marginTop: '0.25rem', fontSize: '1.8rem' }}>
            {loading ? '...' : stats.activeProjectsCount}
          </h2>
        </Link>

        <Link href="/proyectos" prefetch={false} className="card" style={{ textDecoration: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--danger)' }}>
              <Clock size={24} />
            </div>
            <ArrowUpRight size={18} className="text-muted" />
          </div>
          <p className="text-muted" style={{ marginTop: '1rem' }}>Propuestas Pendientes</p>
          <h2 style={{ color: 'white', marginTop: '0.25rem', fontSize: '1.8rem' }}>
            {loading ? '...' : stats.pendingQuotesCount}
          </h2>
        </Link>

        <Link href="/administracion" prefetch={false} className="card" style={{ textDecoration: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--success)' }}>
              <PieChart size={24} />
            </div>
            <ArrowUpRight size={18} className="text-muted" />
          </div>
          <p className="text-muted" style={{ marginTop: '1rem' }}>Panel Administrativo</p>
          <h2 style={{ color: 'white', marginTop: '0.25rem', fontSize: '1.8rem' }}>
            Finanzas
          </h2>
        </Link>
      </div>

      {/* Panel de Entradas Pendientes de Telegram */}
      <TelegramPendingPanel
        projects={recentProjects.map(p => ({
          id: p.id,
          title: p.title,
          clientName: p.clients?.name || 'Cliente sin nombre'
        }))}
      />

      {/* Registros Recientes */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '0.5rem', borderRadius: '10px', color: '#8b5cf6' }}>
              <Activity size={20} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Registros Recientes</h3>
          </div>
        </div>
        <RecentActivityFeed maxItems={10} />
      </div>

      {/* Main Content Split */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <div className="card" style={{ minHeight: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Proyectos Recientes</h3>
            <Link href="/proyectos" style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'none' }}>Ver todos</Link>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loading ? (
              <p className="text-muted">Cargando proyectos...</p>
            ) : recentProjects.length === 0 ? (
              <p className="text-muted">No hay proyectos recientes para mostrar.</p>
            ) : (
              recentProjects.map((project) => (
                <div key={project.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: 'white' }}>{project.title}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{project.clients?.name || 'Cliente desconocido'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span className="badge" style={{ fontSize: '0.7rem' }}>{project.status}</span>
                    <ChevronRight size={16} className="text-muted" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Accesos Rápidos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            <button 
              className="quick-action" 
              style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', justifyContent: 'flex-start' }}
              onClick={() => setShowClientModal(true)}
            >
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '0.5rem', borderRadius: '8px', color: 'var(--accent-blue)' }}>
                <Plus size={20} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: 'white' }}>Registrar Cliente</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Añadir nuevo contacto</div>
              </div>
            </button>

            <button 
              className="quick-action" 
              style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', justifyContent: 'flex-start' }}
              onClick={() => setShowExpenseModal(true)}
            >
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '8px', color: 'var(--danger)' }}>
                <DollarSign size={20} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: 'white' }}>Registrar Gasto</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cargar compra o pago</div>
              </div>
            </button>

            <button 
              className="quick-action" 
              style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', justifyContent: 'flex-start' }}
              onClick={() => setShowPaymentModal(true)}
            >
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: '8px', color: 'var(--success)' }}>
                <Briefcase size={20} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: 'white' }}>Registrar Pago</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Abono de cliente</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showClientModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade">
            <h2 style={{ marginBottom: '1.5rem' }}>Registrar Nuevo Cliente</h2>
            <form onSubmit={handleAddClient} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Nombre Completo</label>
                <input required type="text" className="input-field" value={newClient.name} onChange={(e) => setNewClient({...newClient, name: e.target.value})} />
              </div>
              <div>
                <label>Empresa</label>
                <input type="text" className="input-field" value={newClient.company_name} onChange={(e) => setNewClient({...newClient, company_name: e.target.value})} />
              </div>
              <div>
                <label>RIF / CI</label>
                <input type="text" className="input-field" value={newClient.tax_id} onChange={(e) => setNewClient({...newClient, tax_id: e.target.value})} />
              </div>
              <div>
                <label>Teléfono</label>
                <input type="text" className="input-field" value={newClient.phone} onChange={(e) => setNewClient({...newClient, phone: e.target.value})} />
              </div>
              <div>
                <label>Email</label>
                <input type="email" className="input-field" value={newClient.email} onChange={(e) => setNewClient({...newClient, email: e.target.value})} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Dirección</label>
                <textarea className="input-field" style={{ minHeight: '80px', resize: 'vertical' }} value={newClient.address} onChange={(e) => setNewClient({...newClient, address: e.target.value})}></textarea>
              </div>
              
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Guardar Cliente</button>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowClientModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExpenseModal && (
         <div className="modal-overlay">
         <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
           <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Gasto</h2>
           <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto Destino</label>
               <select className="input-field" required value={expenseForm.project_id} onChange={e => setExpenseForm({...expenseForm, project_id: e.target.value})}>
                 {activeProjectsList.length === 0 && <option value="">No hay proyectos activos</option>}
                 {activeProjectsList.map(p => (
                   <option key={p.id} value={p.id}>
                     {p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title} ({p.clients?.name})
                   </option>
                 ))}
               </select>
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha del Gasto</label>
               <input type="date" required className="input-field" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor / Trabajador</label>
               <input type="text" required placeholder="Ej. Ferretería EPA / Juan Pérez" className="input-field" value={expenseForm.provider} onChange={e => setExpenseForm({...expenseForm, provider: e.target.value})} />
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
               <input type="text" required placeholder="Ej. Cemento Portland" className="input-field" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} />
             </div>
             <div>
               <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Categoría</label>
               <select className="input-field" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}>
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
                  <input type="number" step="0.01" required className="input-field" value={expenseForm.quantity} onChange={e => setExpenseForm({...expenseForm, quantity: parseFloat(e.target.value) || 0})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Precio Unitario (USD)</label>
                  <input 
                    type="text" 
                    required 
                    className="input-field" 
                    value={expenseForm.unit_price_usd} 
                    onChange={e => setExpenseForm({...expenseForm, unit_price_usd: handleMoneyInput(e.target.value)})} 
                    onBlur={e => setExpenseForm({...expenseForm, unit_price_usd: formatOnBlur(e.target.value)})}
                  />
                </div>
             </div>
             <div style={{ marginTop: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                Total: ${(expenseForm.quantity * parseCurrency(String(expenseForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
             </div>
             <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
               <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowExpenseModal(false)}>Cancelar</button>
               <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Gasto</button>
             </div>
           </form>
         </div>
       </div>
      )}

      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Pago</h2>
            <form onSubmit={handleAddPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto (Origen del Pago)</label>
                <select className="input-field" required value={paymentForm.project_id} onChange={e => setPaymentForm({...paymentForm, project_id: e.target.value})}>
                  {activeProjectsList.length === 0 && <option value="">No hay proyectos activos</option>}
                  {activeProjectsList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title} ({p.clients?.name})
                    </option>
                  ))}
                </select>
              </div>
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

    </div>
  );
}
