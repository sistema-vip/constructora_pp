'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';
import { useAdminAction } from '@/lib/useAdminAction';
import {
  TrendingUp,
  TrendingDown,
  Briefcase,
  PieChart,
  Wallet,
  Activity,
  FileText,
  Save,
  CheckCircle2,
  Users,
  ShieldCheck,
  User,
  RefreshCcw,
  AlertCircle,
  UserPlus,
  X,
  Eye,
  Lock,
  Bell,
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  Trash2,
  Send
} from 'lucide-react';

interface ProjectAdmin {
  id: string;
  title: string;
  status: string;
  budget_usd: number;
  proposal_number?: number;
  clients: { name: string };
  project_payments: { amount_usd: number }[];
  project_costs: { quantity: number; unit_price_usd: number }[];
  project_extras: { amount_usd: number }[];
  archived_at: string | null;
}

interface PartnerSummary {
  name: string;
  totalProfit: number;
  totalAdvances: number;
  availableBalance: number;
}

export default function AdministracionDashboard() {
  const { canCreate, canEdit, canDelete, isObserver } = useAdminAction();
  const [projects, setProjects] = useState<ProjectAdmin[]>([]);
  const [partnerSummaries, setPartnerSummaries] = useState<PartnerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Notas Globales
  const [globalNotes, setGlobalNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'finanzas' | 'usuarios'>('finanzas');
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createUserSuccess, setCreateUserSuccess] = useState(false);

  // Access requests state
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [approveRole, setApproveRole] = useState<'viewer' | 'admin' | 'sales'>('viewer');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteUser(userId: string, userName: string) {
    if (userId === currentUser?.id) {
      alert("No puedes eliminar tu propia cuenta.");
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario "${userName}"? Esta acción no se puede deshacer y el usuario perderá el acceso de inmediato.`)) {
      return;
    }

    setDeletingId(userId);
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      
      alert("Usuario eliminado correctamente.");
      await fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      alert(`Error al eliminar usuario: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  const pendingCount = accessRequests.filter(r => r.status === 'pending').length;

  useEffect(() => {
    fetchAdminData();
    fetchGlobalNotes();
    fetchUsers();
    fetchCurrentUser();
    fetchAccessRequests();
  }, []);

  async function fetchCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setCurrentUser(session.user);
  }

  async function fetchAccessRequests() {
    setLoadingRequests(true);
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      setAccessRequests(data || []);
    } catch (err) {
      console.error('Error fetching access requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleApproveRequest() {
    if (!selectedRequest) return;
    setApprovingId(selectedRequest.id);
    setApproveError(null);
    try {
      const res = await fetch('/api/admin/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: selectedRequest.id, role: approveRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setTempPassword(json.tempPassword || null);
      await fetchAccessRequests();
      await fetchUsers();
    } catch (err: any) {
      setApproveError(err.message);
    } finally {
      setApprovingId(null);
    }
  }

  async function handleRejectRequest(requestId: string) {
    if (!confirm('¿Rechazar esta solicitud de acceso?')) return;
    setRejectingId(requestId);
    try {
      const res = await fetch('/api/admin/reject-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      await fetchAccessRequests();
    } catch (err: any) {
      alert('Error al rechazar: ' + err.message);
    } finally {
      setRejectingId(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    });
  }

  async function fetchUsers() {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('❌ Error fetching users:', error.message, error.details);
        alert(`Error al cargar usuarios:\n${error.message}\n\n${error.details || ''}`);
        throw error;
      }
      console.log(`✅ Users loaded: ${data?.length || 0}`);
      setUsers(data || []);
    } catch (error) {
      console.error('Fetch users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleToggleRole(userId: string, currentRole: string) {
    if (!canEdit) {
      alert('❌ Solo administradores pueden cambiar roles de usuarios');
      return;
    }
    const newRole = currentRole === 'admin' ? 'viewer' : currentRole === 'viewer' ? 'sales' : 'admin';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) throw error;
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error: any) {
      alert('Error al cambiar rol: ' + error.message);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();

    if (!canCreate) {
      alert('❌ Solo administradores pueden crear usuarios');
      return;
    }

    setCreatingUser(true);
    setCreateUserError(null);
    setCreateUserSuccess(false);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newUserEmail, password: newUserPassword, name: newUserName, role: 'viewer' }),
      });
      const json = await res.json();
      console.log('Create user response:', res.status, json);
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setCreateUserSuccess(true);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      await fetchUsers();
      setTimeout(() => { setShowCreateUser(false); setCreateUserSuccess(false); }, 1500);
    } catch (err: any) {
      console.error('Create user error:', err);
      setCreateUserError(err.message);
    } finally {
      setCreatingUser(false);
    }
  }

  async function fetchAdminData() {
    try {
      const [projectsRes, advancesRes] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            id, title, status, budget_usd, proposal_number,
            clients(name),
            project_payments(amount_usd),
            project_costs(quantity, unit_price_usd),
            project_extras(amount_usd)
          `)
          .in('status', ['in_progress', 'completed'])
          .is('archived_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('partner_advances')
          .select('partner_name, amount_usd, project_id')
      ]);

      if (projectsRes.error) {
        console.error('❌ Error fetching admin data:', projectsRes.error.message, projectsRes.error.details);
        alert(`Error al cargar datos de administración:\n${projectsRes.error.message}`);
        throw projectsRes.error;
      }
      if (advancesRes.error) throw advancesRes.error;

      console.log(`✅ Admin data loaded: ${projectsRes.data?.length || 0} projects`);
      setProjects(projectsRes.data as any);

      // Calculate partner summaries
      const projectsData = projectsRes.data || [];
      const advancesData = advancesRes.data || [];

      // Calculate total profit per project and gather advances by partner
      const advancesByPartner: { [key: string]: number } = {};
      let totalProjectProfit = 0;

      projectsData.forEach(p => {
        const extras = p.project_extras?.reduce((acc, e) => acc + Number(e.amount_usd), 0) || 0;
        const totalBudget = Number(p.budget_usd) + extras;
        const totalCosts = p.project_costs?.reduce((acc, cost) => acc + (Number(cost.quantity) * Number(cost.unit_price_usd)), 0) || 0;
        const profit = totalBudget - totalCosts;
        totalProjectProfit += profit;
      });

      // Group advances by partner
      advancesData.forEach(a => {
        const partner = a.partner_name;
        if (!advancesByPartner[partner]) advancesByPartner[partner] = 0;
        advancesByPartner[partner] += Number(a.amount_usd);
      });

      // Calculate partner summaries (assuming equal distribution of profits)
      const partners = ['Henry Peraza', 'Losbers Perez'];
      const profitPerPartner = totalProjectProfit / 2;

      const summaries: PartnerSummary[] = partners.map(partner => ({
        name: partner,
        totalProfit: profitPerPartner,
        totalAdvances: advancesByPartner[partner] || 0,
        availableBalance: profitPerPartner - (advancesByPartner[partner] || 0)
      }));

      setPartnerSummaries(summaries);
    } catch (error) {
      console.error('Admin fetch error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGlobalNotes() {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('setting_value')
        .eq('setting_key', 'admin_notes')
        .single();
      
      if (data && data.setting_value) {
        setGlobalNotes(data.setting_value.text || '');
      }
    } catch (error: any) {
      // Ignorar error si no existe la fila aún
      if (error.code !== 'PGRST116') {
        console.error('Error fetching global notes:', error);
      }
    }
  }

  async function handleRenumberProjects() {
    if (!confirm('¿Asignar números secuenciales a todos los proyectos que no tienen número? Esto ordenará por fecha de creación.')) return;
    try {
      // Obtener todos los proyectos ordenados por fecha, con o sin número
      const { data: allProjects, error } = await supabase
        .from('projects')
        .select('id, proposal_number, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Determinar el máximo actual
      const maxExisting = allProjects
        ?.filter(p => p.proposal_number != null)
        .reduce((max, p) => Math.max(max, p.proposal_number), 0) || 0;

      // Proyectos sin número, en orden cronológico
      const unnumbered = allProjects?.filter(p => p.proposal_number == null) || [];
      if (unnumbered.length === 0) {
        alert('Todos los proyectos ya tienen número asignado.');
        return;
      }

      let counter = maxExisting + 1;
      for (const p of unnumbered) {
        await supabase.from('projects').update({ proposal_number: counter }).eq('id', p.id);
        counter++;
      }

      alert(`✅ Se numeraron ${unnumbered.length} proyecto(s) correctamente.`);
      fetchAdminData();
    } catch (e: any) {
      alert(`Error al numerar: ${e.message}`);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const { error } = await supabase
        .from('global_settings')
        .upsert({ 
          setting_key: 'admin_notes', 
          setting_value: { text: globalNotes } 
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Error al guardar las notas');
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem auto' }}>⏳</div>
        Cargando módulo de administración financiera...
      </div>
    );
  }

  // --- FINANCIAL CALCULATIONS ---
  // Total Contratado (Presupuesto Base + Extras)
  const totalContracted = projects.reduce((sum, p) => {
    const extras = p.project_extras?.reduce((acc, e) => acc + Number(e.amount_usd), 0) || 0;
    return sum + Number(p.budget_usd) + extras;
  }, 0);

  // Total Abonado (Ingresos)
  const totalIncome = projects.reduce((sum, p) => 
    sum + (p.project_payments?.reduce((acc, pay) => acc + Number(pay.amount_usd), 0) || 0)
  , 0);

  // Saldo Pendiente
  const receivables = totalContracted - totalIncome;

  // Egresos Ejecutados
  const totalExpenses = projects.reduce((sum, p) => 
    sum + (p.project_costs?.reduce((acc, cost) => acc + (Number(cost.quantity) * Number(cost.unit_price_usd)), 0) || 0)
  , 0);

  // Análisis de Presupuesto y Ganancias
  const estimatedProfit = totalContracted - totalExpenses;
  const estimatedMargin = totalContracted > 0 ? (estimatedProfit / totalContracted) * 100 : 0;

  // Rentabilidad Actual (Caja real)
  const grossProfit = totalIncome - totalExpenses;

  return (
    <>
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <PieChart size={32} color="var(--primary-color)" />
            Dashboard Administrativo
          </h1>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>
            Estado de Cuentas Global y Análisis de Rentabilidad
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={handleRenumberProjects}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem 1rem' }}
          title="Asigna números a proyectos que no tienen, ordenado por fecha de creación"
        >
          <RefreshCcw size={14} /> Numerar proyectos sin #
        </button>
      </div>

      {/* TAB SELECTOR */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
        <button 
          onClick={() => setActiveTab('finanzas')}
          style={{ 
            padding: '1rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'finanzas' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'finanzas' ? 'var(--primary-color)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <PieChart size={18} /> Finanzas Globales
        </button>
        <button 
          onClick={() => setActiveTab('usuarios')}
          style={{ 
            padding: '1rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'usuarios' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'usuarios' ? 'var(--primary-color)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            position: 'relative'
          }}
        >
          <Users size={18} /> Gestión de Usuarios
          {pendingCount > 0 && (
            <span style={{
              background: 'var(--primary-color)',
              color: '#000',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '1px 7px',
              minWidth: '20px',
              textAlign: 'center',
              lineHeight: '18px',
              marginLeft: '0.5rem'
            }}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'finanzas' ? (
        <>
      {/* FLUJO DE CONTRATOS Y COBRANZAS */}
      <h3 style={{ fontSize: '1.2rem', margin: '0 0 -1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
        <Wallet size={20} /> Resumen de Contratación y Cobranzas
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        
        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(56,189,248,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(56,189,248,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-blue)', marginBottom: '0.5rem' }}>
            <Briefcase size={18} /> <span style={{ fontWeight: 600 }}>Total Contratado</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'white' }}>
            ${formatCurrency(totalContracted)}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Presupuestos base + extras aprobados
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.5rem' }}>
            <TrendingUp size={18} /> <span style={{ fontWeight: 600 }}>Total Abonado</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'white' }}>
            ${formatCurrency(totalIncome)}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Dinero real ingresado en caja
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.5rem' }}>
            <Activity size={18} /> <span style={{ fontWeight: 600 }}>Saldo Pendiente</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'white' }}>
            ${formatCurrency(receivables)}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Cuentas por cobrar a clientes
          </div>
        </div>
      </div>

      {/* ANÁLISIS DE PRESUPUESTO Y GANANCIAS */}
      <h3 style={{ fontSize: '1.2rem', margin: '1rem 0 -1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
        <TrendingUp size={20} /> Análisis de Presupuesto y Ganancias
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        
        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(239,68,68,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>
            <TrendingDown size={18} /> <span style={{ fontWeight: 600 }}>Egresos Ejecutados</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'white' }}>
            ${formatCurrency(totalExpenses)}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Materiales, nómina, equipos
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.5)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', opacity: 0.1 }}>
            <PieChart size={100} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.5rem', position: 'relative', zIndex: 1 }}>
            <TrendingUp size={18} /> <span style={{ fontWeight: 600 }}>Ganancia Estimada</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'white', position: 'relative', zIndex: 1 }}>
            ${formatCurrency(estimatedProfit)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', position: 'relative', zIndex: 1 }}>
             <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Proyección (Contratado - Gastos)</div>
             <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
               {estimatedMargin.toFixed(2)}% Margen Estimado
             </span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <Wallet size={18} /> <span style={{ fontWeight: 600 }}>Rentabilidad Actual (Caja)</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'white' }}>
            ${formatCurrency(grossProfit)}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Efectivo real: Abonado - Ejecutado
          </div>
        </div>

      </div>

      {/* DISTRIBUCIÓN DE GANANCIAS POR SOCIO */}
      <h3 style={{ fontSize: '1.2rem', margin: '1rem 0 -1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
        <Users size={20} /> Distribución de Ganancias por Socio
      </h3>
      <div className="card" style={{ padding: '1.5rem', overflow: 'hidden' }}>
        {partnerSummaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No hay datos de socios disponibles.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem 1.5rem' }}>SOCIO</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>GANANCIA CORRESPONDIENTE</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>RETIROS REALIZADOS</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>SALDO DISPONIBLE</th>
                </tr>
              </thead>
              <tbody>
                {partnerSummaries.map((partner, idx) => {
                  const isNegative = partner.availableBalance < 0;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="hover-row">
                      <td style={{ padding: '1.25rem 1.5rem', fontWeight: '600', color: 'white' }}>
                        {partner.name}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', fontWeight: '500', color: 'var(--success)' }}>
                        ${formatCurrency(partner.totalProfit)}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', fontWeight: '500', color: '#a78bfa' }}>
                        ${formatCurrency(partner.totalAdvances)}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', color: isNegative ? 'var(--danger)' : 'var(--success)', fontSize: '1.1rem' }}>
                          {isNegative ? '-' : ''}${formatCurrency(Math.abs(partner.availableBalance))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NOTAS GLOBALES & TABLA */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* BLOC DE NOTAS GLOBALES */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <FileText size={18} className="text-muted" /> Notas Globales
            </h3>
            {notesSaved && <span style={{ color: 'var(--success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle2 size={14} /> Guardado</span>}
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            Escribe aquí recordatorios generales, pendientes de cobro, pagos a recibir o tareas administrativas.
          </p>
          <textarea 
            className="input-field"
            style={{ flex: 1, resize: 'none', minHeight: '300px', fontFamily: 'inherit', lineHeight: '1.5' }}
            placeholder="Ej:&#10;- Falta cobrar $500 del proyecto X.&#10;- Recibir material el jueves.&#10;- Revisar cotización Y."
            value={globalNotes}
            onChange={(e) => setGlobalNotes(e.target.value)}
          />
          <button 
            className="btn-primary" 
            style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
            onClick={handleSaveNotes}
            disabled={savingNotes}
          >
            {savingNotes ? 'Guardando...' : <><Save size={18} /> Guardar Notas</>}
          </button>
        </div>

        {/* TABLA DE EJECUCIÓN DE PROYECTOS */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', height: '100%' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Briefcase size={18} className="text-muted" /> Desglose por Proyecto
            </h2>
          </div>

          {projects.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay proyectos en ejecución registrados.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem' }}>PROYECTO</th>
                    <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>PPT. CONTRATADO</th>
                    <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>EGRESOS EJECUTADOS</th>
                    <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>GANANCIA ESTIMADA</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => {
                    const extras = p.project_extras?.reduce((acc, e) => acc + Number(e.amount_usd), 0) || 0;
                    const pptFinal = Number(p.budget_usd) + extras;
                    const egresos = p.project_costs?.reduce((acc, cost) => acc + (Number(cost.quantity) * Number(cost.unit_price_usd)), 0) || 0;
                    const rentabilidadEst = pptFinal - egresos;
                    const isLossEst = rentabilidadEst < 0;

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="hover-row">
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{ fontWeight: '600', color: 'white', marginBottom: '0.2rem' }}>
                            {p.proposal_number ? <span style={{ color: 'var(--primary-color)', marginRight: '0.5rem' }}>#{p.proposal_number}</span> : null}
                            {p.title}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Cliente: {p.clients?.name}
                          </div>
                        </td>
                        
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', fontWeight: '500' }}>
                          ${formatCurrency(pptFinal)}
                        </td>
                        
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', color: 'var(--danger)' }}>
                          ${formatCurrency(egresos)}
                        </td>
                        
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                          <div style={{ fontWeight: 'bold', color: isLossEst ? 'var(--danger)' : 'var(--success)', fontSize: '1.1rem' }}>
                            {isLossEst ? '-' : ''}${formatCurrency(Math.abs(rentabilidadEst))}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Margen: {pptFinal > 0 ? ((rentabilidadEst / pptFinal) * 100).toFixed(2) : '0.00'}%
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </>
      ) : activeTab === 'usuarios' ? (
        <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* ── SECCIÓN: SOLICITUDES DE ACCESO ── */}
          <div className="card" style={{ padding: '0', overflow: 'hidden', borderLeft: pendingCount > 0 ? '4px solid var(--primary-color)' : '1px solid var(--border-color)' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ClipboardList size={20} color="var(--primary-color)" /> Solicitudes de Acceso
                  {pendingCount > 0 && <span className="badge" style={{ background: 'var(--primary-color)', color: '#000', fontSize: '0.7rem' }}>{pendingCount} PENDIENTES</span>}
                </h2>
                <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                  Usuarios que han solicitado unirse a la plataforma.
                </p>
              </div>
              <button className="btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={fetchAccessRequests}>
                <RefreshCcw size={16} className={loadingRequests ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingRequests ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando solicitudes...</div>
            ) : accessRequests.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: '1rem', display: 'block', margin: '0 auto 1rem' }} />
                No hay solicitudes de acceso registradas.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem 1.5rem' }}>SOLICITANTE</th>
                      <th style={{ textAlign: 'left', padding: '1rem 1.5rem' }}>MENSAJE</th>
                      <th style={{ textAlign: 'center', padding: '1rem 1.5rem' }}>ESTADO</th>
                      <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessRequests.map(req => (
                      <tr key={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{ fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <User size={15} style={{ opacity: 0.5 }} /> {req.name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{req.email}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Clock size={11} /> {new Date(req.requested_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', maxWidth: '260px' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: req.message ? 'normal' : 'italic' }}>
                            {req.message || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center' }}>
                          {req.status === 'pending' && (
                            <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Clock size={12} /> Pendiente
                            </span>
                          )}
                          {req.status === 'approved' && (
                            <span className="badge badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <CheckCircle size={12} /> Aprobado
                            </span>
                          )}
                          {req.status === 'rejected' && (
                            <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <XCircle size={12} /> Rechazado
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                          {req.status === 'pending' && canCreate && (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                className="btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: 'rgba(239,68,68,0.3)', color: 'var(--danger)' }}
                                onClick={() => handleRejectRequest(req.id)}
                                disabled={rejectingId === req.id}
                              >
                                {rejectingId === req.id ? '...' : <><XCircle size={14} /> Rechazar</>}
                              </button>
                              <button
                                className="btn-primary"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}
                                onClick={() => { setSelectedRequest(req); setApproveRole('viewer'); setTempPassword(null); setApproveError(null); setShowApproveModal(true); }}
                              >
                                <CheckCircle size={14} /> Aprobar
                              </button>
                            </div>
                          )}
                          {req.status !== 'pending' && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('es-VE') : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── SECCIÓN: USUARIOS REGISTRADOS ── */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={20} color="var(--primary-color)" /> Usuarios del Sistema
                </h2>
                <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                  Gestiona los roles y el acceso de los usuarios activos.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={fetchUsers}>
                  <RefreshCcw size={16} className={loadingUsers ? 'animate-spin' : ''} />
                </button>
                {canCreate ? (
                  <button className="btn-primary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }} onClick={() => setShowCreateUser(true)}>
                    <UserPlus size={16} /> Crear Usuario
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                    <Lock size={14} /> Solo admin
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '1.5rem', background: 'rgba(245,158,11,0.05)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <AlertCircle size={20} color="var(--primary-color)" />
              <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', flex: 1 }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Observador (Viewer):</strong> Acceso de solo lectura a todos los módulos.</div>
                <div style={{ marginBottom: '0.5rem' }}><strong>Ventas / Cliente (Sales):</strong> Puede crear propuestas, pero requiere clave para editarlas. Solo lectura en finanzas.</div>
                <div><strong>Administrador (Admin):</strong> Acceso total y control sobre el sistema.</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '1rem 1.5rem' }}>USUARIO</th>
                    <th style={{ textAlign: 'center', padding: '1rem 1.5rem' }}>ROL ACTUAL</th>
                    <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ fontWeight: '600', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <User size={16} className="text-muted" /> {u.name || 'Usuario sin nombre'}
                          {currentUser?.id === u.id && <span className="badge" style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--accent-blue)', fontSize: '0.65rem' }}>TÚ</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>ID: {u.id}</div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center' }}>
                        <span className={`badge ${u.role === 'admin' ? 'badge-active' : u.role === 'sales' ? 'badge-warning' : 'badge-pending'}`} style={{ minWidth: '100px', textAlign: 'center' }}>
                          {u.role === 'admin' ? 'Administrador' : u.role === 'sales' ? 'Ventas' : 'Observador'}
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {canEdit && (
                            <button
                                className="btn-secondary"
                                style={{
                                  fontSize: '0.8rem',
                                  padding: '0.4rem 0.8rem',
                                  borderColor: u.role === 'admin' ? 'rgba(239, 68, 68, 0.2)' : u.role === 'viewer' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                  color: u.role === 'admin' ? 'var(--danger)' : u.role === 'viewer' ? 'var(--primary-color)' : 'var(--success)'
                                }}
                                onClick={() => handleToggleRole(u.id, u.role)}
                                disabled={currentUser?.id === u.id}
                              >
                                {u.role === 'admin' ? 'Degradar a Observador' : u.role === 'viewer' ? 'Promover a Ventas' : 'Promover a Admin'}
                              </button>
                          )}
                          {canDelete && (
                            <button
                              className="btn-secondary"
                              style={{
                                padding: '0.4rem 0.5rem',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                color: 'var(--danger)',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              disabled={currentUser?.id === u.id || deletingId === u.id}
                              title="Eliminar usuario"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>

    {/* MODAL: APROBAR SOLICITUD */}
    {showApproveModal && selectedRequest && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <div className="card animate-fade" style={{ width: '100%', maxWidth: '460px', padding: '2rem', position: 'relative' }}>
          <button onClick={() => { setShowApproveModal(false); setTempPassword(null); setApproveError(null); }} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>

          {!tempPassword ? (
            <>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={20} color="var(--success)" /> Aprobar Solicitud
              </h2>
              <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0 0 1.5rem 0' }}>
                Se creará la cuenta para <strong style={{ color: 'white' }}>{selectedRequest.name}</strong> ({selectedRequest.email}).
              </p>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Rol a asignar</label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setApproveRole('viewer')}
                    style={{ flex: 1, padding: '0.85rem', borderRadius: '8px', border: `2px solid ${approveRole === 'viewer' ? 'var(--success)' : 'var(--border-color)'}`, background: approveRole === 'viewer' ? 'rgba(16,185,129,0.08)' : 'transparent', color: approveRole === 'viewer' ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    <Eye size={16} /> Observador
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproveRole('sales')}
                    style={{ flex: 1, padding: '0.85rem', borderRadius: '8px', border: `2px solid ${approveRole === 'sales' ? 'var(--accent-blue)' : 'var(--border-color)'}`, background: approveRole === 'sales' ? 'rgba(56, 189, 248, 0.08)' : 'transparent', color: approveRole === 'sales' ? 'var(--accent-blue)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    <ClipboardList size={16} /> Ventas
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproveRole('admin')}
                    style={{ flex: 1, padding: '0.85rem', borderRadius: '8px', border: `2px solid ${approveRole === 'admin' ? 'var(--primary-color)' : 'var(--border-color)'}`, background: approveRole === 'admin' ? 'rgba(245,158,11,0.08)' : 'transparent', color: approveRole === 'admin' ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    <ShieldCheck size={16} /> Admin
                  </button>
                </div>
              </div>

              {approveError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {approveError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowApproveModal(false); setApproveError(null); }}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleApproveRequest} disabled={!!approvingId}>
                  {approvingId ? 'Creando cuenta...' : <><CheckCircle size={16} /> Confirmar Aprobación</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '2px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <CheckCircle2 size={32} color="var(--success)" />
                </div>
                <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0' }}>¡Cuenta creada!</h2>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  La cuenta de <strong style={{ color: 'white' }}>{selectedRequest.name}</strong> fue activada con rol <strong style={{ color: approveRole === 'admin' ? 'var(--primary-color)' : approveRole === 'sales' ? 'var(--accent-blue)' : 'var(--success)' }}>{approveRole === 'admin' ? 'Administrador' : approveRole === 'sales' ? 'Ventas' : 'Observador'}</strong>.
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                  Contraseña temporal — compártela con el usuario:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'white', fontWeight: 600 }}>
                    {tempPassword}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.85rem', flexShrink: 0 }}
                    onClick={() => copyToClipboard(tempPassword!)}
                    title="Copiar contraseña"
                  >
                    {copiedPassword ? <CheckCircle2 size={18} color="var(--success)" /> : <Copy size={18} />}
                  </button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  ⚠️ Esta contraseña no volverá a mostrarse. Cópiala y envíala al usuario por WhatsApp o email.
                </p>
              </div>

              <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setShowApproveModal(false); setTempPassword(null); }}>
                Entendido, ya la copié
              </button>
            </>
          )}
        </div>
      </div>
    )}

    {/* MODAL: CREAR USUARIO */}
    {showCreateUser && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <div className="card animate-fade" style={{ width: '100%', maxWidth: '440px', padding: '2rem', position: 'relative' }}>
          <button onClick={() => setShowCreateUser(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>

          <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={20} color="var(--primary-color)" /> Crear Usuario Observador
          </h2>
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0 0 1.5rem 0' }}>
            El usuario podrá ver todo el sistema pero no podrá crear, editar ni eliminar datos.
          </p>

          <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Eye size={16} color="var(--success)" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>Rol asignado automáticamente: <strong style={{ color: 'var(--success)' }}>Observador (Viewer)</strong></span>
          </div>

          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem' }}>Nombre completo</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  required
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="Ej: María García"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem' }}>Correo electrónico</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  required
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="usuario@empresa.com"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem' }}>Contraseña temporal</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="Mínimo 6 caracteres"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                />
              </div>
            </div>

            {createUserError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                {createUserError}
              </div>
            )}
            {createUserSuccess && (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success)', color: 'var(--success)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} /> Usuario creado exitosamente.
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowCreateUser(false); setCreateUserError(null); setCreateUserSuccess(false); }}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={creatingUser}>
                {creatingUser ? 'Creando...' : <><UserPlus size={16} /> Crear Usuario</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
