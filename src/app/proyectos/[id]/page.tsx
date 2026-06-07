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
  PlusCircle,
  Calendar,
  FileText,
  Printer,
  Users,
  ClipboardList,
  CheckCircle,
  X,
  Archive,
  Edit3,
  Trash2,
  AlertCircle,
  Briefcase as BriefcaseIcon,
  DollarSign as DollarIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';
import { useUser } from '@/lib/UserContext';
import Image from 'next/image';

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
  created_at: string;
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

interface Commitment {
  id: string;
  description: string;
  provider?: string;
  category: string;
  quantity: number;
  unit_price_usd: number;
  amount_usd: number;
  date: string;
  payable_accounts?: { payable_payments?: { amount_usd: number }[] }[];
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
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPrintingReport, setIsPrintingReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'pagos' | 'gastos' | 'adicionales' | 'compromisos' | 'retiros' | 'detalles'>('pagos');

  // Permisos
  const { role } = useUser();
  const isViewer = role === 'viewer';
  const canEdit = !isViewer;

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showCommitmentModal, setShowCommitmentModal] = useState(false);


  // Forms state
  const [paymentForm, setPaymentForm] = useState({ amount_usd: '', reference: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [costForm, setCostForm] = useState({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
  const [extraForm, setExtraForm] = useState({ description: '', amount_usd: '' });
  const [advanceForm, setAdvanceForm] = useState({ partner_name: 'Henry Peraza', amount_usd: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [commitmentForm, setCommitmentForm] = useState({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });

  // Estado para pagos a compromisos
  const [showCommitmentPayModal, setShowCommitmentPayModal] = useState(false);
  const [commitmentToPay, setCommitmentToPay] = useState<any>(null);
  const [commitmentPayForm, setCommitmentPayForm] = useState({
    amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0]
  });

  // Estado para cerrar/archivar proyecto
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Estado para edición de gastos y compromisos
  const [editingCost, setEditingCost] = useState<Cost | null>(null);
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null);

  // Estados para edición inline (estilo clientes)
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editItemType, setEditItemType] = useState<'payment' | 'cost' | 'commitment' | null>(null);
  const [editItemForm, setEditItemForm] = useState<any>({});

  // Estados para eliminación protegida (estilo clientes)
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'payment' | 'cost' | 'extra' | 'commitment' | 'advance' } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (projectId) {
      console.log('Project ID:', projectId);
      console.log('Current Role:', role);
      console.log('Is Viewer:', isViewer);
      fetchProjectData();
    }
  }, [projectId, role, isViewer]);

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

      // Intentar query con payable_accounts; fallback si migración no aplicada
      let commitmentsData: any[] = [];
      const richCommit = await supabase.from('project_commitments').select('*, payable_accounts(id, payable_payments(id, amount_usd, description, reference, date))').eq('project_id', projectId).order('date', { ascending: false });
      if (richCommit.error) {
        const fallbackCommit = await supabase.from('project_commitments').select('*').eq('project_id', projectId).order('date', { ascending: false });
        if (!fallbackCommit.error) commitmentsData = fallbackCommit.data || [];
      } else {
        commitmentsData = richCommit.data || [];
      }

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
      setCommitments(commitmentsData);

    } catch (error: any) {
      console.error("Error fetching data:", error);
      alert(`Error al cargar datos del proyecto: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // KPIs Calculations
  const baseBudget = Number(project?.budget_usd || 0);
  const totalExtra = extras.reduce((sum, e) => sum + (Number(e.amount_usd) || 0), 0);
  const totalAdvances = advances.reduce((sum, a) => sum + (Number(a.amount_usd) || 0), 0);
  const totalCommitments = commitments.reduce((sum, c) => sum + (Number(c.quantity || 0) * (Number(c.unit_price_usd) || 0)), 0);
  const totalBudget = baseBudget + totalExtra;
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount_usd) || 0), 0);
  const balanceDue = totalBudget - totalPaid;
  const totalCosts = costs.reduce((sum, c) => sum + (Number(c.quantity || 0) * (Number(c.unit_price_usd) || 0)), 0);
  const estimatedProfit = totalBudget - totalCosts - totalCommitments;
  const netProfit = estimatedProfit - totalAdvances;

  // Partner advances calculation
  const partnerAdvances: { [key: string]: number } = {};
  advances.forEach(a => {
    const partner = a.partner_name;
    if (!partnerAdvances[partner]) partnerAdvances[partner] = 0;
    partnerAdvances[partner] += (Number(a.amount_usd) || 0);
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

  function openEditCommitment(c: Commitment) {
    setEditingCommitment(c);
    setCommitmentForm({
      description: c.description,
      provider: c.provider || '',
      category: c.category,
      quantity: c.quantity,
      unit_price_usd: c.unit_price_usd.toString(),
      date: c.date || new Date().toISOString().split('T')[0]
    });
    setShowCommitmentModal(true);
  }

  async function handleDeleteCommitment(id: string) {
    if (!confirm('¿Eliminar este compromiso? Esta acción no se puede deshacer.')) return;
    const { error } = await supabase.from('project_commitments').delete().eq('id', id);
    if (error) alert('Error al eliminar compromiso: ' + error.message);
    else fetchProjectData();
  }

  const initiateDelete = (id: string, type: 'payment' | 'cost' | 'extra' | 'commitment' | 'advance') => {
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
      const tableMap: Record<string, string> = {
        payment: 'project_payments', cost: 'project_costs',
        extra: 'project_extras', commitment: 'project_commitments', advance: 'partner_advances'
      };
      const { error } = await supabase.from(tableMap[itemToDelete.type]).delete().eq('id', itemToDelete.id);
      if (error) throw error;
      setShowAdminAuth(false);
      setItemToDelete(null);
      fetchProjectData();
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

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
        updateData = { amount_usd: parseCurrency(editItemForm.amount_usd), date: editItemForm.date, reference: editItemForm.reference, description: editItemForm.description };
      } else if (editItemType === 'cost') {
        table = 'project_costs';
        const up = parseCurrency(editItemForm.unit_price_usd);
        updateData = { description: editItemForm.description, provider: editItemForm.provider, category: editItemForm.category, quantity: editItemForm.quantity, unit_price_usd: up, total_usd: editItemForm.quantity * up, date: editItemForm.date };
      } else if (editItemType === 'commitment') {
        table = 'project_commitments';
        const up = parseCurrency(editItemForm.unit_price_usd);
        const amount_usd = editItemForm.quantity * up;
        updateData = { description: editItemForm.description, provider: editItemForm.provider, category: editItemForm.category, quantity: editItemForm.quantity, unit_price_usd: up, amount_usd: amount_usd, date: editItemForm.date };
        
        const { error } = await supabase.from(table).update(updateData).eq('id', editingItem.id);
        if (error) throw error;
        
        await supabase.from('payable_accounts').update({
          name: editItemForm.provider || 'Proveedor sin nombre',
          total_amount_usd: amount_usd,
          description: editItemForm.description
        }).eq('commitment_id', editingItem.id);
        
        setShowEditItemModal(false);
        setEditingItem(null);
        setEditItemType(null);
        fetchProjectData();
        return; // Return early since we already handled the state updates
      }
      const { error } = await supabase.from(table).update(updateData).eq('id', editingItem.id);
      if (error) throw error;
      setShowEditItemModal(false);
      setEditingItem(null);
      setEditItemType(null);
      fetchProjectData();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

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

  async function handleAddCommitment(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      description: commitmentForm.description,
      provider: commitmentForm.provider,
      category: commitmentForm.category,
      quantity: commitmentForm.quantity,
      unit_price_usd: parseCurrency(String(commitmentForm.unit_price_usd)),
      amount_usd: commitmentForm.quantity * parseCurrency(String(commitmentForm.unit_price_usd)),
      date: commitmentForm.date
    };

    let errorToReport = null;

    if (editingCommitment) {
      const { error } = await supabase.from('project_commitments').update(data).eq('id', editingCommitment.id);
      errorToReport = error;
      
      if (!error) {
        const { data: updatedPayables, error: updatePayableErr } = await supabase.from('payable_accounts').update({
          name: data.provider || 'Proveedor sin nombre',
          total_amount_usd: data.amount_usd,
          description: data.description
        }).eq('commitment_id', editingCommitment.id).select();

        if (!updatePayableErr && (!updatedPayables || updatedPayables.length === 0)) {
          let payableType = 'otro';
          if (data.category === 'materials') payableType = 'proveedor';
          else if (data.category === 'labor') payableType = 'obrero';
          else if (data.category === 'equipment') payableType = 'alquiler';
          else if (data.category === 'subcontract') payableType = 'subcontratista';

          await supabase.from('payable_accounts').insert([{
            name: data.provider || 'Proveedor sin nombre',
            type: payableType,
            total_amount_usd: data.amount_usd,
            project_id: projectId,
            commitment_id: editingCommitment.id,
            description: data.description
          }]);
        }
      }
    } else {
      const { data: newCommitment, error } = await supabase.from('project_commitments').insert([{ project_id: projectId, ...data }]).select().single();
      errorToReport = error;
      
      if (!error && newCommitment) {
        let payableType = 'otro';
        if (data.category === 'materials') payableType = 'proveedor';
        else if (data.category === 'labor') payableType = 'obrero';
        else if (data.category === 'equipment') payableType = 'alquiler';
        else if (data.category === 'subcontract') payableType = 'subcontratista';

        const { error: payableError } = await supabase.from('payable_accounts').insert([{
          name: data.provider || 'Proveedor sin nombre',
          type: payableType,
          total_amount_usd: data.amount_usd,
          project_id: projectId,
          commitment_id: newCommitment.id,
          description: data.description
        }]);
        
        if (payableError) {
          console.error('Error creating payable account:', payableError);
          alert(`Compromiso creado pero falló al generar la cuenta por pagar: ${payableError.message}. \n\nAsegúrate de haber ejecutado las migraciones SQL en Supabase.`);
        }
      }
    }

    if (!errorToReport) {
      setShowCommitmentModal(false);
      setEditingCommitment(null);
      setCommitmentForm({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    } else {
      alert(`Error al guardar compromiso: ${errorToReport.message}`);
    }
  }

  async function handleCommitmentPayment(e: React.FormEvent) {
    e.preventDefault();
    if (isViewer || !commitmentToPay) return;

    const monto = parseFloat(commitmentPayForm.amount_usd) || 0;
    if (monto <= 0) return alert('El monto debe ser mayor a 0');

    try {
      let payableAccountId = commitmentToPay.payable_accounts?.[0]?.id;

      if (!payableAccountId) {
        let payableType = 'otro';
        if (commitmentToPay.category === 'materials') payableType = 'proveedor';
        else if (commitmentToPay.category === 'labor') payableType = 'obrero';
        else if (commitmentToPay.category === 'equipment') payableType = 'alquiler';
        else if (commitmentToPay.category === 'subcontract') payableType = 'subcontratista';

        const { data: newPayable, error: payableError } = await supabase.from('payable_accounts').insert([{
          name: commitmentToPay.provider || 'Proveedor sin nombre',
          type: payableType,
          total_amount_usd: commitmentToPay.amount_usd,
          project_id: projectId,
          commitment_id: commitmentToPay.id,
          description: commitmentToPay.description
        }]).select().single();

        if (payableError) throw new Error(`Error al crear la cuenta por pagar vinculada: ${payableError.message}`);
        payableAccountId = newPayable.id;
        commitmentToPay.payable_accounts = [{ id: payableAccountId, payable_payments: [] }];
      }

      // 1. Insert into payable_payments
      const { error: payError } = await supabase.from('payable_payments').insert([{
        payable_account_id: payableAccountId,
        amount_usd: monto,
        description: commitmentPayForm.description,
        reference: commitmentPayForm.reference,
        date: commitmentPayForm.date
      }]);
      if (payError) throw new Error(`Error al registrar abono en la cuenta por pagar: ${payError.message}`);

      // 2. Insert into project_costs
      const { error: costError } = await supabase.from('project_costs').insert([{
        project_id: projectId,
        description: `Abono: ${commitmentToPay.provider || 'Proveedor'} - ${commitmentPayForm.description}`,
        provider: commitmentToPay.provider || 'N/A',
        category: commitmentToPay.category, // using original category
        quantity: 1,
        unit_price_usd: monto,
        total_usd: monto,
        date: commitmentPayForm.date
      }]);
      if (costError) throw new Error(`Error al registrar como gasto: ${costError.message}`);

      // 3. Delete commitment if fully paid
      const previouslyPaid = commitmentToPay.payable_accounts?.[0]?.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
      const totalAmount = Number(commitmentToPay.amount_usd);
      const remainingBalance = totalAmount - previouslyPaid - monto;

      // Usamos una tolerancia de 0.01 por problemas de precision en decimales
      if (remainingBalance <= 0.01) {
        // Update payable account to 'paid' status
        await supabase.from('payable_accounts')
          .update({ status: 'paid' })
          .eq('id', payableAccountId);
        
        // Delete the commitment
        await supabase.from('project_commitments')
          .delete()
          .eq('id', commitmentToPay.id);
      }

      setShowCommitmentPayModal(false);
      setCommitmentToPay(null);
      setCommitmentPayForm({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function handlePrintReport() {
    setIsPrintingReport(true);
    setTimeout(() => {
      window.print();
      setIsPrintingReport(false);
    }, 500);
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
      <div className="animate-fade hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
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
          <button
            className="btn-primary"
            onClick={handlePrintReport}
            title="Imprimir Reporte Financiero"
            style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
          >
            <FileText size={18} /> Imprimir Reporte
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

      {/* ACTION BAR */}
      {!isViewer && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'nowrap', overflowX: 'auto', justifyContent: 'flex-start', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {/* 1. MONTO DEL PROYECTO */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <DollarSign size={14} /> <span>Monto del Proyecto</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${totalBudget.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contrato + Adicionales</div>
        </div>

        {/* 2. TOTAL COBRADO */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingUp size={14} /> <span>Total Cobrado</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)' }}>
            ${totalPaid.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pagos recibidos</div>
        </div>

        {/* 3. SALDO PENDIENTE */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Wallet size={14} /> <span style={{ fontWeight: 700 }}>Saldo Pendiente</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-color)' }}>
            ${balanceDue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Por cobrar al cliente</div>
        </div>

        {/* 4. COSTOS TOTALES */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(239,68,68,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingDown size={14} /> <span>Costos Totales</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--danger)' }}>
            ${totalCosts.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gastos registrados</div>
        </div>

        {/* 5. COMPROMISOS */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <AlertCircle size={14} /> <span>Compromisos</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${totalCommitments.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gastos futuros</div>
        </div>

        {/* 6. GANANCIA FINAL */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingUp size={14} /> <span style={{ fontWeight: 700 }}>Ganancia Final</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${estimatedProfit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monto − Gastos − Compromisos</div>
        </div>

        {/* 7. RETIRO DE SOCIOS */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(139,92,246,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(139,92,246,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#8b5cf6', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Users size={14} /> <span style={{ fontWeight: 700 }}>Retiro de Socios</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${totalAdvances.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Adelantos entregados</div>
        </div>

        {/* 8. GANANCIA DISPONIBLE */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(139,92,246,0.12) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(139,92,246,0.6)', borderWidth: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a78bfa', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingUp size={14} /> <span style={{ fontWeight: 700 }}>Ganancia Disponible</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${netProfit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ganancia Final − Retiros</div>
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem', height: '100%' }}>
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', paddingBottom: '0.5rem', overflowX: 'auto' }}>
          <button
            className={`btn-secondary ${activeTab === 'pagos' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'pagos' ? 'var(--accent-blue)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('pagos')}
          >Pagos</button>
          <button
            className={`btn-secondary ${activeTab === 'gastos' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'gastos' ? 'var(--danger)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('gastos')}
          >Gastos</button>
          <button
            className={`btn-secondary ${activeTab === 'adicionales' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'adicionales' ? 'var(--primary-color)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('adicionales')}
          >Adicionales</button>
          <button
            className={`btn-secondary ${activeTab === 'compromisos' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'compromisos' ? 'var(--primary-color)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('compromisos')}
          >Compromisos</button>
          <button
            className={`btn-secondary ${activeTab === 'retiros' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'retiros' ? '#8b5cf6' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('retiros')}
          >Retiro de Socios</button>
          <button
            className={`btn-secondary ${activeTab === 'detalles' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'detalles' ? 'var(--accent-blue)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('detalles')}
          >Detalles</button>
        </div>

        {/* TAB: PAGOS */}
        {activeTab === 'pagos' && (
          <div className="animate-fade">
            {payments.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay pagos registrados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO (USD)</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.date}</td>
                      <td style={{ padding: '1rem' }}>{p.description}<br/><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ref: {p.reference || 'N/A'}</span></td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>+ ${Number(p.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }} onClick={() => initiateEditItem(p, 'payment')} title="Editar pago"><Edit3 size={14} /></button>)}
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(p.id, 'payment')}><Trash2 size={14} /></button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: GASTOS */}
        {activeTab === 'gastos' && (
          <div className="animate-fade">
            {costs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay gastos registrados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>PROVEEDOR</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>CATEGORÍA</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>TOTAL (USD)</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem' }}>{c.description}<br/><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.quantity} x ${Number(c.unit_price_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.provider || 'N/A'}</td>
                      <td style={{ padding: '1rem' }}>{c.category === 'materials' ? 'Materiales' : c.category === 'labor' ? 'Mano de Obra' : c.category === 'equipment' ? 'Equipos' : c.category === 'permits' ? 'Permisos' : 'Otros'}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>- ${Number(c.quantity * c.unit_price_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }} onClick={() => initiateEditItem(c, 'cost')} title="Editar gasto"><Edit3 size={14} /></button>)}
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(c.id, 'cost')}><Trash2 size={14} /></button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: ADICIONALES */}
        {activeTab === 'adicionales' && (
          <div className="animate-fade">
            {extras.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay trabajos adicionales registrados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO EXTRA (USD)</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {extras.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem' }}>{e.description}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>+ ${Number(e.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(e.id, 'extra')}><Trash2 size={14} /></button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: COMPROMISOS */}
        {activeTab === 'compromisos' && (
          <div className="animate-fade">
            {commitments.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay compromisos (gastos por ejecutar) registrados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>PROVEEDOR</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>ESTADO</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>SALDO (USD)</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map(c => {
                    const paid = c.payable_accounts?.[0]?.payable_payments?.reduce((s, p) => s + Number(p.amount_usd), 0) || 0;
                    const balance = Number(c.amount_usd) - paid;
                    const isPaid = paid >= Number(c.amount_usd);
                    
                    return (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.date}</td>
                      <td style={{ padding: '1rem' }}>
                        {c.description}<br/>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.quantity} x ${Number(c.unit_price_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {c.payable_accounts?.[0]?.payable_payments && c.payable_accounts[0].payable_payments.length > 0 && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderLeft: '2px solid var(--primary-color)', paddingLeft: '0.5rem' }}>
                            <div style={{ fontWeight: '600', marginBottom: '0.2rem' }}>Historial de Abonos:</div>
                            {c.payable_accounts[0].payable_payments.map((p: any) => (
                              <div key={p.id} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.1rem' }}>
                                <span>• {p.date || 'Sin fecha'}:</span>
                                <span style={{ color: 'white' }}>${Number(p.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                {p.reference && <span>(Ref: {p.reference})</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{c.provider || 'N/A'}</td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {paid > 0 ? (
                          <div style={{ fontSize: '0.8rem' }}>
                            <div style={{ color: isPaid ? 'var(--success)' : 'var(--warning)', fontWeight: 'bold' }}>{isPaid ? 'Pagado' : 'Abonado'}</div>
                            <div style={{ color: 'var(--text-muted)' }}>${paid.toLocaleString('es-VE', { minimumFractionDigits: 2 })} / ${Number(c.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 'bold', padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>Pendiente</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>- ${Number(balance).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {!isViewer && balance > 0 && (
                          <button 
                            className="btn-primary" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} 
                            onClick={() => {
                              setCommitmentToPay(c);
                              setCommitmentPayForm({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
                              setShowCommitmentPayModal(true);
                            }} 
                            title="Abonar al compromiso"
                          >
                            Abonar
                          </button>
                        )}
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }} onClick={() => initiateEditItem(c, 'commitment')} title="Editar compromiso"><Edit3 size={14} /></button>)}
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(c.id, 'commitment')}><Trash2 size={14} /></button>)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: RETIRO DE SOCIOS */}
        {activeTab === 'retiros' && (
          <div className="animate-fade">
            {(() => {
              const share = estimatedProfit / 2;
              const henryAmt = advances.filter(a => a.partner_name === 'Henry Peraza').reduce((s, a) => s + Number(a.amount_usd), 0);
              const losberAmt = advances.filter(a => a.partner_name === 'Losbers Perez').reduce((s, a) => s + Number(a.amount_usd), 0);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                  {[{ name: 'Henry Peraza', amt: henryAmt }, { name: 'Losbers Perez', amt: losberAmt }].map(partner => {
                    const saldo = share - partner.amt;
                    return (
                      <div key={partner.name} className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg,rgba(139,92,246,0.06) 0%,rgba(0,0,0,0) 100%)', borderColor: 'rgba(139,92,246,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#a78bfa', fontSize: '0.9rem' }}>{partner.name.charAt(0)}</div>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '1rem' }}>{partner.name}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(139,92,246,0.08)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#a78bfa' }}>Le corresponde (50%)</span>
                            <span style={{ fontWeight: 700, color: '#a78bfa' }}>${share.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Retiros realizados</span>
                            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>−${partner.amt.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.7rem 0.8rem', background: saldo >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: '8px', border: `1px solid ${saldo >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>Saldo disponible</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>${Math.abs(saldo).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{saldo < 0 ? ' (excedido)' : ''}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {advances.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay retiros registrados.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>SOCIO</th>
                    <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO (USD)</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{a.date}</td>
                      <td style={{ padding: '1rem', fontWeight: 'bold' }}>{a.partner_name}</td>
                      <td style={{ padding: '1rem' }}>{a.description || 'Sin descripción'}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#a78bfa' }}>${Number(a.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(a.id, 'advance')}><Trash2 size={14} /></button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: DETALLES */}
        {activeTab === 'detalles' && (
          <div className="animate-fade">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <h3 style={{ marginBottom: '1rem' }}>Propuesta Original</h3>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {project.description || 'Sin descripción detallada.'}
                </div>
                <div style={{ marginTop: '1rem', fontWeight: 'bold', fontSize: '1.1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                  Presupuesto Base: ${baseBudget.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
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
                      ) : extras.map(e => (
                        <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '1rem' }}>{e.description}</td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-blue)' }}>+ ${Number(e.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '1rem', fontWeight: 'bold', textAlign: 'right' }}>Total Adicionales:</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-blue)' }}>${totalExtra.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
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
                          <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>${profitPerPartner.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '1rem', textAlign: 'right', color: '#a78bfa' }}>${totalRetired.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: availableBalance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {availableBalance < 0 ? '-' : ''}${Math.abs(availableBalance).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      </div>
    </div>

        {/* Modales de Formulario */}
        
        {/* Modal de Abono a Compromiso */}
        {showCommitmentPayModal && commitmentToPay && (
          <div className="modal-overlay">
            <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={24} color="var(--success)" /> Registrar Abono a Compromiso
              </h2>
              
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Proveedor:</span>
                  <span style={{ fontWeight: 'bold' }}>{commitmentToPay.provider || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Compromiso:</span>
                  <span style={{ fontWeight: 'bold' }}>${Number(commitmentToPay.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Saldo Pendiente:</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>
                    ${(Number(commitmentToPay.amount_usd) - (commitmentToPay.payable_accounts?.[0]?.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <form onSubmit={handleCommitmentPayment}>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Monto a Abonar (USD)</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={commitmentPayForm.amount_usd}
                      onChange={e => setCommitmentPayForm({...commitmentPayForm, amount_usd: handleMoneyInput(e.target.value)})}
                      onBlur={e => setCommitmentPayForm({...commitmentPayForm, amount_usd: formatOnBlur(e.target.value)})}
                      placeholder="Ej. 1500.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Concepto / Descripción</label>
                    <input type="text" required className="input-field" value={commitmentPayForm.description} onChange={e => setCommitmentPayForm({...commitmentPayForm, description: e.target.value})} placeholder="Ej. Pago primera parte" />
                  </div>
                  <div className="form-group">
                    <label>Referencia / Recibo (Opcional)</label>
                    <input type="text" className="input-field" value={commitmentPayForm.reference} onChange={e => setCommitmentPayForm({...commitmentPayForm, reference: e.target.value})} placeholder="Ej. Zelle 1234, Recibo 42" />
                  </div>
                  <div className="form-group">
                    <label>Fecha de Abono</label>
                    <input type="date" required className="input-field" value={commitmentPayForm.date} onChange={e => setCommitmentPayForm({...commitmentPayForm, date: e.target.value})} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowCommitmentPayModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary">Confirmar Abono</button>
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
                Total: ${(costForm.quantity * parseCurrency(String(costForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits: 2})}
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

      {showCommitmentModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>{editingCommitment ? 'Editar Compromiso' : 'Registrar Compromiso'}</h2>
            <form onSubmit={handleAddCommitment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                   <input 
                     type="text" 
                     required 
                     className="input-field" 
                     value={commitmentForm.unit_price_usd} 
                     onChange={e => setCommitmentForm({...commitmentForm, unit_price_usd: handleMoneyInput(e.target.value)})} 
                     onBlur={e => setCommitmentForm({...commitmentForm, unit_price_usd: formatOnBlur(e.target.value)})}
                   />
                 </div>
              </div>
              <div style={{ marginTop: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                 Total: ${(commitmentForm.quantity * parseCurrency(String(commitmentForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits: 2})}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowCommitmentModal(false); setEditingCommitment(null); setCommitmentForm({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] }); }}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{editingCommitment ? 'Guardar Cambios' : 'Guardar Compromiso'}</button>
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

      {/* REPORTE DE IMPRESIÓN (Estructuralmente igual al reporte de cliente) */}
      <div className="show-only-on-print" style={{ display: 'none', color: 'black', background: 'white', padding: '1rem', width: '100%' }}>
        {/* Encabezado con Logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <Image src="/logo_3d.png" alt="Logo" width={180} height={80} style={{ objectFit: 'contain' }} />
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>ESTADO DE CUENTA DEL PROYECTO</h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Fecha de Emisión: {new Date().toLocaleDateString('es-VE')}</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Propuesta: #{project.proposal_number || 'N/A'}</p>
          </div>
        </div>

        {/* Datos del Proyecto */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '16px' }}>PROYECTO: {project.title}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '12px' }}>
            <div><strong>Cliente:</strong> {project.clients?.name}</div>
            <div><strong>Presupuesto Original:</strong> ${formatCurrency(project.budget_usd)}</div>
            <div><strong>Estado Actual:</strong> {project.status === 'proposal' ? 'PROPUESTA' : project.status === 'in_progress' ? 'EN EJECUCIÓN' : 'COMPLETADO'}</div>
            <div><strong>Fecha de Inicio:</strong> {new Date(project.created_at).toLocaleDateString('es-VE')}</div>
          </div>
        </div>

        {/* Resumen Financiero (KPIs) */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>RESUMEN FINANCIERO</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '14px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa', width: '50%' }}><strong>Total Presupuestado (con adicionales):</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', width: '50%', textAlign: 'right' }}>${formatCurrency(totalBudget)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Total Cobrado:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right' }}>${formatCurrency(totalPaid)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Saldo Pendiente:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: balanceDue > 0 ? '#ff9800' : '#28a745' }}>${formatCurrency(balanceDue)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Gastos Ejecutados:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalCosts)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Compromisos Pendientes:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalCommitments)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Ganancia Estimada:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#28a745' }}>${formatCurrency(netProfit + totalAdvances)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Total Retiro de Socios:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalAdvances)}</td>
            </tr>
            <tr style={{ background: '#e8f5e9' }}>
              <td style={{ padding: '0.7rem', border: '2px solid #28a745', fontWeight: 'bold' }}><strong>GANANCIA NETA POR RETIRAR:</strong></td>
              <td style={{ padding: '0.7rem', border: '2px solid #28a745', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20', fontSize: '15px' }}>${formatCurrency(netProfit)}</td>
            </tr>
          </tbody>
        </table>

        {/* Detalle de Pagos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>1. HISTORIAL DE PAGOS RECIBIDOS</h3>
        {payments.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#555', marginBottom: '1.5rem' }}>No hay pagos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO / REFERENCIA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>MONTO (USD)</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.date}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.description} {p.reference ? `(Ref: ${p.reference})` : ''}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(p.amount_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Cobrado:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(totalPaid)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Detalle de Gastos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>2. RELACIÓN DE GASTOS EJECUTADOS</h3>
        {costs.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#555', marginBottom: '1.5rem' }}>No hay gastos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROVEEDOR</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>CANT.</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL (USD)</th>
              </tr>
            </thead>
            <tbody>
              {costs.map(c => (
                <tr key={c.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.date || 'N/A'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.provider || 'N/A'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.description}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>{c.quantity}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(c.total_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={4} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Gastado:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalCosts)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Detalle de Compromisos */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>3. COMPROMISOS (GASTOS POR EJECUTAR)</h3>
        {commitments.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#555', marginBottom: '1.5rem' }}>No hay compromisos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROVEEDOR</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL PENDIENTE (USD)</th>
              </tr>
            </thead>
            <tbody>
              {commitments.map(c => (
                <tr key={c.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.date}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.provider || 'N/A'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.description}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(c.amount_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Compromisos:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalCommitments)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Detalle de Retiros */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>4. RETIRO DE SOCIOS</h3>
        {advances.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#555', marginBottom: '1.5rem' }}>No hay retiros registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>SOCIO</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>MONTO (USD)</th>
              </tr>
            </thead>
            <tbody>
              {advances.map(a => (
                <tr key={a.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{a.date}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', fontWeight: 'bold' }}>{a.partner_name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(a.amount_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL RETIRADO:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalAdvances)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '3rem', textAlign: 'center', fontSize: '10px', color: '#777' }}>
          <p>Documento generado por el Sistema Administrativo de P&P Construye</p>
        </div>
      </div>

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
          @page { 
            margin: 1cm;
            size: auto;
          }
        }
      `}} />

      {/* MODAL: AUTENTICACIÓN ADMIN PARA ELIMINAR */}
      {showAdminAuth && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%' }}>
            <h3 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>🔐 Acción Protegida</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Esta acción requiere autorización de administrador. Ingrese la contraseña de sistema para continuar.
            </p>
            <div>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Contraseña de Administrador</label>
              <input
                type="password"
                className="input-field"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmDelete()}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            {authError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{authError}</p>}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAdminAuth(false); setAdminPassword(''); setAuthError(''); }}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Eliminando...' : 'Confirmar Eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDICIÓN INLINE */}
      {showEditItemModal && editingItem && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '520px', width: '90%' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>
              {editItemType === 'payment' ? '✏️ Editar Pago' : editItemType === 'cost' ? '✏️ Editar Gasto' : '✏️ Editar Compromiso'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {editItemType === 'payment' && (
                <>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                    <input type="text" className="input-field" value={editItemForm.amount_usd} onChange={e => setEditItemForm({...editItemForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setEditItemForm({...editItemForm, amount_usd: formatOnBlur(e.target.value)})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                    <input type="text" className="input-field" value={editItemForm.description} onChange={e => setEditItemForm({...editItemForm, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Referencia</label>
                    <input type="text" className="input-field" value={editItemForm.reference || ''} onChange={e => setEditItemForm({...editItemForm, reference: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                    <input type="date" className="input-field" value={editItemForm.date} onChange={e => setEditItemForm({...editItemForm, date: e.target.value})} />
                  </div>
                </>
              )}
              {(editItemType === 'cost' || editItemType === 'commitment') && (
                <>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
                    <input type="text" className="input-field" value={editItemForm.description} onChange={e => setEditItemForm({...editItemForm, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor</label>
                    <input type="text" className="input-field" value={editItemForm.provider || ''} onChange={e => setEditItemForm({...editItemForm, provider: e.target.value})} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Cantidad</label>
                      <input type="number" className="input-field" value={editItemForm.quantity} onChange={e => setEditItemForm({...editItemForm, quantity: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>P. Unitario (USD)</label>
                      <input type="text" className="input-field" value={editItemForm.unit_price_usd} onChange={e => setEditItemForm({...editItemForm, unit_price_usd: handleMoneyInput(e.target.value)})} onBlur={e => setEditItemForm({...editItemForm, unit_price_usd: formatOnBlur(e.target.value)})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                    <input type="date" className="input-field" value={editItemForm.date} onChange={e => setEditItemForm({...editItemForm, date: e.target.value})} />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowEditItemModal(false); setEditingItem(null); setEditItemType(null); }}>Cancelar</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={handleSaveEditItem}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
