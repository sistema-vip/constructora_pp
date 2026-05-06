'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  DollarSign, 
  TrendingUp, 
  Briefcase,
  FileText,
  Clock,
  CheckCircle,
  Phone,
  Mail,
  MapPin,
  Building,
  Printer,
  Plus,
  DollarSign as DollarIcon,
  Briefcase as BriefcaseIcon,
  Save,
  CheckCircle2,
  TrendingDown,
  PieChart,
  Activity,
  AlertCircle,
  ClipboardList,
  Users,
  PlusCircle,
  Trash2,
  Edit3,
  X,
  Sparkles,
  Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';
import NewProposalModal from '@/components/NewProposalModal';
import { useUser } from '@/lib/UserContext';

interface Client {
  id: string;
  name: string;
  company_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  created_at: string;
  notes: string | null;
}

interface Project {
  id: string;
  title: string;
  description?: string;
  status: string;
  budget_usd: number;
  proposal_number?: number;
  created_at: string;
  project_payments: any[];
  project_costs: any[];
  project_extras: any[];
  project_commitments: any[];
  partner_advances: any[];
}

export default function ClienteDashboard() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Ajustes del cliente (Notas)
  const [clientNotes, setClientNotes] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Estados para Eliminación Protegida
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'project' | 'payment' | 'cost' | 'extra' | 'commitment' | 'advance' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: '', budget_usd: '', description: '' });
  const [aiRefinement, setAiRefinement] = useState('');
  const [refining, setRefining] = useState(false);
  const { role } = useUser();
  const isViewer = role === 'viewer';
  
  // Tabs State
  const [activeTab, setActiveTab] = useState<'proyectos' | 'pagos' | 'gastos' | 'adicionales' | 'compromisos' | 'retiros' | 'propuestas'>('proyectos');

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [showCommitmentModal, setShowCommitmentModal] = useState(false);

  // Forms state
  const [paymentForm, setPaymentForm] = useState({ project_id: '', amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
  const [costForm, setCostForm] = useState({ project_id: '', description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
  const [extraForm, setExtraForm] = useState({ project_id: '', description: '', amount_usd: '' });
  const [commitmentForm, setCommitmentForm] = useState({ project_id: '', description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ project_id: '', partner_name: 'Henry Peraza', amount_usd: '', description: '', date: new Date().toISOString().split('T')[0] });

  // Estados para edición de items
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editItemType, setEditItemType] = useState<'payment' | 'cost' | 'commitment' | null>(null);
  const [editItemForm, setEditItemForm] = useState<any>({});

  // Estado del modal de selección de impresión
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
    
    // Escuchar el evento global de propuesta guardada desde Pepe
    const handleProposalSaved = () => fetchClientData();
    window.addEventListener('proposalSaved', handleProposalSaved);
    return () => window.removeEventListener('proposalSaved', handleProposalSaved);
  }, [clientId]);

  async function fetchClientData() {
    setLoading(true);
    try {
      // 1. Obtener datos del cliente
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError) throw clientError;
      setClient(clientData);
      setClientNotes(clientData.notes || '');

      // 2. Obtener proyectos y sus detalles relacionados
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*, project_payments(*), project_costs(*), project_extras(*), project_commitments(*), partner_advances(*)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);
      
      if (projectsData && projectsData.length > 0) {
        const firstActive = projectsData.find(p => p.status === 'in_progress' || p.status === 'completed');
        if (firstActive) {
          const pid = firstActive.id;
          setPaymentForm(prev => ({ ...prev, project_id: pid }));
          setCostForm(prev => ({ ...prev, project_id: pid }));
          setExtraForm(prev => ({ ...prev, project_id: pid }));
          setCommitmentForm(prev => ({ ...prev, project_id: pid }));
          setAdvanceForm(prev => ({ ...prev, project_id: pid }));
        }
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ notes: clientNotes })
        .eq('id', clientId);

      if (error) throw error;
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSavingSettings(false);
    }
  }

  // Lógica de Eliminación Protegida
  const initiateDelete = (id: string, type: 'project' | 'payment' | 'cost' | 'extra' | 'commitment' | 'advance') => {
    setItemToDelete({ id, type });
    setShowAdminAuth(true);
    setAdminPassword('');
    setAuthError('');
  };

  const handleConfirmDelete = async () => {
    // CLAVE MAESTRA (En un entorno real esto iría en el backend o en variables de entorno seguras)
    const MASTER_KEY = 'admin123'; 

    if (adminPassword !== MASTER_KEY) {
      setAuthError('Contraseña incorrecta. Solo administradores autorizados.');
      return;
    }

    if (!itemToDelete) return;

    setDeleting(true);
    try {
      let table = '';
      switch (itemToDelete.type) {
        case 'project': table = 'projects'; break;
        case 'payment': table = 'project_payments'; break;
        case 'cost': table = 'project_costs'; break;
        case 'extra': table = 'project_extras'; break;
        case 'commitment': table = 'project_commitments'; break;
        case 'advance': table = 'partner_advances'; break;
      }

      const { error } = await supabase.from(table).delete().eq('id', itemToDelete.id);
      
      if (error) throw error;

      setShowAdminAuth(false);
      setItemToDelete(null);
      // Actualización rápida sin recargar toda la página
      await fetchClientData(); 
    } catch (error: any) {
      alert('Error al eliminar: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const initiateEdit = (project: any) => {
    setProjectToEdit(project);
    setEditForm({
      title: project.title || '',
      budget_usd: project.budget_usd?.toString() || '',
      description: project.description || ''
    });
    setAiRefinement('');
    setShowEditProjectModal(true);
  };

  const handleSaveEdit = async () => {
    if (!projectToEdit) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          title: editForm.title,
          budget_usd: parseCurrency(editForm.budget_usd),
          description: editForm.description
        })
        .eq('id', projectToEdit.id);

      if (error) throw error;
      setShowEditProjectModal(false);
      fetchClientData();
    } catch (error: any) {
      alert('Error al guardar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAiRefineEdit = async () => {
    if (!aiRefinement.trim() || refining) return;
    setRefining(true);
    try {
      const { modifyProposalText } = await import('@/app/actions/ai-actions');
      const res = await modifyProposalText(editForm.description, aiRefinement);
      if (res.success && res.modifiedText) {
        setEditForm({ ...editForm, description: res.modifiedText });
        setAiRefinement('');
      } else {
        alert(res.error || 'Error al refinar con IA');
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setRefining(false);
    }
  };

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.project_id) return alert('Seleccione un proyecto origen.');
    const { error } = await supabase.from('project_payments').insert([{
      project_id: paymentForm.project_id,
      amount_usd: parseCurrency(paymentForm.amount_usd),
      description: paymentForm.description,
      reference: paymentForm.reference,
      date: paymentForm.date
    }]);
    if (!error) {
      setShowPaymentModal(false);
      setPaymentForm({ ...paymentForm, amount_usd: '', description: '', reference: '' });
      fetchClientData();
    } else alert(`Error: ${error.message}`);
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    if (!costForm.project_id) return alert('Seleccione un proyecto destino.');
    const { error } = await supabase.from('project_costs').insert([{
      project_id: costForm.project_id,
      description: costForm.description,
      provider: costForm.provider,
      category: costForm.category,
      quantity: costForm.quantity,
      unit_price_usd: parseCurrency(costForm.unit_price_usd),
      date: costForm.date
    }]);
    if (!error) {
      setShowCostModal(false);
      setCostForm({ ...costForm, description: '', provider: '', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchClientData();
    } else alert(`Error: ${error.message}`);
  }

  async function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!extraForm.project_id) return alert('Seleccione un proyecto origen.');
    const { error } = await supabase.from('project_extras').insert([{
      project_id: extraForm.project_id,
      description: extraForm.description,
      amount_usd: parseCurrency(extraForm.amount_usd)
    }]);
    if (!error) {
      setShowExtraModal(false);
      setExtraForm({ ...extraForm, description: '', amount_usd: '' });
      fetchClientData();
    } else alert(`Error: ${error.message}`);
  }

  async function handleAddCommitment(e: React.FormEvent) {
    e.preventDefault();
    if (!commitmentForm.project_id) return alert('Seleccione un proyecto origen.');
    
    const { error } = await supabase.from('project_commitments').insert([{
      project_id: commitmentForm.project_id,
      description: commitmentForm.description,
      provider: commitmentForm.provider,
      category: commitmentForm.category,
      quantity: commitmentForm.quantity,
      unit_price_usd: parseCurrency(commitmentForm.unit_price_usd),
      amount_usd: commitmentForm.quantity * parseCurrency(String(commitmentForm.unit_price_usd)),
      date: commitmentForm.date
    }]);

    if (!error) {
      setShowCommitmentModal(false);
      setCommitmentForm({ ...commitmentForm, description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchClientData();
    } else alert(`Error: ${error.message}`);
  }

  const initiateEditItem = (item: any, type: 'payment' | 'cost' | 'commitment') => {
    if (isViewer) return;
    setEditingItem(item);
    setEditItemType(type);
    setEditItemForm({ ...item });
    setShowEditItemModal(true);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem || !editItemType) return;
    setLoading(true);
    try {
      let table = '';
      let updateData: any = {};

      if (editItemType === 'payment') {
        table = 'project_payments';
        updateData = {
          project_id: editItemForm.project_id,
          amount_usd: parseCurrency(editItemForm.amount_usd),
          date: editItemForm.date,
          reference: editItemForm.reference,
          description: editItemForm.description
        };
      } else if (editItemType === 'cost') {
        table = 'project_costs';
        updateData = {
          project_id: editItemForm.project_id,
          description: editItemForm.description,
          provider: editItemForm.provider,
          category: editItemForm.category,
          quantity: editItemForm.quantity,
          unit_price_usd: parseCurrency(editItemForm.unit_price_usd),
          date: editItemForm.date
        };
      } else if (editItemType === 'commitment') {
        table = 'project_commitments';
        updateData = {
          project_id: editItemForm.project_id,
          description: editItemForm.description,
          provider: editItemForm.provider,
          category: editItemForm.category,
          quantity: editItemForm.quantity,
          unit_price_usd: parseCurrency(editItemForm.unit_price_usd),
          amount_usd: editItemForm.quantity * parseCurrency(String(editItemForm.unit_price_usd)),
          date: editItemForm.date
        };
      }

      const { error } = await supabase.from(table).update(updateData).eq('id', editingItem.id);
      if (error) throw error;

      setShowEditItemModal(false);
      setEditingItem(null);
      setEditItemType(null);
      fetchClientData();
    } catch (error: any) {
      alert('Error al guardar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  async function handleAddAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!advanceForm.project_id) return alert('Seleccione un proyecto relacionado.');

    const { error } = await supabase.from('partner_advances').insert([{
      project_id: advanceForm.project_id,
      partner_name: advanceForm.partner_name,
      amount_usd: parseCurrency(advanceForm.amount_usd),
      description: advanceForm.description,
      date: advanceForm.date
    }]);

    if (!error) {
      setShowAdvanceModal(false);
      setAdvanceForm({ ...advanceForm, amount_usd: '', description: '', date: new Date().toISOString().split('T')[0] });
      fetchClientData();
    } else alert(`Error: ${error.message}`);
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem auto' }}>⏳</div>
        Cargando estado de cuenta del cliente...
      </div>
    );
  }

  if (!client) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Cliente no encontrado.</div>;
  }

  // Cálculos Financieros
  const activeProjects = projects.filter(p => p.status === 'in_progress' || p.status === 'completed');
  const pendingProposals = projects.filter(p => p.status === 'proposal');
  
  const allPayments = activeProjects.flatMap(p => p.project_payments.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allCosts = activeProjects.flatMap(p => p.project_costs.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allExtras = activeProjects.flatMap(p => p.project_extras.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allCommitments = activeProjects.flatMap(p => p.project_commitments.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allAdvances = activeProjects.flatMap(p => p.partner_advances.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));

  const totalContracted = activeProjects.reduce((sum, p) => sum + Number(p.budget_usd), 0) + allExtras.reduce((sum, e) => sum + Number(e.amount_usd), 0);
  const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount_usd), 0);
  const totalCostsValue = allCosts.reduce((sum, c) => sum + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
  const totalCommitted = allCommitments.reduce((sum, c) => sum + Number(c.amount_usd), 0);
  const totalAdvances = allAdvances.reduce((sum, a) => sum + Number(a.amount_usd), 0);

  const balanceDue = totalContracted - totalPaid;
  const estimatedProfit = totalContracted - totalCostsValue - totalCommitted;
  const netProfit = estimatedProfit - totalAdvances;
  const estimatedMargin = totalContracted > 0 ? (estimatedProfit / totalContracted) * 100 : 0;

  // Variables de impresión filtradas por selección del usuario
  const printProjects = selectedProjectIds.size > 0
    ? activeProjects.filter(p => selectedProjectIds.has(p.id))
    : activeProjects;
  const printPayments = printProjects.flatMap(p => p.project_payments.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printCosts = printProjects.flatMap(p => p.project_costs.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printExtras = printProjects.flatMap(p => p.project_extras.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printCommitments = printProjects.flatMap(p => p.project_commitments.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printAdvances = printProjects.flatMap(p => p.partner_advances.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printTotalContracted = printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0) + printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0);
  const printTotalPaid = printPayments.reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
  const printTotalCostsValue = printCosts.reduce((s: number, c: any) => s + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
  const printTotalCommitted = printCommitments.reduce((s: number, c: any) => s + Number(c.amount_usd), 0);
  const printTotalAdvances = printAdvances.reduce((s: number, a: any) => s + Number(a.amount_usd), 0);
  const printBalanceDue = printTotalContracted - printTotalPaid;
  const printEstimatedProfit = printTotalContracted - printTotalCostsValue - printTotalCommitted;
  const printNetProfit = printEstimatedProfit - printTotalAdvances;

  return (
    <>
      <div className="animate-fade hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            <button className="btn-secondary" style={{ padding: '0.6rem' }} onClick={() => router.push('/clientes')}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 800, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white' }}>
                {client.name}
                <span className={`badge ${client.status === 'active' ? 'badge-active' : ''}`} style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                  {client.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </h1>
              <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {client.company_name && <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Building size={13} /> {client.company_name}</span>}
                {client.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Phone size={13} /> {client.phone}</span>}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <button className="btn-secondary" onClick={() => { setSelectedProjectIds(new Set(activeProjects.map((p: any) => p.id))); setShowPrintModal(true); }} style={{ padding: '0.7rem 1.2rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, background: 'rgba(255,255,255,0.03)' }}>
              <Printer size={18} /> Imprimir Reporte
            </button>
          </div>
        </div>

      {/* ACTION BAR */}
      {!isViewer && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'nowrap', overflowX: 'auto', justifyContent: 'flex-start', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button className="btn-primary" onClick={() => setShowProposalModal(true)} style={{ height: '38px', padding: '0 1.1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }}>
            <PlusCircle size={16} /> Nueva Propuesta
          </button>

          <button className="btn-primary" onClick={() => setShowPaymentModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--success)', borderColor: 'var(--success)', boxShadow: '0 4px 12px rgba(16,185,129,0.15)' }}>
            <BriefcaseIcon size={15} /> Registrar Pago
          </button>
          <button className="btn-secondary" onClick={() => setShowAdvanceModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: '#8b5cf6', color: '#8b5cf6' }}>
            <Users size={15} /> Retiro de Socio
          </button>
          <button className="btn-secondary" onClick={() => setShowCommitmentModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}>
            <ClipboardList size={15} /> Registrar Compromiso
          </button>
          <button className="btn-secondary" onClick={() => setShowExtraModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={15} /> Servicio Adicional
          </button>
          <button className="btn-secondary" onClick={() => setShowCostModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            <DollarIcon size={15} /> Registrar Gasto
          </button>
        </div>
      )}

      {/* Estado de Cuenta Global y Rentabilidad del Cliente */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Fila 1: Indicadores Principales (Contratos y Pagos) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(56,189,248,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(56,189,248,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-blue)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Briefcase size={16} /> <span style={{ fontWeight: 700 }}>Total Contratado</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalContracted)}
            </div>
          </div>
          
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16, 185, 129, 0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <TrendingUp size={16} /> <span style={{ fontWeight: 700 }}>Total Abonado</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalPaid)}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Activity size={16} /> <span style={{ fontWeight: 700 }}>Saldo Pendiente</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(balanceDue)}
            </div>
          </div>
        </div>

        {/* Fila 2: Indicadores de Rentabilidad (Egresos y Ganancia) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <TrendingDown size={16} /> <span style={{ fontWeight: 700 }}>Gastos Ejecutados</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalCostsValue)}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <AlertCircle size={16} /> <span style={{ fontWeight: 700 }}>Compromisos</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalCommitted)}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(139,92,246,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(139,92,246,0.35)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', opacity: 0.1 }}>
              <Users size={80} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a78bfa', marginBottom: '0.75rem', position: 'relative', zIndex: 1, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Users size={16} /> <span style={{ fontWeight: 700 }}>Ganancia Disponible</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', position: 'relative', zIndex: 1, letterSpacing: '-0.02em' }}>
              ${formatCurrency(estimatedProfit)}
            </div>
            <div style={{ position: 'relative', zIndex: 1, marginTop: '0.5rem' }}>
               <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                 Contrato − Gastos − Compromisos
               </span>
            </div>
          </div>
        </div>

        {/* Fila 2: Indicadores Secundarios */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Proyectos Activos</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white' }}>{activeProjects.length}</div>
            </div>
            <Briefcase size={24} color="var(--accent-blue)" opacity={0.5} />
          </div>

          <div className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pagos Registrados</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white' }}>{allPayments.length}</div>
            </div>
            <DollarSign size={24} color="var(--success)" opacity={0.5} />
          </div>

          <div className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(167, 139, 250, 0.2)' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#a78bfa' }}>Propuestas por Aprobar</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white' }}>{pendingProposals.length}</div>
            </div>
            <ClipboardList size={24} color="#a78bfa" opacity={0.5} />
          </div>
        </div>

      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        

        {/* Pestañas de Tablas */}
        <div className="card" style={{ padding: '1.5rem', height: '100%' }}>
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', paddingBottom: '0.5rem', overflowX: 'auto' }}>
            <button 
              className={`btn-secondary ${activeTab === 'propuestas' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'propuestas' ? 'var(--primary-color)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('propuestas')}
            >
              Propuestas
            </button>
            <button 
              className={`btn-secondary ${activeTab === 'proyectos' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'proyectos' ? 'var(--accent-blue)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('proyectos')}
            >
              Proyectos
            </button>
            <button 
              className={`btn-secondary ${activeTab === 'pagos' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'pagos' ? 'var(--accent-blue)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('pagos')}
            >
              Pagos
            </button>
            <button 
              className={`btn-secondary ${activeTab === 'gastos' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'gastos' ? 'var(--danger)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('gastos')}
            >
              Gastos
            </button>
            <button 
              className={`btn-secondary ${activeTab === 'adicionales' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'adicionales' ? 'var(--primary-color)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('adicionales')}
            >
              Adicionales
            </button>
            <button 
              className={`btn-secondary ${activeTab === 'compromisos' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'compromisos' ? 'var(--primary-color)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('compromisos')}
            >
              Compromisos
            </button>
            <button
              className={`btn-secondary ${activeTab === 'retiros' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'retiros' ? '#8b5cf6' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('retiros')}
            >
              Retiro de Socios
            </button>
          </div>

          {activeTab === 'propuestas' && (
            <div className="animate-fade">
              {pendingProposals.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay propuestas pendientes de aprobación.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>TÍTULO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO PROPUESTO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingProposals.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 'bold' }}>{p.title}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(p.budget_usd)}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            {!isViewer && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} 
                                onClick={() => initiateEdit(p)}
                              >
                                <Edit3 size={14} /> Editar
                              </button>
                            )}
                            <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} onClick={() => router.push(`/proyectos?print=${p.id}`)}>
                              <Printer size={14} /> Imprimir
                            </button>
                            {!isViewer && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} 
                                onClick={() => initiateDelete(p.id, 'project')}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'proyectos' && (
            <div>
              {activeProjects.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay proyectos activos.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>CONTRATADO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>EGRESOS</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>GANANCIA EST.</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeProjects.map(project => {
                        const pExtras = project.project_extras?.reduce((acc, e) => acc + Number(e.amount_usd), 0) || 0;
                        const pContratado = Number(project.budget_usd) + pExtras;
                        const pEgresos = project.project_costs?.reduce((acc, c) => acc + (Number(c.quantity) * Number(c.unit_price_usd)), 0) || 0;
                        const pCompromisos = project.project_commitments?.reduce((acc, c) => acc + Number(c.amount_usd), 0) || 0;
                        const pGanancia = pContratado - pEgresos - pCompromisos;

                        return (
                          <tr key={project.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '1rem' }}>
                              <div style={{ fontWeight: 'bold' }}>{project.proposal_number ? `#${project.proposal_number} - ` : ''}{project.title}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(project.created_at).toLocaleDateString()}</div>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(pContratado)}</td>
                            <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--danger)' }}>${formatCurrency(pEgresos)}</td>
                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                              <div style={{ fontWeight: 'bold', color: pGanancia < 0 ? 'var(--danger)' : 'var(--success)' }}>
                                ${formatCurrency(pGanancia)}
                              </div>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                              <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} onClick={() => router.push(`/proyectos/${project.id}?from=client&clientId=${clientId}`)}>
                                <FileText size={14} /> Ver
                              </button>
                              <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} onClick={() => router.push(`/proyectos?print=${project.id}`)}>
                                <Printer size={14} /> Imprimir
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                onClick={() => initiateDelete(project.id, 'project')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'compromisos' && (
            <div>
              {allCommitments.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay compromisos (gastos por ejecutar) registrados.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>PROVEEDOR</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}>TOTAL (USD)</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCommitments.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.date || new Date(c.created_at).toISOString().split('T')[0]}</td>
                        <td style={{ padding: '1rem' }}>{c.description} <br/><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.quantity} x ${formatCurrency(c.unit_price_usd)}</span></td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.provider || 'N/A'}</td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.proposal_number ? `#${c.proposal_number} - ` : ''}{c.project_title}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>- ${formatCurrency(c.amount_usd || (c.quantity * c.unit_price_usd))}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {!isViewer && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                              onClick={() => initiateEditItem(c, 'commitment')}
                              title="Editar compromiso"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                            onClick={() => initiateDelete(c.id, 'commitment')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'pagos' && (
            <div>
              {allPayments.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay pagos registrados.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO (USD)</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPayments.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.date}</td>
                        <td style={{ padding: '1rem' }}>{p.description} <br/><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ref: {p.reference || 'N/A'}</span></td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.project_title}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>+ ${formatCurrency(p.amount_usd)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {!isViewer && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                              onClick={() => initiateEditItem(p, 'payment')}
                              title="Editar pago"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                            onClick={() => initiateDelete(p.id, 'payment')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'gastos' && (
            <div>
              {allCosts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay gastos registrados.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>DESCRIPCIÓN</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>PROVEEDOR</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>CATEGORÍA</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}>TOTAL (USD)</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCosts.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem' }}>{c.description} <br/><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.quantity} x ${formatCurrency(c.unit_price_usd)}</span></td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.provider || 'N/A'}</td>
                        <td style={{ padding: '1rem' }}>{c.category === 'materials' ? 'Materiales' : c.category === 'labor' ? 'Mano de Obra' : c.category === 'equipment' ? 'Equipos' : c.category === 'permits' ? 'Permisos' : 'Otros'}</td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.proposal_number ? `#${c.proposal_number} - ` : ''}{c.project_title}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>- ${formatCurrency(c.quantity * c.unit_price_usd)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {!isViewer && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                              onClick={() => initiateEditItem(c, 'cost')}
                              title="Editar gasto"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                            onClick={() => initiateDelete(c.id, 'cost')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'adicionales' && (
            <div>
              {allExtras.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay trabajos adicionales registrados.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>DESCRIPCIÓN</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO ORIGEN</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO EXTRA (USD)</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allExtras.map(e => (
                      <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem' }}>{e.description}</td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{e.proposal_number ? `#${e.proposal_number} - ` : ''}{e.project_title}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>+ ${formatCurrency(e.amount_usd)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} 
                            onClick={() => initiateDelete(e.id, 'extra')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'retiros' && (
            <div>
              {(() => {
                const share = estimatedProfit / 2;
                const henryAdvances = allAdvances.filter(a => a.partner_name === 'Henry Peraza').reduce((s, a) => s + Number(a.amount_usd), 0);
                const losberAdvances = allAdvances.filter(a => a.partner_name === 'Losbers Perez').reduce((s, a) => s + Number(a.amount_usd), 0);
                const henrySaldo = share - henryAdvances;
                const losberSaldo = share - losberAdvances;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                    {[
                      { name: 'Henry Peraza', advances: henryAdvances, saldo: henrySaldo },
                      { name: 'Losbers Perez', advances: losberAdvances, saldo: losberSaldo },
                    ].map(partner => (
                      <div key={partner.name} className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(139,92,246,0.06) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(139,92,246,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#a78bfa', fontSize: '0.9rem' }}>
                            {partner.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '1rem' }}>{partner.name}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(139,92,246,0.08)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#a78bfa' }}>Le corresponde (50%)</span>
                            <span style={{ fontWeight: 700, color: '#a78bfa' }}>${formatCurrency(share)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Retiros realizados</span>
                            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>−${formatCurrency(partner.advances)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.8rem', background: partner.saldo >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: '8px', border: `1px solid ${partner.saldo >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: partner.saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>Saldo disponible</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: partner.saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>${formatCurrency(Math.abs(partner.saldo))}{partner.saldo < 0 ? ' (excedido)' : ''}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {allAdvances.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay retiros de socios registrados.</div>
              ) : (
                <div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>SOCIO</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO (USD)</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAdvances.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{a.date}</td>
                          <td style={{ padding: '1rem', fontWeight: 'bold' }}>{a.partner_name}</td>
                          <td style={{ padding: '1rem' }}>{a.description || 'Sin descripción'}</td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{a.proposal_number ? `#${a.proposal_number} - ` : ''}{a.project_title}</td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#a78bfa' }}>${formatCurrency(a.amount_usd)}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} 
                              onClick={() => initiateDelete(a.id, 'advance')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel Inferior: Notas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <FileText size={18} className="text-muted" /> Notas del Cliente
              </h3>
              {settingsSaved && <span style={{ color: 'var(--success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle2 size={14} /> Guardado</span>}
            </div>
            <textarea 
              className="input-field"
              style={{ flex: 1, resize: 'vertical', minHeight: '120px', fontFamily: 'inherit', lineHeight: '1.5' }}
              placeholder="Acuerdos, pendientes o información específica..."
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button 
                className="btn-primary" 
                style={{ minWidth: '200px', justifyContent: 'center' }}
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? 'Guardando...' : <><Save size={18} /> Guardar Notas</>}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Modals */}
      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Pago</h2>
            <form onSubmit={handleAddPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto (Origen del Pago)</label>
                <select className="input-field" required value={paymentForm.project_id} onChange={e => setPaymentForm({...paymentForm, project_id: e.target.value})}>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                <input type="text" required className="input-field" value={paymentForm.amount_usd} onChange={e => setPaymentForm({...paymentForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setPaymentForm({...paymentForm, amount_usd: formatOnBlur(e.target.value)})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                <input type="text" required placeholder="Ej. Anticipo 50%" className="input-field" value={paymentForm.description} onChange={e => setPaymentForm({...paymentForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Referencia</label>
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
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Gasto</h2>
            <form onSubmit={handleAddCost} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto Destino</label>
                <select className="input-field" required value={costForm.project_id} onChange={e => setCostForm({...costForm, project_id: e.target.value})}>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                <input type="date" required className="input-field" value={costForm.date} onChange={e => setCostForm({...costForm, date: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor / Trabajador</label>
                <input type="text" required className="input-field" value={costForm.provider} onChange={e => setCostForm({...costForm, provider: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
                <input type="text" required className="input-field" value={costForm.description} onChange={e => setCostForm({...costForm, description: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Cantidad</label>
                  <input type="number" step="0.01" required className="input-field" value={costForm.quantity} onChange={e => setCostForm({...costForm, quantity: parseFloat(e.target.value) || 0})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Precio Unit. (USD)</label>
                  <input type="text" required className="input-field" value={costForm.unit_price_usd} onChange={e => setCostForm({...costForm, unit_price_usd: handleMoneyInput(e.target.value)})} onBlur={e => setCostForm({...costForm, unit_price_usd: formatOnBlur(e.target.value)})} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowCostModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Gasto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCommitmentModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Compromiso</h2>
            <form onSubmit={handleAddCommitment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto Relacionado</label>
                <select className="input-field" required value={commitmentForm.project_id} onChange={e => setCommitmentForm({...commitmentForm, project_id: e.target.value})}>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha del Compromiso</label>
                <input type="date" required className="input-field" value={commitmentForm.date} onChange={e => setCommitmentForm({...commitmentForm, date: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor / Trabajador</label>
                <input type="text" required placeholder="Ej. Ferretería EPA / Juan Pérez" className="input-field" value={commitmentForm.provider} onChange={e => setCommitmentForm({...commitmentForm, provider: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
                <input type="text" required placeholder="Ej. Cemento Portland" className="input-field" value={commitmentForm.description} onChange={e => setCommitmentForm({...commitmentForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Categoría</label>
                <select className="input-field" value={commitmentForm.category} onChange={e => setCommitmentForm({...commitmentForm, category: e.target.value})}>
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
                  <input type="number" step="0.01" required className="input-field" value={commitmentForm.quantity} onChange={e => setCommitmentForm({...commitmentForm, quantity: parseFloat(e.target.value) || 0})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Precio Unitario (USD)</label>
                  <input type="text" required className="input-field" value={commitmentForm.unit_price_usd} onChange={e => setCommitmentForm({...commitmentForm, unit_price_usd: handleMoneyInput(e.target.value)})} onBlur={e => setCommitmentForm({...commitmentForm, unit_price_usd: formatOnBlur(e.target.value)})} />
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                Total: ${(commitmentForm.quantity * parseCurrency(String(commitmentForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits:2})}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowCommitmentModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Compromiso</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExtraModal && (
        <div className="modal-overlay hide-on-print">
          <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Trabajo Adicional</h2>
            <form onSubmit={handleAddExtra} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto Origen</label>
                <select className="input-field" required value={extraForm.project_id} onChange={e => setExtraForm({...extraForm, project_id: e.target.value})}>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción del Adicional</label>
                <input type="text" required placeholder="Ej. Instalación de lámparas extras" className="input-field" value={extraForm.description} onChange={e => setExtraForm({...extraForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto Extra a Cobrar (USD)</label>
                <input type="text" required className="input-field" value={extraForm.amount_usd} onChange={e => setExtraForm({...extraForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setExtraForm({...extraForm, amount_usd: formatOnBlur(e.target.value)})} />
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
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Cliente</label>
                <div className="input-field" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', cursor: 'default' }}>
                  {client?.name || '—'}
                </div>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto del Cliente</label>
                <select className="input-field" required value={advanceForm.project_id} onChange={e => setAdvanceForm({...advanceForm, project_id: e.target.value})}>
                  <option value="">Seleccionar proyecto...</option>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                <input type="text" required className="input-field" value={advanceForm.amount_usd} onChange={e => setAdvanceForm({...advanceForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setAdvanceForm({...advanceForm, amount_usd: formatOnBlur(e.target.value)})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                <input type="text" placeholder="Ej. Retiro personal" className="input-field" value={advanceForm.description} onChange={e => setAdvanceForm({...advanceForm, description: e.target.value})} />
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

      {/* Modal de selección de proyectos para imprimir */}
      {showPrintModal && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                <Printer size={18} /> Seleccionar Proyectos a Imprimir
              </h2>
              <button onClick={() => setShowPrintModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
                <X size={22} />
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginBottom: '1.2rem', marginTop: 0 }}>
              Seleccione los proyectos a incluir en el reporte. Los totales se recalculan según la selección.
            </p>

            {/* Proyectos activos/completados */}
            {activeProjects.length > 0 && (
              <div style={{ marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
                    Proyectos ({activeProjects.length})
                  </span>
                  <button
                    className="btn-secondary"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.73rem' }}
                    onClick={() => {
                      const allIds = activeProjects.map((p: any) => p.id);
                      const allChecked = allIds.every((id: string) => selectedProjectIds.has(id));
                      setSelectedProjectIds(() => {
                        const next = new Set(selectedProjectIds);
                        if (allChecked) { allIds.forEach((id: string) => next.delete(id)); }
                        else { allIds.forEach((id: string) => next.add(id)); }
                        return next;
                      });
                    }}
                  >
                    {activeProjects.every((p: any) => selectedProjectIds.has(p.id)) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {activeProjects.map((p: any) => {
                    const isChecked = selectedProjectIds.has(p.id);
                    const pExtras = p.project_extras?.reduce((s: number, e: any) => s + Number(e.amount_usd), 0) || 0;
                    const pTotal = Number(p.budget_usd) + pExtras;
                    const statusLabel = p.status === 'in_progress' ? 'En Curso' : p.status === 'completed' ? 'Completado' : 'Cancelado';
                    const statusClass = p.status === 'completed' ? 'badge-success' : p.status === 'cancelled' ? 'badge-danger' : 'badge-warning';
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.9rem',
                          borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s ease',
                          border: `1px solid ${isChecked ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.07)'}`,
                          background: isChecked ? 'rgba(56,189,248,0.06)' : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedProjectIds(() => {
                              const next = new Set(selectedProjectIds);
                              if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                              return next;
                            });
                          }}
                          style={{ width: '15px', height: '15px', accentColor: 'var(--accent-blue)', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'white', fontSize: '0.87rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.proposal_number ? `#${p.proposal_number} – ` : ''}{p.title}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(p.created_at).toLocaleDateString('es-VE')} · {p.project_payments?.length || 0} pagos · {p.project_costs?.length || 0} gastos
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, color: 'white', fontSize: '0.87rem' }}>${formatCurrency(pTotal)}</div>
                          <span className={`badge ${statusClass}`} style={{ fontSize: '0.67rem' }}>{statusLabel}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Propuestas pendientes (informativo) */}
            {pendingProposals.length > 0 && (
              <div style={{ marginBottom: '1.2rem', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px dashed rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.03)' }}>
                <span style={{ fontSize: '0.73rem', color: 'var(--primary-color)', fontWeight: 700, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Propuestas Pendientes — solo informativo, sin datos financieros
                </span>
                {pendingProposals.map((p: any) => (
                  <div key={p.id} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>
                    {p.proposal_number ? `#${p.proposal_number} – ` : ''}{p.title} · ${formatCurrency(p.budget_usd)}
                  </div>
                ))}
              </div>
            )}

            {/* Vista previa de totales */}
            {(() => {
              const previewProjects = activeProjects.filter((p: any) => selectedProjectIds.has(p.id));
              const previewExtras = previewProjects.flatMap((p: any) => p.project_extras || []);
              const previewContracted = previewProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0) + previewExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0);
              const previewPaid = previewProjects.flatMap((p: any) => p.project_payments || []).reduce((s: number, pmt: any) => s + Number(pmt.amount_usd), 0);
              return (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '1.2rem', fontSize: '0.83rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vista previa — {previewProjects.length} proyecto{previewProjects.length !== 1 ? 's' : ''} seleccionado{previewProjects.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Contratado:</span>
                    <span style={{ color: 'white', fontWeight: 600, textAlign: 'right' }}>${formatCurrency(previewContracted)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>Total Abonado:</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600, textAlign: 'right' }}>${formatCurrency(previewPaid)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Botones */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowPrintModal(false)}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ flex: 2, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: selectedProjectIds.size === 0 ? 0.5 : 1, cursor: selectedProjectIds.size === 0 ? 'not-allowed' : 'pointer' }}
                disabled={selectedProjectIds.size === 0}
                onClick={() => { setShowPrintModal(false); setTimeout(() => window.print(), 100); }}
              >
                <Printer size={15} /> Imprimir ({selectedProjectIds.size} proyecto{selectedProjectIds.size !== 1 ? 's' : ''})
              </button>
            </div>
          </div>
        </div>
      )}

      </div> {/* End hide-on-print */}

      {/* VISTA SOLO PARA IMPRESIÓN */}
      <div className="print-only">
        {/* Encabezado del Reporte */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '2rem' }}>
          <div>
             <h1 style={{ margin: 0, fontSize: '24px', color: '#000' }}>P&P CONSTRUYE</h1>
             <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Ingeniería, Arquitectura y Construcción</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>ESTADO DE CUENTA GLOBAL</h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Fecha de Emisión: {new Date().toLocaleDateString('es-VE')}</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Proyectos incluidos: {printProjects.length} de {activeProjects.length}</p>
          </div>
        </div>

        {/* Datos del Cliente */}
        <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '16px' }}>CLIENTE: {client.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '12px' }}>
            <div><strong>Empresa:</strong> {client.company_name || 'N/A'}</div>
            <div><strong>RIF/Identificación:</strong> {client.tax_id || 'N/A'}</div>
            <div><strong>Teléfono:</strong> {client.phone || 'N/A'}</div>
            <div><strong>Email:</strong> {client.email || 'N/A'}</div>
          </div>
        </div>

        {/* Resumen Financiero (KPIs) */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>RESUMEN FINANCIERO</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '14px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa', width: '50%' }}><strong>Total Contratado:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', width: '50%', textAlign: 'right' }}>${formatCurrency(printTotalContracted)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Total Abonado:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right' }}>${formatCurrency(printTotalPaid)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Saldo Pendiente:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: printBalanceDue > 0 ? '#ff9800' : '#28a745' }}>${formatCurrency(printBalanceDue)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Gastos Ejecutados:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printTotalCostsValue)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Compromisos Pendientes:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printTotalCommitted)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Ganancia Estimada:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#28a745' }}>${formatCurrency(printEstimatedProfit)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Total Retiro de Socios:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printTotalAdvances)}</td>
            </tr>
            <tr style={{ background: '#e8f5e9' }}>
              <td style={{ padding: '0.7rem', border: '2px solid #28a745', fontWeight: 'bold' }}><strong>GANANCIA NETA POR RETIRAR:</strong></td>
              <td style={{ padding: '0.7rem', border: '2px solid #28a745', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20', fontSize: '15px' }}>${formatCurrency(printNetProfit)}</td>
            </tr>
          </tbody>
        </table>

        {/* Detalle de Proyectos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>1. PROYECTOS Y PRESUPUESTOS</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f1f1f1' }}>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROYECTO</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>FECHA</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>PRESUPUESTO BASE</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>ADICIONALES</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL PROYECTO</th>
            </tr>
          </thead>
          <tbody>
            {printProjects.map((p: any) => {
              const pExtras = p.project_extras?.reduce((acc: number, e: any) => acc + Number(e.amount_usd), 0) || 0;
              const pTotal = Number(p.budget_usd) + pExtras;
              return (
                <tr key={p.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>{new Date(p.created_at).toLocaleDateString('es-VE')}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(p.budget_usd)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(pExtras)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(pTotal)}</td>
                </tr>
              );
            })}
            <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
              <td colSpan={2} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTALES GLOBALES:</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0))}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0))}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(printTotalContracted)}</td>
            </tr>
          </tbody>
        </table>

        {/* Detalle de Pagos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>2. HISTORIAL DE PAGOS RECIBIDOS</h3>
        {printPayments.length === 0 ? (
           <p style={{ fontSize: '12px', color: '#555', marginBottom: '2rem' }}>No hay pagos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO / REFERENCIA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROYECTO ORIGEN</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>MONTO (USD)</th>
              </tr>
            </thead>
            <tbody>
              {printPayments.map((p: any) => (
                <tr key={p.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.date}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.description} {p.reference ? `(Ref: ${p.reference})` : ''}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.project_title}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(p.amount_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Cobrado:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(printTotalPaid)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Detalle de Gastos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>3. RELACIÓN DE GASTOS EJECUTADOS</h3>
        {printCosts.length === 0 ? (
           <p style={{ fontSize: '12px', color: '#555', marginBottom: '2rem' }}>No hay gastos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROVEEDOR</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>CANT.</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>P. UNIT.</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL (USD)</th>
              </tr>
            </thead>
            <tbody>
              {printCosts.map((c: any) => (
                <tr key={c.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.date || new Date(c.created_at).toISOString().split('T')[0]}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.provider || 'N/A'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.description}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>{c.quantity}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(c.unit_price_usd)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(c.quantity * c.unit_price_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={5} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Gastado:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printTotalCostsValue)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Detalle de Compromisos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>4. COMPROMISOS (GASTOS POR EJECUTAR)</h3>
        {printCommitments.length === 0 ? (
           <p style={{ fontSize: '12px', color: '#555', marginBottom: '2rem' }}>No hay compromisos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROVEEDOR</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL PENDIENTE (USD)</th>
              </tr>
            </thead>
            <tbody>
              {printCommitments.map((c: any) => {
                const cTotal = c.amount_usd || (c.quantity * c.unit_price_usd);
                return (
                  <tr key={c.id}>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.date || new Date(c.created_at).toISOString().split('T')[0]}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.provider || 'N/A'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.description}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(cTotal)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Compromisos:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printTotalCommitted)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Detalle de Retiros */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>5. RETIRO DE SOCIOS</h3>
        {printAdvances.length === 0 ? (
           <p style={{ fontSize: '12px', color: '#555', marginBottom: '2rem' }}>No hay retiros registrados.</p>
        ) : (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f1f1' }}>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>SOCIO</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROYECTO</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>MONTO (USD)</th>
                </tr>
              </thead>
              <tbody>
                {printAdvances.map((a: any) => (
                  <tr key={a.id}>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{a.date}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem', fontWeight: 'bold' }}>{a.partner_name}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{a.proposal_number ? `#${a.proposal_number} - ` : ''}{a.project_title}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(a.amount_usd)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Retiros Henry Peraza:</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(printAdvances.filter((a: any) => a.partner_name === 'Henry Peraza').reduce((s: number, a: any) => s + Number(a.amount_usd), 0))}</td>
                </tr>
                <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Retiros Losbers Perez:</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(printAdvances.filter((a: any) => a.partner_name === 'Losbers Perez').reduce((s: number, a: any) => s + Number(a.amount_usd), 0))}</td>
                </tr>
                <tr style={{ background: '#fff3cd', fontWeight: 'bold' }}>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL RETIRADO:</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printTotalAdvances)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Observaciones / Notas */}
        {clientNotes && (
          <div>
            <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>OBSERVACIONES IMPORTANTES</h3>
            <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: '12px' }}>
              {clientNotes}
            </div>
          </div>
        )}

        <div style={{ marginTop: '3rem', textAlign: 'center', fontSize: '10px', color: '#777' }}>
          <p>Documento generado por el Sistema Administrativo de P&P Construye</p>
        </div>
      </div>

      {/* Estilos para impresión */}
      <style dangerouslySetInnerHTML={{ __html: `
        .print-only { display: none; }
        @media print {
          body { 
            background: white !important; 
            color: black !important; 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
          }
          .hide-on-print, nav, header, aside { display: none !important; }
          .print-only { display: block !important; }
          .app-container, .main-content { 
            padding: 0 !important; 
            margin: 0 !important; 
            max-width: 100% !important;
            width: 100% !important;
          }
          @page { margin: 1.5cm; }
        }
      `}} />

      {/* Modal de Autenticación de Administrador para Eliminación */}
      {showAdminAuth && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
              <Trash2 size={48} style={{ margin: '0 auto' }} />
            </div>
            <h2 style={{ marginBottom: '0.5rem', color: 'white' }}>Confirmar Eliminación</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Esta acción es irreversible y requiere privilegios de administrador.
            </p>
            
            <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Contraseña Maestra</label>
              <input 
                type="password" 
                className="input-field" 
                style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3em' }}
                placeholder="••••••••"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmDelete()}
                autoFocus
              />
              {authError && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center' }}>{authError}</div>}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                className="btn-secondary" 
                style={{ flex: 1 }} 
                onClick={() => { setShowAdminAuth(false); setItemToDelete(null); }}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary" 
                style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)', justifyContent: 'center' }} 
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <NewProposalModal 
        isOpen={showProposalModal}
        onClose={() => setShowProposalModal(false)}
        onSaved={() => { setShowProposalModal(false); fetchClientData(); }}
        initialClientId={clientId}
        onOpenAI={() => {
          setShowProposalModal(false);
          if (typeof window !== 'undefined' && (window as any).__openProposalAssistant) {
            (window as any).__openProposalAssistant();
          }
        }}
      />

      {/* Modal de Edición de Propuesta/Proyecto */}
      {showEditProjectModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} /> Editar Propuesta
              </h2>
              <button onClick={() => setShowEditProjectModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Título</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Monto (USD)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editForm.budget_usd}
                  onChange={e => setEditForm({ ...editForm, budget_usd: handleMoneyInput(e.target.value) })}
                  onBlur={e => setEditForm({ ...editForm, budget_usd: formatOnBlur(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Descripción / Texto de la Propuesta</label>
              <textarea 
                className="input-field" 
                style={{ width: '100%', minHeight: '300px', fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.6' }}
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>

            <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px dashed var(--primary-color)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: 600 }}>
                <Sparkles size={14} /> Refinar con Pepe (IA)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: 'Corrige la ortografía' o 'Añade una sección de garantía'..." 
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  value={aiRefinement}
                  onChange={e => setAiRefinement(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAiRefineEdit()}
                />
                <button 
                  className="btn-primary" 
                  onClick={handleAiRefineEdit}
                  disabled={refining || !aiRefinement.trim()}
                  style={{ padding: '0 1rem', minWidth: 'auto', background: 'var(--primary-color)', color: 'black' }}
                >
                  {refining ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowEditProjectModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveEdit} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición de Items (Pagos, Gastos, Compromisos) */}
      {showEditItemModal && editingItem && editItemType && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '700px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} /> Editar {editItemType === 'payment' ? 'Pago' : editItemType === 'cost' ? 'Gasto' : 'Compromiso'}
              </h2>
              <button onClick={() => { setShowEditItemModal(false); setEditingItem(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {editItemType === 'payment' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Proyecto</label>
                  <select
                    className="input-field"
                    value={editItemForm.project_id || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, project_id: e.target.value })}
                  >
                    <option value="">Seleccione proyecto</option>
                    {activeProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Fecha</label>
                  <input
                    type="date"
                    className="input-field"
                    value={editItemForm.date || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Monto (USD)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.amount_usd || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, amount_usd: handleMoneyInput(e.target.value) })}
                    onBlur={e => setEditItemForm({ ...editItemForm, amount_usd: formatOnBlur(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Referencia</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Cheque, transferencia, etc."
                    value={editItemForm.reference || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, reference: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Descripción</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.description || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, description: e.target.value })}
                  />
                </div>
              </div>
            )}

            {editItemType === 'cost' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Proyecto</label>
                  <select
                    className="input-field"
                    value={editItemForm.project_id || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, project_id: e.target.value })}
                  >
                    <option value="">Seleccione proyecto</option>
                    {activeProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Fecha</label>
                  <input
                    type="date"
                    className="input-field"
                    value={editItemForm.date || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, date: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Descripción</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.description || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Proveedor</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.provider || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, provider: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Categoría</label>
                  <select
                    className="input-field"
                    value={editItemForm.category || 'materials'}
                    onChange={e => setEditItemForm({ ...editItemForm, category: e.target.value })}
                  >
                    <option value="materials">Materiales</option>
                    <option value="labor">Mano de Obra</option>
                    <option value="equipment">Equipos</option>
                    <option value="permits">Permisos</option>
                    <option value="other">Otros</option>
                  </select>
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Cantidad</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editItemForm.quantity || 1}
                    onChange={e => setEditItemForm({ ...editItemForm, quantity: parseFloat(e.target.value) || 1 })}
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Precio Unitario (USD)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.unit_price_usd || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, unit_price_usd: handleMoneyInput(e.target.value) })}
                    onBlur={e => setEditItemForm({ ...editItemForm, unit_price_usd: formatOnBlur(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {editItemType === 'commitment' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Proyecto</label>
                  <select
                    className="input-field"
                    value={editItemForm.project_id || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, project_id: e.target.value })}
                  >
                    <option value="">Seleccione proyecto</option>
                    {activeProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Fecha</label>
                  <input
                    type="date"
                    className="input-field"
                    value={editItemForm.date || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, date: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Descripción</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.description || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Proveedor</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.provider || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, provider: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Categoría</label>
                  <select
                    className="input-field"
                    value={editItemForm.category || 'materials'}
                    onChange={e => setEditItemForm({ ...editItemForm, category: e.target.value })}
                  >
                    <option value="materials">Materiales</option>
                    <option value="labor">Mano de Obra</option>
                    <option value="equipment">Equipos</option>
                    <option value="permits">Permisos</option>
                    <option value="other">Otros</option>
                  </select>
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Cantidad</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editItemForm.quantity || 1}
                    onChange={e => setEditItemForm({ ...editItemForm, quantity: parseFloat(e.target.value) || 1 })}
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Precio Unitario (USD)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.unit_price_usd || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, unit_price_usd: handleMoneyInput(e.target.value) })}
                    onBlur={e => setEditItemForm({ ...editItemForm, unit_price_usd: formatOnBlur(e.target.value) })}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setShowEditItemModal(false); setEditingItem(null); }}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveEditItem} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
