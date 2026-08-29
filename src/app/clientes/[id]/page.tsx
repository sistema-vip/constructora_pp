'use client';

import React, { useState, useEffect } from 'react';
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
  Loader2,
  Archive,
  ChevronDown,
  ChevronRight,
  Eye,
  Wallet,
  RotateCcw,
  Check,
  Ban,
  AlertTriangle,
  BarChart3,
  GitMerge
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';
import NewProposalModal from '@/components/NewProposalModal';
import TelegramPendingPanel from '@/components/TelegramPendingPanel';
import { useUser } from '@/lib/UserContext';
import { useAdminAction } from '@/lib/useAdminAction';

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
  archived_at?: string | null;
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
  const [authAction, setAuthAction] = useState<'delete' | 'edit_project' | 'approve_proposal' | 'reject_proposal'>('delete');
  const [projectToUpdateStatus, setProjectToUpdateStatus] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'project' | 'payment' | 'cost' | 'extra' | 'commitment' | 'advance' | 'payable_payment' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: '', budget_usd: '', description: '' });
  const [aiRefinement, setAiRefinement] = useState('');
  const [refining, setRefining] = useState(false);
  const { role } = useUser();
  const { isObserver, isClient, isAdmin, isSales, canEdit, canDelete } = useAdminAction();
  const isViewer = isObserver || isClient; // Both act as viewers for financial transactions

  // Estados para Edición del Cliente
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editClientForm, setEditClientForm] = useState({
    name: '',
    company_name: '',
    tax_id: '',
    phone: '',
    email: '',
    address: '',
    status: 'active'
  });
  const [savingClientEdit, setSavingClientEdit] = useState(false);

  // Estados para Eliminación del Cliente con Validación de Pendientes
  const [showDeleteClientModal, setShowDeleteClientModal] = useState(false);
  const [checkingDeletePending, setCheckingDeletePending] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [clientPendingSummary, setClientPendingSummary] = useState<{
    hasPending: boolean;
    proposalsCount: number;
    activeProjectsCount: number;
    historyProjectsCount: number;
    paymentsCount: number;
    costsCount: number;
    commitmentsCount: number;
    pendingTelegramCount: number;
  } | null>(null);

  const handleOpenEditClient = () => {
    if (!canEdit) return alert('Solo administradores pueden editar datos del cliente.');
    if (!client) return;
    setEditClientForm({
      name: client.name || '',
      company_name: client.company_name || '',
      tax_id: client.tax_id || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      status: client.status || 'active'
    });
    setShowEditClientModal(true);
  };

  const handleSaveEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !client) return;
    setSavingClientEdit(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .update({
          name: editClientForm.name.trim(),
          company_name: editClientForm.company_name.trim() || null,
          tax_id: editClientForm.tax_id.trim() || null,
          phone: editClientForm.phone.trim() || null,
          email: editClientForm.email.trim() || null,
          address: editClientForm.address.trim() || null,
          status: editClientForm.status || 'active'
        })
        .eq('id', clientId)
        .select()
        .single();

      if (error) throw error;
      setClient(data);
      setShowEditClientModal(false);
    } catch (err: any) {
      alert('Error al guardar datos del cliente: ' + err.message);
    } finally {
      setSavingClientEdit(false);
    }
  };

  const handleInitiateDeleteClient = async () => {
    if (!canDelete) return alert('Solo administradores pueden eliminar clientes.');
    setShowDeleteClientModal(true);
    setCheckingDeletePending(true);
    setClientPendingSummary(null);

    try {
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select(`
          id,
          title,
          status,
          proposal_number,
          project_payments(id),
          project_costs(id),
          project_commitments(id)
        `)
        .eq('client_id', clientId);

      if (projErr) throw projErr;

      const prjs = projectsData || [];
      const prjIds = prjs.map(p => p.id);

      let pendingTelegramCount = 0;
      if (prjIds.length > 0) {
        const { count } = await supabase
          .from('telegram_pending_entries')
          .select('*', { count: 'exact', head: true })
          .in('project_id', prjIds)
          .eq('status', 'pending');
        pendingTelegramCount = count || 0;
      }

      const proposals = prjs.filter(p => p.status === 'proposal');
      const activePrjs = prjs.filter(p => p.status === 'in_progress');
      const historyPrjs = prjs.filter(p => p.status === 'completed' || p.status === 'cancelled');

      const paymentsCount = prjs.reduce((acc, p) => acc + (p.project_payments?.length || 0), 0);
      const costsCount = prjs.reduce((acc, p) => acc + (p.project_costs?.length || 0), 0);
      const commitmentsCount = prjs.reduce((acc, p) => acc + (p.project_commitments?.length || 0), 0);

      const hasPending = prjs.length > 0 || pendingTelegramCount > 0;

      setClientPendingSummary({
        hasPending,
        proposalsCount: proposals.length,
        activeProjectsCount: activePrjs.length,
        historyProjectsCount: historyPrjs.length,
        paymentsCount,
        costsCount,
        commitmentsCount,
        pendingTelegramCount
      });
    } catch (err: any) {
      alert('Error verificando registros del cliente: ' + err.message);
      setShowDeleteClientModal(false);
    } finally {
      setCheckingDeletePending(false);
    }
  };

  const handleConfirmDeleteClient = async () => {
    if (!canDelete || clientPendingSummary?.hasPending) return;
    setDeletingClient(true);
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) throw error;
      router.push('/clientes');
    } catch (err: any) {
      alert('Error al eliminar cliente: ' + err.message);
      setDeletingClient(false);
    }
  };

  const isActionDisabledForSales = (projectId: string) => {
    if (!isSales) return false;
    const p = projects.find(x => x.id === projectId);
    return p ? p.status !== 'proposal' : true;
  };
  
  // Tabs State
  const [activeTab, setActiveTab] = useState<'proyectos' | 'pagos' | 'gastos' | 'adicionales' | 'cuentas_pagar' | 'retiros' | 'propuestas' | 'historial'>('proyectos');

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
  const [showCommitmentPayModal, setShowCommitmentPayModal] = useState(false);
  const [commitmentToPay, setCommitmentToPay] = useState<any>(null);
  const [commitmentPayMode, setCommitmentPayMode] = useState<'abono' | 'total'>('abono');
  const [selectedCommitmentForDetails, setSelectedCommitmentForDetails] = useState<any>(null);
  const [commitmentPayForm, setCommitmentPayForm] = useState({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
  
  // Cuentas por Pagar state
  const [clientPayableAccounts, setClientPayableAccounts] = useState<any[]>([]);
  const [payableExpandedRows, setPayableExpandedRows] = useState<Set<string>>(new Set());
  const [showPayablePaymentModal, setShowPayablePaymentModal] = useState(false);
  const [payablePaymentMode, setPayablePaymentMode] = useState<'abono' | 'total'>('abono');
  const [selectedAccountForPayablePayment, setSelectedAccountForPayablePayment] = useState<any>(null);
  const [payablePaymentForm, setPayablePaymentForm] = useState({
    payable_account_id: '', amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0]
  });

  // Estados para edición de items
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editItemType, setEditItemType] = useState<'payment' | 'cost' | 'extra' | 'commitment' | null>(null);
  const [editItemForm, setEditItemForm] = useState<any>({});

  // Estados para Unificar Proyectos
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryProjectId, setPrimaryProjectId] = useState('');
  const [secondaryProjectId, setSecondaryProjectId] = useState('');
  const [merging, setMerging] = useState(false);

  // Estados para Reapertura de Proyectos
  const [showReopenAuth, setShowReopenAuth] = useState(false);
  const [reopenPassword, setReopenPassword] = useState('');
  const [reopenError, setReopenError] = useState('');
  const [projectToReopen, setProjectToReopen] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  // Estado del modal de selección de impresión
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printMode, setPrintMode] = useState<'client-statement' | 'partner-report'>('client-statement');
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const openPrintSelection = (mode: 'client-statement' | 'partner-report') => {
    setPrintMode(mode);
    const active = projects.filter(p => p.status === 'in_progress' || p.status === 'completed');
    setSelectedProjectIds(new Set(active.map(p => p.id)));
    setShowPrintModal(true);
  };

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
      let projectsData: any[] | null = null;
      const { data: richData, error: richError } = await supabase
        .from('projects')
        .select('*, project_payments(*), project_costs(*), project_extras(*), project_commitments(*, payable_accounts(id, status, payable_payments(amount_usd))), partner_advances(*)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (richError) {
        // Fallback: query sin payable_accounts
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('projects')
          .select('*, project_payments(*), project_costs(*), project_extras(*), project_commitments(*), partner_advances(*)')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });
        if (fallbackError) throw fallbackError;
        projectsData = fallbackData;
      } else {
        projectsData = richData;
      }

      setProjects(projectsData || []);
      
      if (projectsData && projectsData.length > 0) {
        const projectIds = projectsData.map(p => p.id);
        
        // Cargar cuentas por pagar de estos proyectos
        const { data: accountsData } = await supabase
          .from('payable_accounts')
          .select('*, project:projects(title, proposal_number), payable_payments(*)')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false });
        
        const loadedPayables = accountsData || [];
        setClientPayableAccounts(loadedPayables);

        // Auto-heal en segundo plano
        const accountsToHeal = loadedPayables.filter(a => {
          if (a.status !== 'active') return false;
          const paid = a.payable_payments?.reduce((s: number, p: any) => s + Number(p.amount_usd || 0), 0) || 0;
          const total = Number(a.total_amount_usd || 0);
          return paid >= total - 0.01 && paid > 0;
        });
        if (accountsToHeal.length > 0) {
          Promise.all(accountsToHeal.map(a => supabase.from('payable_accounts').update({ status: 'paid' }).eq('id', a.id))).catch(console.error);
        }

        const firstActive = projectsData.find(p => p.status === 'in_progress' || p.status === 'completed');
        if (firstActive) {
          const pid = firstActive.id;
          setPaymentForm(prev => ({ ...prev, project_id: pid }));
          setCostForm(prev => ({ ...prev, project_id: pid }));
          setExtraForm(prev => ({ ...prev, project_id: pid }));
          setCommitmentForm(prev => ({ ...prev, project_id: pid }));
          setAdvanceForm(prev => ({ ...prev, project_id: pid }));
        }
      } else {
        setClientPayableAccounts([]);
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
  const initiateDelete = (id: string, type: 'project' | 'payment' | 'cost' | 'extra' | 'commitment' | 'advance' | 'payable_payment') => {
    setItemToDelete({ id, type });
    setAuthAction('delete');
    setShowAdminAuth(true);
    setAdminPassword('');
    setAuthError('');
  };

  const handleConfirmAuth = async () => {
    // CLAVE MAESTRA (En un entorno real esto iría en el backend o en variables de entorno seguras)
    const MASTER_KEY = '080911'; 

    if (adminPassword !== MASTER_KEY) {
      setAuthError('Contraseña incorrecta. Solo administradores autorizados.');
      return;
    }

    if (authAction === 'edit_project') {
      setShowAdminAuth(false);
      setShowProposalModal(true);
      return;
    }

    if (authAction === 'approve_proposal' || authAction === 'reject_proposal') {
      if (!projectToUpdateStatus) return;
      const newStatus = authAction === 'approve_proposal' ? 'in_progress' : 'cancelled';
      setDeleting(true);
      try {
        const { error } = await supabase
          .from('projects')
          .update({ status: newStatus })
          .eq('id', projectToUpdateStatus);
        
        if (error) throw error;
        setShowAdminAuth(false);
        setProjectToUpdateStatus(null);
        await fetchClientData();
      } catch (error: any) {
        alert('Error al actualizar estado: ' + error.message);
      } finally {
        setDeleting(false);
      }
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
        case 'payable_payment': table = 'payable_payments'; break;
      }

      if (table) {
        const { error } = await supabase.from(table).delete().eq('id', itemToDelete.id);
        
        if (error) throw error;

        setShowAdminAuth(false);
        setItemToDelete(null);
        // Actualización rápida sin recargar toda la página
        await fetchClientData(); 
      }
    } catch (error: any) {
      alert('Error al eliminar: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const togglePayableRow = (id: string) => {
    const newSet = new Set(payableExpandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setPayableExpandedRows(newSet);
  };

  const openPayableAbonoModal = (account: any) => {
    setSelectedAccountForPayablePayment(account);
    setPayablePaymentMode('abono');
    setPayablePaymentForm({
      payable_account_id: account.id,
      amount_usd: '',
      description: `Abono: ${account.description || account.name}`,
      reference: '',
      date: new Date().toISOString().split('T')[0]
    });
    setShowPayablePaymentModal(true);
  };

  const openPayableTotalModal = (account: any) => {
    const paid = account.payable_payments?.reduce((s: number, p: any) => s + Number(p.amount_usd || 0), 0) || 0;
    const total = Number(account.total_amount_usd || 0);
    const balance = Math.max(0, total - paid);
    setSelectedAccountForPayablePayment(account);
    setPayablePaymentMode('total');
    setPayablePaymentForm({
      payable_account_id: account.id,
      amount_usd: formatCurrency(balance),
      description: `Liquidación total: ${account.description || account.name}`,
      reference: '',
      date: new Date().toISOString().split('T')[0]
    });
    setShowPayablePaymentModal(true);
  };

  const handleSavePayablePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewer) return;

    const account = clientPayableAccounts.find(a => a.id === payablePaymentForm.payable_account_id);
    if (!account) return alert('Cuenta no encontrada.');
    if (isActionDisabledForSales(account.project_id)) {
      return alert('Ventas no puede modificar proyectos aprobados.');
    }

    const previouslyPaid = account.payable_payments?.reduce((sum: number, p: any) => sum + Number(p.amount_usd || 0), 0) || 0;
    const totalAmount = Number(account.total_amount_usd || 0);
    const currentBalance = Math.max(0, totalAmount - previouslyPaid);

    const rawAmountStr = String(payablePaymentForm.amount_usd).replace(/\./g, '').replace(',', '.');
    const paymentAmount = parseFloat(rawAmountStr) || 0;
    if (paymentAmount <= 0) {
      return alert('El monto debe ser mayor a $0.');
    }
    if (paymentAmount > currentBalance + 0.05) {
      return alert(`El monto a pagar ($${formatCurrency(paymentAmount)}) supera el saldo pendiente ($${formatCurrency(currentBalance)}).`);
    }

    try {
      const { error } = await supabase.from('payable_payments').insert([{
        payable_account_id: payablePaymentForm.payable_account_id,
        amount_usd: paymentAmount,
        description: payablePaymentForm.description,
        reference: payablePaymentForm.reference,
        date: payablePaymentForm.date
      }]);

      if (error) throw error;

      const remainingBalance = totalAmount - previouslyPaid - paymentAmount;
      const isFullPay = remainingBalance <= 0.01 || payablePaymentMode === 'total';

      if (account && account.project_id) {
        // Registrar el gasto en project_costs
        let costCategory = 'materials';
        if (account.type === 'obrero') costCategory = 'labor';
        else if (account.type === 'alquiler') costCategory = 'equipment';
        else if (account.type === 'subcontratista') costCategory = 'subcontract';

        const conceptText = payablePaymentForm.description || account.description || (isFullPay ? 'Liquidación total' : 'Abono');
        const refPart = payablePaymentForm.reference ? ` (Ref: ${payablePaymentForm.reference})` : '';
        const costDescription = isFullPay
          ? `Liquidación total cuenta por pagar: ${account.name} - ${conceptText}${refPart}`
          : `Abono a cuenta por pagar: ${account.name} - ${conceptText}${refPart}`;

        const { error: costError } = await supabase.from('project_costs').insert([{
          project_id: account.project_id,
          description: costDescription,
          provider: account.name,
          category: costCategory,
          quantity: 1,
          unit_price_usd: paymentAmount,
          total_usd: paymentAmount,
          date: payablePaymentForm.date
        }]);

        if (costError) console.error("Error al registrar gasto:", costError);

        // Verificar si la deuda está saldada y actualizar estado
        if (isFullPay || remainingBalance <= 0.01) {
          const { error: statusError } = await supabase.from('payable_accounts')
            .update({ status: 'paid' })
            .eq('id', account.id);
          if (statusError) console.error("Error al actualizar estado CxP:", statusError);
        }
      }

      setShowPayablePaymentModal(false);
      setSelectedAccountForPayablePayment(null);
      setPayablePaymentForm({ payable_account_id: '', amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
      fetchClientData();
    } catch (err: any) {
      alert("Error registrando abono a cuenta por pagar: " + err.message);
    }
  };

  const handleMergeProjects = async () => {
    if (!primaryProjectId || !secondaryProjectId || primaryProjectId === secondaryProjectId) {
      alert("Debes seleccionar dos proyectos distintos.");
      return;
    }

    setMerging(true);
    try {
      const primary = projects.find(p => p.id === primaryProjectId);
      const secondary = projects.find(p => p.id === secondaryProjectId);

      if (!primary || !secondary) throw new Error("Proyecto no encontrado");

      const newBudget = Number(primary.budget_usd) + Number(secondary.budget_usd);
      const newDescription = `${primary.description || ''}\n\n--- [UNIFICACIÓN CON PROPUESTA ${secondary.proposal_number || 'S/N'}] ---\n\n${secondary.description || ''}`.trim();

      // 1. Actualizar el proyecto principal
      const { error: updateError } = await supabase
        .from('projects')
        .update({ budget_usd: newBudget, description: newDescription })
        .eq('id', primaryProjectId);
      if (updateError) throw updateError;

      // 2. Transferir registros
      const transferData = async (table: string) => {
        const { error } = await supabase
          .from(table)
          .update({ project_id: primaryProjectId })
          .eq('project_id', secondaryProjectId);
        if (error) throw error;
      };

      await Promise.all([
        transferData('project_payments'),
        transferData('project_costs'),
        transferData('project_extras'),
        transferData('project_commitments'),
        transferData('partner_advances')
      ]);

      // 3. Eliminar el proyecto secundario
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', secondaryProjectId);
      if (deleteError) throw deleteError;

      setShowMergeModal(false);
      setPrimaryProjectId('');
      setSecondaryProjectId('');
      await fetchClientData();
    } catch (error: any) {
      console.error("Error al unificar:", error);
      alert("Error al unificar proyectos: " + error.message);
    } finally {
      setMerging(false);
    }
  };

  const openMergeModal = () => setShowMergeModal(true);

  const initiateReopen = (projectId: string) => {
    setProjectToReopen(projectId);
    setShowReopenAuth(true);
    setReopenPassword('');
    setReopenError('');
  };

  const handleConfirmReopen = async () => {
    const MASTER_KEY = '080911';
    if (reopenPassword !== MASTER_KEY) {
      setReopenError('Contraseña incorrecta. Solo administradores autorizados.');
      return;
    }

    if (!projectToReopen) return;

    setReopening(true);
    try {
      const targetProject = projects.find(p => p.id === projectToReopen);
      const isRevert = targetProject?.status === 'in_progress';
      const updateData = isRevert 
        ? { status: 'proposal' } 
        : { archived_at: null, status: 'in_progress' };

      const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectToReopen);
      
      if (error) throw error;

      setShowReopenAuth(false);
      setProjectToReopen(null);
      await fetchClientData();
    } catch (error: any) {
      alert('Error al reabrir el proyecto: ' + error.message);
    } finally {
      setReopening(false);
    }
  };

  const initiateEdit = (project: any) => {
    if (isSales && project.status !== 'proposal') return alert('Ventas no puede modificar proyectos aprobados.');

    setProjectToEdit(project);
    setEditForm({
      title: project.title || '',
      budget_usd: project.budget_usd?.toString() || '',
      description: project.description || ''
    });
    setAiRefinement('');

    if ((isSales || isClient) && project.status === 'proposal') {
      setShowProposalModal(true);
      return;
    }

    setAuthAction('edit_project');
    setShowAdminAuth(true);
    setAdminPassword('');
    setAuthError('');
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
    if (isActionDisabledForSales(paymentForm.project_id)) return alert('Ventas no puede modificar proyectos aprobados.');
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
    if (isActionDisabledForSales(costForm.project_id)) return alert('Ventas no puede modificar proyectos aprobados.');
    const unitPrice = parseCurrency(costForm.unit_price_usd);
    const { error } = await supabase.from('project_costs').insert([{
      project_id: costForm.project_id,
      description: costForm.description,
      provider: costForm.provider,
      category: costForm.category,
      quantity: costForm.quantity,
      unit_price_usd: unitPrice,
      total_usd: costForm.quantity * unitPrice,
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
    if (isActionDisabledForSales(extraForm.project_id)) return alert('Ventas no puede modificar proyectos aprobados.');
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
    if (isActionDisabledForSales(commitmentForm.project_id)) return alert('Ventas no puede modificar proyectos aprobados.');
    
    const data = {
      project_id: commitmentForm.project_id,
      description: commitmentForm.description,
      provider: commitmentForm.provider,
      category: commitmentForm.category,
      quantity: commitmentForm.quantity,
      unit_price_usd: parseCurrency(commitmentForm.unit_price_usd),
      amount_usd: commitmentForm.quantity * parseCurrency(String(commitmentForm.unit_price_usd)),
      date: commitmentForm.date
    };

    const { data: newCommitment, error } = await supabase.from('project_commitments').insert([data]).select().single();

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
        project_id: data.project_id,
        commitment_id: newCommitment.id,
        description: data.description
      }]);

      if (payableError) {
        console.error('Error creating payable account:', payableError);
        alert(`Compromiso creado pero falló al generar la cuenta por pagar: ${payableError.message}. \n\nAsegúrate de haber ejecutado las migraciones SQL en Supabase.`);
      }

      setShowCommitmentModal(false);
      setCommitmentForm({ ...commitmentForm, description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchClientData();
    } else alert(`Error: ${error?.message || 'Error desconocido'}`);
  }

  const initiateEditItem = (item: any, type: 'payment' | 'cost' | 'extra' | 'commitment') => {
    if (isViewer) return;
    if (isActionDisabledForSales(item.project_id)) return alert('Ventas no puede modificar proyectos aprobados.');
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
        const unitPrice = parseCurrency(editItemForm.unit_price_usd);
        updateData = {
          project_id: editItemForm.project_id,
          description: editItemForm.description,
          provider: editItemForm.provider,
          category: editItemForm.category,
          quantity: editItemForm.quantity,
          unit_price_usd: unitPrice,
          total_usd: editItemForm.quantity * unitPrice,
          date: editItemForm.date
        };
      } else if (editItemType === 'extra') {
        table = 'project_extras';
        updateData = {
          project_id: editItemForm.project_id,
          description: editItemForm.description,
          amount_usd: parseCurrency(editItemForm.amount_usd)
        };
      } else if (editItemType === 'commitment') {
        table = 'project_commitments';
        const up = parseCurrency(editItemForm.unit_price_usd);
        const amount_usd = editItemForm.quantity * up;
        updateData = {
          project_id: editItemForm.project_id,
          description: editItemForm.description,
          provider: editItemForm.provider,
          category: editItemForm.category,
          quantity: editItemForm.quantity,
          unit_price_usd: up,
          amount_usd: amount_usd,
          date: editItemForm.date
        };
        
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
        fetchClientData();
        return; // Return early
      }

      const { error } = await supabase.from(table).update(updateData).eq('id', editingItem.id);
      if (error) throw error;

      setShowEditItemModal(false);
      setEditingItem(null);
      setEditItemType(null);
      fetchClientData();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

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
          total_amount_usd: commitmentToPay.amount_usd || (commitmentToPay.quantity * commitmentToPay.unit_price_usd),
          project_id: commitmentToPay.project_id,
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
      const previouslyPaid = commitmentToPay.payable_accounts?.[0]?.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
      const totalAmount = Number(commitmentToPay.amount_usd || (commitmentToPay.quantity * commitmentToPay.unit_price_usd));
      const remainingBalance = totalAmount - previouslyPaid - monto;
      const isFullPay = remainingBalance <= 0.01 || commitmentPayMode === 'total';

      const providerName = commitmentToPay.provider || 'Proveedor';
      const conceptText = commitmentPayForm.description || commitmentToPay.description || (isFullPay ? 'Liquidación total' : 'Abono');
      const refPart = commitmentPayForm.reference ? ` (Ref: ${commitmentPayForm.reference})` : '';

      const costDescription = isFullPay
        ? `Liquidación total cuenta por pagar: ${providerName} - ${conceptText}${refPart}`
        : `Abono a cuenta por pagar: ${providerName} - ${conceptText}${refPart}`;

      const { error: costError } = await supabase.from('project_costs').insert([{
        project_id: commitmentToPay.project_id,
        description: costDescription,
        provider: providerName,
        category: commitmentToPay.category, // using original category
        quantity: 1,
        unit_price_usd: monto,
        total_usd: monto,
        date: commitmentPayForm.date
      }]);
      if (costError) throw new Error(`Error al registrar como gasto: ${costError.message}`);

      // 3. Update status if fully paid
      if (remainingBalance <= 0.01 || isFullPay) {
        await supabase.from('payable_accounts')
          .update({ status: 'paid' })
          .eq('id', payableAccountId);
      }

      setShowCommitmentPayModal(false);
      setCommitmentToPay(null);
      setCommitmentPayForm({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
      fetchClientData();
    } catch (err: any) {
      alert(err.message);
    }
  }


  async function handleAddAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!advanceForm.project_id) return alert('Seleccione un proyecto relacionado.');
    if (isActionDisabledForSales(advanceForm.project_id)) return alert('Ventas no puede modificar proyectos aprobados.');

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
  const activeProjects = projects.filter(p => (p.status === 'in_progress' || p.status === 'completed') && !p.archived_at);
  const archivedProjects = projects.filter(p => !!p.archived_at || p.status === 'cancelled' || (p.status === 'completed' && !!p.archived_at)); // Wait, if completed and not archived, where does it go?
  // Let's refine the filters:
  // Active: in_progress or completed (if not archived)
  // Proposals: proposal
  // History: cancelled or archived (even if completed)
  
  // Revised Filters:
  const financialProjects = projects.filter(p => p.status === 'in_progress' || p.status === 'completed');
  const currentProjects = projects.filter(p => !p.archived_at && p.status === 'in_progress');
  const pendingProposals = projects.filter(p => p.status === 'proposal');
  const historyProjects = projects.filter(p => !!p.archived_at || p.status === 'completed' || p.status === 'cancelled');

  const allPayments = financialProjects.flatMap(p => p.project_payments.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allCosts = financialProjects.flatMap(p => p.project_costs.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allExtras = financialProjects.flatMap(p => p.project_extras.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const allCommitments = projects.flatMap(p => p.project_commitments?.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })) || []);
  const allAdvances = financialProjects.flatMap(p => p.partner_advances.map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));

  const totalContracted = financialProjects.reduce((sum, p) => sum + Number(p.budget_usd), 0) + allExtras.reduce((sum, e) => sum + Number(e.amount_usd), 0);
  const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount_usd), 0);
  const totalCostsValue = allCosts.reduce((sum, c) => sum + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
  const totalCommitted = allCommitments.reduce((sum, c) => {
    const status = c.payable_accounts?.[0]?.status;
    if (status === 'paid' || status === 'cancelled') return sum;
    const paid = c.payable_accounts?.[0]?.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
    const total = Number(c.amount_usd || (c.quantity * c.unit_price_usd));
    if (paid >= total - 0.01) return sum;
    const balance = total - paid;
    return sum + Math.max(0, balance);
  }, 0);
  const totalAdvances = allAdvances.reduce((sum, a) => sum + Number(a.amount_usd), 0);

  const balanceDue = totalContracted - totalPaid;
  const estimatedProfit = totalContracted - totalCostsValue - totalCommitted;
  const netProfit = estimatedProfit - totalAdvances;
  const estimatedMargin = totalContracted > 0 ? (estimatedProfit / totalContracted) * 100 : 0;
  
  const totalPagado = projects.reduce((sum, p) => sum + (p.project_payments?.reduce((s: any, pm: any) => s + (Number(pm.amount_usd) || 0), 0) || 0), 0);

  // Variables de impresión filtradas por selección del usuario
  const printProjects = selectedProjectIds.size > 0
    ? currentProjects.filter(p => selectedProjectIds.has(p.id))
    : currentProjects;
  const printPayments = printProjects.flatMap(p => p.project_payments.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printCosts = printProjects.flatMap(p => p.project_costs.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printExtras = printProjects.flatMap(p => p.project_extras.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printCommitments = printProjects.flatMap(p => 
    (p.project_commitments || []).map((x: any) => {
      const status = x.payable_accounts?.[0]?.status;
      const isPaidOrCancelled = status === 'paid' || status === 'cancelled';
      const paid = x.payable_accounts?.[0]?.payable_payments?.reduce((s: any, pm: any) => s + Number(pm.amount_usd), 0) || 0;
      const total = Number(x.amount_usd || (x.quantity * x.unit_price_usd));
      const balance = isPaidOrCancelled || paid >= total - 0.01 ? 0 : Math.max(0, total - paid);
      return {
        ...x,
        project_title: p.title,
        proposal_number: p.proposal_number,
        total_amount: total,
        paid_amount: paid,
        balance
      };
    })
  ).filter((c: any) => c.balance > 0.01);
  const printAdvances = printProjects.flatMap(p => p.partner_advances.map((x: any) => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printTotalContracted = printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0) + printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0);
  const printTotalPaid = printPayments.reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
  const printTotalCostsValue = printCosts.reduce((s: number, c: any) => s + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
  const printTotalCommitted = printCommitments.reduce((s: number, c: any) => s + c.balance, 0);
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>
                  {client?.name}
                </h1>
                {client?.company_name && (
                  <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.85rem', padding: '0.3rem 0.8rem' }}>
                    🏢 {client.company_name}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                {client?.tax_id && <span><strong>RIF/CI:</strong> {client.tax_id}</span>}
                {client?.phone && <span><strong>Tel:</strong> {client.phone}</span>}
                {client?.email && <span><strong>Email:</strong> {client.email}</span>}
                {client?.address && <span><strong>Dir:</strong> {client.address}</span>}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              onClick={() => openPrintSelection('client-statement')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.1rem', fontSize: '0.85rem' }}
            >
              <FileText size={16} /> Estado de Cuenta
            </button>
            <button
              className="btn-secondary"
              onClick={() => openPrintSelection('partner-report')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.1rem', background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.3)', color: '#c4b5fd', fontSize: '0.85rem', fontWeight: 600 }}
            >
              <BarChart3 size={16} /> Reporte Socios
            </button>
            {projects.length >= 2 && !isViewer && (
              <button
                className="btn-secondary"
                onClick={openMergeModal}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.1rem', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <GitMerge size={16} /> Unificar Proyectos
              </button>
            )}
            {!isViewer && (
              <button
                className="btn-primary"
                onClick={() => setShowProposalModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.2rem', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <Plus size={16} /> Nueva Propuesta
              </button>
            )}
          </div>
        </div>

      {/* ACTION BAR */}
      {!isViewer && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button className="btn-secondary" onClick={() => setShowPaymentModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--success)', color: 'var(--success)' }}>
              <DollarSign size={15} /> Registrar Abono
            </button>
            {role !== 'sales' && (
              <>
                <button className="btn-secondary" onClick={() => setShowCostModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                  <DollarIcon size={15} /> Registrar Gasto
                </button>
                <button className="btn-secondary" onClick={() => setShowExtraModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}>
                  <Plus size={15} /> Servicio Adicional
                </button>
                <button className="btn-secondary" onClick={() => setShowCommitmentModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(245,158,11,0.5)', color: 'var(--primary-color)' }}>
                  <ClipboardList size={15} /> Cuenta por Pagar
                </button>
                <button className="btn-secondary" onClick={() => setShowAdvanceModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(168,85,247,0.5)', color: '#c084fc' }}>
                  <Wallet size={15} /> Retiro de Socio
                </button>
              </>
            )}
        </div>
      )}

      {/* Cargos Pendientes de Telegram para este Cliente */}
      {client && (
        <TelegramPendingPanel
          clientIdFilter={client.id}
          projects={projects.map((p: any) => ({
            id: p.id,
            title: p.title,
            clientName: client.name,
          }))}
        />
      )}

      {/* Estado de Cuenta Global y Rentabilidad del Cliente */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Fila 1: Indicadores Principales (Contratos y Pagos) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <TrendingUp size={16} /> Total Contratado
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalContracted)}
            </div>
          </div>
          
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <DollarSign size={16} /> Total Pagado
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalPaid)}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Clock size={16} /> <span style={{ fontWeight: 700 }}>Saldo Pendiente</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary-color)', letterSpacing: '-0.02em' }}>
              ${formatCurrency(balanceDue)}
            </div>
          </div>
        </div>

        {/* Fila 2: Indicadores de Rentabilidad (Egresos y Ganancia) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(239,68,68,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <TrendingDown size={16} /> Costos Totales
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              ${formatCurrency(totalCostsValue)}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <AlertCircle size={16} /> <span style={{ fontWeight: 700 }}>Cuentas por Pagar</span>
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
                 Contrato − Gastos − Cuentas por Pagar
               </span>
            </div>
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
              className={`btn-secondary ${activeTab === 'cuentas_pagar' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'cuentas_pagar' ? 'var(--accent-blue)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('cuentas_pagar')}
            >
              Cuentas por Pagar
            </button>
            <button
              className={`btn-secondary ${activeTab === 'retiros' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'retiros' ? '#8b5cf6' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('retiros')}
            >
              Retiro de Socios
            </button>
            <button
              className={`btn-secondary ${activeTab === 'historial' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'historial' ? 'var(--text-muted)' : 'transparent', border: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => setActiveTab('historial')}
            >
              <Archive size={16} /> Historial
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
                        <th style={{ textAlign: 'left', padding: '1rem' }}>PROPUESTA</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO PROPUESTO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingProposals.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '0.2rem' }}>
                              {p.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {p.proposal_number && (
                                <span style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(59,130,246,0.2)' }}>
                                  Propuesta #{p.proposal_number}
                                </span>
                              )}
                              <span>📅 {new Date(p.created_at).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(p.budget_usd)}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            {!isViewer && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} 
                                onClick={() => router.push(`/proyectos/${p.id}?from=client&clientId=${clientId}`)}
                              >
                                <FileText size={14} /> Ver
                              </button>
                            )}
                            {!isViewer && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} 
                                onClick={() => initiateEdit(p)}
                              >
                                <Edit3 size={14} />
                              </button>
                            )}
                            <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} onClick={() => router.push(`/proyectos?print=${p.id}`)}>
                              <Printer size={14} /> Imprimir
                            </button>
                            {!isObserver && (
                              <>
                                <button
                                  className="btn-primary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                                  title="Aprobar Propuesta"
                                  onClick={() => {
                                    setProjectToUpdateStatus(p.id);
                                    setAuthAction('approve_proposal');
                                    setShowAdminAuth(true);
                                    setAdminPassword('');
                                    setAuthError('');
                                  }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem', color: '#ffcc00' }}
                                  title="Rechazar Propuesta"
                                  onClick={() => {
                                    setProjectToUpdateStatus(p.id);
                                    setAuthAction('reject_proposal');
                                    setShowAdminAuth(true);
                                    setAdminPassword('');
                                    setAuthError('');
                                  }}
                                >
                                  <Ban size={14} />
                                </button>
                              </>
                            )}
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
              {currentProjects.length === 0 ? (
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
                      {currentProjects.map(project => {
                        const pExtras = project.project_extras?.reduce((acc, e) => acc + Number(e.amount_usd), 0) || 0;
                        const pContratado = Number(project.budget_usd) + pExtras;
                        const pEgresos = project.project_costs?.reduce((acc, c) => acc + (Number(c.quantity) * Number(c.unit_price_usd)), 0) || 0;
                        const pCompromisos = project.project_commitments?.reduce((acc: number, c: any) => {
                          const status = c.payable_accounts?.[0]?.status;
                          if (status === 'paid' || status === 'cancelled') return acc;
                          const paid = c.payable_accounts?.[0]?.payable_payments?.reduce((s: any, pm: any) => s + Number(pm.amount_usd), 0) || 0;
                          const total = Number(c.amount_usd || (c.quantity * c.unit_price_usd));
                          if (paid >= total - 0.01) return acc;
                          const balance = Math.max(0, total - paid);
                          return acc + balance;
                        }, 0) || 0;
                        const pGanancia = pContratado - pEgresos - pCompromisos;

                        return (
                          <tr key={project.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '1rem' }}>
                              <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '0.2rem' }}>
                                {project.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {project.proposal_number && (
                                  <span style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(59,130,246,0.2)' }}>
                                    Propuesta #{project.proposal_number}
                                  </span>
                                )}
                                <span>📅 {new Date(project.created_at).toLocaleDateString()}</span>
                              </div>
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
                              <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} onClick={() => initiateEdit(project)} title="Editar propuesta">
                                <Edit3 size={14} />
                              </button>
                              <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} onClick={() => router.push(`/proyectos?print=${project.id}`)} title="Imprimir reporte">
                                <Printer size={14} />
                              </button>
                              {!isObserver && project.status === 'in_progress' && (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem', color: '#ffcc00', borderColor: 'rgba(255, 204, 0, 0.2)' }}
                                  title="Retornar a Propuesta (requiere clave admin)"
                                  onClick={() => initiateReopen(project.id)}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
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

          {activeTab === 'cuentas_pagar' && (() => {
            const accountsWithBalance = clientPayableAccounts.map(account => {
              const paid = account.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd || 0), 0) || 0;
              const total = Number(account.total_amount_usd || 0);
              const isPaid = account.status === 'paid' || paid >= total - 0.01;
              const isCancelled = account.status === 'cancelled';
              const balance = (isPaid || isCancelled) ? 0 : Math.max(0, total - paid);
              return { ...account, paid, total, isPaid, isCancelled, balance };
            });

            const activePendingAccounts = accountsWithBalance.filter(a => a.status === 'active' && !a.isPaid && !a.isCancelled && a.balance > 0.01);

            const totalContract = activePendingAccounts.reduce((acc, a) => acc + a.total, 0);
            const totalPaid = activePendingAccounts.reduce((acc, a) => acc + a.paid, 0);
            const totalPendingBalance = activePendingAccounts.reduce((acc, a) => acc + a.balance, 0);

            return (
              <div>
                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="card" style={{ padding: '1rem', background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Comprometido</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>${formatCurrency(totalContract)}</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Abonado</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>${formatCurrency(totalPaid)}</div>
                  </div>
                  <div className="card" style={{ padding: '1rem', background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--danger)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Saldo Pendiente Activo</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>${formatCurrency(totalPendingBalance)}</div>
                  </div>
                </div>

                {activePendingAccounts.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <CheckCircle size={36} color="var(--success)" style={{ margin: '0 auto 0.75rem auto', display: 'block', opacity: 0.85 }} />
                    <p style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 600 }}>¡No hay cuentas por pagar pendientes!</p>
                    <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem' }}>Todas las cuentas y compromisos de los proyectos de este cliente están saldadas.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          <th style={{ width: '40px', padding: '1rem' }}></th>
                          <th style={{ textAlign: 'left', padding: '1rem' }}>NOMBRE</th>
                          <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}>CONTRATO</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}>ABONADO</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}>SALDO</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePendingAccounts.map(account => {
                          const isExpanded = payableExpandedRows.has(account.id);
                          const progress = account.total > 0 ? Math.min(100, Math.round((account.paid / account.total) * 100)) : 0;

                          return (
                            <React.Fragment key={account.id}>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                <td style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => togglePayableRow(account.id)}>
                                  {isExpanded ? <ChevronDown size={18} className="text-muted" /> : <ChevronRight size={18} className="text-muted" />}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {account.name}
                                  </div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{account.type}</div>
                                </td>
                                <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                                  {account.project?.proposal_number ? `#${account.project?.proposal_number} - ` : ''}{account.project?.title || 'General'}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right' }}>${formatCurrency(account.total)}</td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>${formatCurrency(account.paid)}</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: account.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>${formatCurrency(account.balance)}</td>
                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                  {!isViewer && !isActionDisabledForSales(account.project_id) && account.balance > 0 && !account.isPaid && !account.isCancelled && (
                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                      <button 
                                        className="btn-secondary" 
                                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.3)' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openPayableAbonoModal(account);
                                        }}
                                        title="Registrar abono parcial"
                                      >
                                        <DollarSign size={13} style={{ marginRight: '2px', display: 'inline' }} /> Abonar
                                      </button>
                                      <button 
                                        className="btn-primary" 
                                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openPayableTotalModal(account);
                                        }}
                                        title="Pagar totalidad de la deuda"
                                      >
                                        <CheckCircle size={13} style={{ marginRight: '2px', display: 'inline' }} /> Liquidar
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              
                              {/* Panel Expandido con Historial de Abonos */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} style={{ padding: 0 }}>
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      
                                      {/* Barra de progreso */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                        <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                          <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? 'var(--success)' : 'var(--primary-color)', transition: 'width 0.3s ease' }}></div>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: progress >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>
                                          {progress}% Pagado
                                        </div>
                                      </div>

                                      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Historial de Abonos</h4>
                                      
                                      {(!account.payable_payments || account.payable_payments.length === 0) ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No se han registrado abonos a esta cuenta.</div>
                                      ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                          <thead>
                                            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Concepto</th>
                                              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Referencia</th>
                                              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Monto</th>
                                              <th style={{ textAlign: 'right', padding: '0.5rem' }}></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {account.payable_payments.map((p: any) => (
                                              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '0.5rem' }}>{p.date || new Date(p.created_at).toISOString().split('T')[0]}</td>
                                                <td style={{ padding: '0.5rem' }}>{p.description || '-'}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--primary-color)' }}>{p.reference || '-'}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(p.amount_usd)}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                  {!isViewer && !isActionDisabledForSales(account.project_id) && (
                                                    <button 
                                                      className="btn-secondary"
                                                      style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)', borderColor: 'transparent' }}
                                                      onClick={() => initiateDelete(p.id, 'payable_payment')}
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
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
            );
          })()}

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
                          {!isViewer && !isActionDisabledForSales(p.project_id) && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                              onClick={() => initiateEditItem(p, 'payment')}
                              title="Editar pago"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          {!isViewer && !isActionDisabledForSales(p.project_id) && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                              onClick={() => initiateDelete(p.id, 'payment')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
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
                          {!isViewer && !isActionDisabledForSales(c.project_id) && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                              onClick={() => initiateEditItem(c, 'cost')}
                              title="Editar gasto"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          {!isViewer && !isActionDisabledForSales(c.project_id) && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                              onClick={() => initiateDelete(c.id, 'cost')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
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
                        <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {!isViewer && !isActionDisabledForSales(e.project_id) && (
                            <>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59, 130, 246, 0.2)' }} 
                                onClick={() => initiateEditItem({ ...e, amount_usd: formatCurrency(e.amount_usd) }, 'extra')}
                                title="Editar adicional"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} 
                                onClick={() => initiateDelete(e.id, 'extra')}
                                title="Eliminar adicional"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
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
                            {!isViewer && !isActionDisabledForSales(a.project_id) && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} 
                                onClick={() => initiateDelete(a.id, 'advance')}
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
          {activeTab === 'historial' && (
            <div className="animate-fade">
              {historyProjects.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay proyectos en el historial.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>PROYECTO</th>
                        <th style={{ textAlign: 'left', padding: '1rem' }}>ESTADO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>PRESUPUESTO</th>
                        <th style={{ textAlign: 'right', padding: '1rem' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyProjects.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 'bold' }}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</div>
                            {p.archived_at && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Archivado el {new Date(p.archived_at).toLocaleDateString()}</div>}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <span className={`badge ${p.status === 'completed' ? 'badge-success' : p.status === 'cancelled' ? 'badge-danger' : ''}`}>
                              {p.status === 'completed' ? 'Completado' : p.status === 'cancelled' ? 'Cancelado' : p.status}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(p.budget_usd)}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem' }} 
                              onClick={() => router.push(`/proyectos/${p.id}?from=client&clientId=${clientId}`)}
                            >
                              <FileText size={14} /> Ver
                            </button>
                            <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => router.push(`/proyectos?print=${p.id}`)}>
                              <Printer size={14} />
                            </button>
                            {!isViewer && (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginLeft: '0.5rem', color: 'var(--success)' }} 
                                onClick={() => initiateReopen(p.id)}
                                title="Reabrir proyecto"
                              >
                                <CheckCircle size={14} /> Reabrir
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
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>Registrar Cuenta por Pagar</h2>
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
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
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
                Total: ${(commitmentForm.quantity * parseCurrency(String(commitmentForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowCommitmentModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Guardar Cuenta por Pagar</button>
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
                <Printer size={18} /> {printMode === 'client-statement' ? 'Imprimir Estado de Cuenta' : 'Imprimir Reporte de Socios'}
              </h2>
              <button onClick={() => setShowPrintModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
                <X size={22} />
              </button>
            </div>

            {/* Selector de Tipo de Documento */}
            <div style={{ marginBottom: '1.2rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem', borderRadius: '10px', display: 'flex', gap: '0.35rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                onClick={() => setPrintMode('client-statement')}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.8rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  backgroundColor: printMode === 'client-statement' ? 'var(--primary-color)' : 'transparent',
                  color: printMode === 'client-statement' ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s ease'
                }}
              >
                <FileText size={15} /> Estado de Cuenta (Cliente)
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('partner-report')}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.8rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  backgroundColor: printMode === 'partner-report' ? '#8b5cf6' : 'transparent',
                  color: printMode === 'partner-report' ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s ease'
                }}
              >
                <BarChart3 size={15} /> Reporte de Socios (Interno)
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginBottom: '1.2rem', marginTop: 0 }}>
              {printMode === 'client-statement' 
                ? 'Documento formal para el cliente: muestra presupuestos base, adicionales y abonos recibidos (sin costos internos ni utilidades).' 
                : 'Reporte confidencial de socios: incluye gastos detallados, cuentas por pagar a proveedores, margen de ganancia y retiros.'}
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
        {printMode === 'client-statement' ? (
          <div>
            {/* Encabezado del Estado de Cuenta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: '1.2rem', marginBottom: '1.8rem' }}>
              <div>
                 <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#000' }}>P&P CONSTRUYE</h1>
                 <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#555' }}>Ingeniería, Arquitectura y Construcción</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#000' }}>ESTADO DE CUENTA</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#555' }}>Fecha de Emisión: <strong>{new Date().toLocaleDateString('es-VE')}</strong></p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#555' }}>Proyectos incluidos: {printProjects.length} de {activeProjects.length}</p>
              </div>
            </div>

            {/* Datos del Cliente */}
            <div style={{ marginBottom: '1.8rem', padding: '1rem 1.2rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', color: '#334155' }}>CLIENTE: {client.name}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '12px' }}>
                <div><strong>Empresa:</strong> {client.company_name || 'N/A'}</div>
                <div><strong>RIF / CI:</strong> {client.tax_id || 'N/A'}</div>
                <div><strong>Teléfono:</strong> {client.phone || 'N/A'}</div>
                <div><strong>Email:</strong> {client.email || 'N/A'}</div>
                {client.address && <div style={{ gridColumn: 'span 2' }}><strong>Dirección:</strong> {client.address}</div>}
              </div>
            </div>

            {/* Resumen Financiero de Cliente */}
            <h3 style={{ fontSize: '15px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>RESUMEN GENERAL</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '13px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', background: '#f8fafc', width: '60%' }}>Presupuestos Base Acordados:</td>
                  <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', width: '40%', textAlign: 'right', fontWeight: 600 }}>${formatCurrency(printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0))}</td>
                </tr>
                {printExtras.length > 0 && (
                  <tr>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', background: '#f8fafc' }}>Total Trabajos Adicionales Aprobados ({printExtras.length}):</td>
                    <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>+ ${formatCurrency(printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0))}</td>
                  </tr>
                )}
                <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                  <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #94a3b8', fontSize: '14px' }}>TOTAL CONTRATADO / INVERSIÓN:</td>
                  <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #94a3b8', textAlign: 'right', fontSize: '14px' }}>${formatCurrency(printTotalContracted)}</td>
                </tr>
                <tr style={{ background: '#f0fdf4' }}>
                  <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #86efac', fontWeight: 'bold', color: '#166534' }}>TOTAL ABONADO / PAGADO:</td>
                  <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #86efac', textAlign: 'right', fontWeight: 'bold', color: '#166534', fontSize: '14px' }}>- ${formatCurrency(printTotalPaid)}</td>
                </tr>
                <tr style={{ background: printBalanceDue > 0 ? '#fffbeb' : '#f0fdf4' }}>
                  <td style={{ padding: '0.8rem', border: '2px solid ' + (printBalanceDue > 0 ? '#f59e0b' : '#10b981'), fontWeight: 'bold', fontSize: '15px' }}>SALDO PENDIENTE POR PAGAR:</td>
                  <td style={{ padding: '0.8rem', border: '2px solid ' + (printBalanceDue > 0 ? '#f59e0b' : '#10b981'), textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: printBalanceDue > 0 ? '#b45309' : '#166534' }}>
                    ${formatCurrency(printBalanceDue)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 1. Detalle de Proyectos y Presupuestos */}
            <h3 style={{ fontSize: '14px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>1. PROYECTOS Y PRESUPUESTOS</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>PROYECTO</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center' }}>FECHA</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>PRESUPUESTO BASE</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>ADICIONALES</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>TOTAL PROYECTO</th>
                </tr>
              </thead>
              <tbody>
                {printProjects.map((p: any) => {
                  const pExtras = p.project_extras?.reduce((acc: number, e: any) => acc + Number(e.amount_usd), 0) || 0;
                  const pTotal = Number(p.budget_usd) + pExtras;
                  return (
                    <tr key={p.id}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center' }}>{new Date(p.created_at).toLocaleDateString('es-VE')}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>${formatCurrency(p.budget_usd)}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>${formatCurrency(pExtras)}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(pTotal)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                  <td colSpan={2} style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>TOTALES:</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>${formatCurrency(printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0))}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>${formatCurrency(printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0))}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>${formatCurrency(printTotalContracted)}</td>
                </tr>
              </tbody>
            </table>

            {/* 2. Detalle de Adicionales si existen */}
            {printExtras.length > 0 && (
              <>
                <h3 style={{ fontSize: '14px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>2. DETALLE DE TRABAJOS ADICIONALES</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>DESCRIPCIÓN</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>PROYECTO VINCULADO</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>MONTO (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printExtras.map((e: any) => (
                      <tr key={e.id}>
                        <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{e.description}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{e.proposal_number ? `#${e.proposal_number} - ` : ''}{e.project_title}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>+ ${formatCurrency(e.amount_usd)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                      <td colSpan={2} style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>Total Trabajos Adicionales:</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', color: '#0284c7' }}>${formatCurrency(printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* 3. Historial de Pagos Recibidos */}
            <h3 style={{ fontSize: '14px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>{printExtras.length > 0 ? '3.' : '2.'} HISTORIAL DE PAGOS Y ABONOS RECIBIDOS</h3>
            {printPayments.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '1.8rem', fontStyle: 'italic' }}>No se registran pagos o abonos recibidos hasta la fecha.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left', width: '100px' }}>FECHA</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>CONCEPTO / REFERENCIA</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>PROYECTO ORIGEN</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', width: '130px' }}>MONTO (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {printPayments.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{p.date}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{p.description} {p.reference ? `(Ref: ${p.reference})` : ''}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.project_title}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 600, color: '#166534' }}>${formatCurrency(p.amount_usd)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f0fdf4', fontWeight: 'bold' }}>
                    <td colSpan={3} style={{ border: '1px solid #86efac', padding: '0.6rem', textAlign: 'right', color: '#166534' }}>Total Abonado Recibido:</td>
                    <td style={{ border: '1px solid #86efac', padding: '0.6rem', textAlign: 'right', color: '#166534', fontSize: '13px' }}>${formatCurrency(printTotalPaid)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Pie de página */}
            <div style={{ marginTop: '2.5rem', paddingTop: '1rem', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: '#334155' }}>P&P Construye C.A.</p>
                <p style={{ margin: '2px 0 0 0' }}>Ingeniería, Arquitectura y Remodelaciones</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0 }}>Documento emitido para uso exclusivo del cliente.</p>
                <p style={{ margin: '2px 0 0 0' }}>Generado el {new Date().toLocaleString('es-VE')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Encabezado del Reporte */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '2rem' }}>
              <div>
                 <h1 style={{ margin: 0, fontSize: '24px', color: '#000' }}>P&P CONSTRUYE</h1>
                 <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Ingeniería, Arquitectura y Construcción</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>REPORTE FINANCIERO DE SOCIOS</h2>
                <p style={{ margin: 0, fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>USO INTERNO EXCLUSIVO DE SOCIOS</p>
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
                  <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Cuentas por Pagar Pendientes:</strong></td>
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

            {/* Detalle de Cuentas por Pagar */}
            <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>4. CUENTAS POR PAGAR (PENDIENTES)</h3>
            {printCommitments.length === 0 ? (
               <p style={{ fontSize: '12px', color: '#555', marginBottom: '2rem' }}>No hay cuentas por pagar pendientes por liquidar.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f1f1' }}>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROVEEDOR</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROYECTO</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL PACTADO</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>ABONADO</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>SALDO PENDIENTE (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {printCommitments.map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.date || new Date(c.created_at).toISOString().split('T')[0]}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.provider || 'N/A'}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.description}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{c.proposal_number ? `#${c.proposal_number} - ` : ''}{c.project_title}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(c.total_amount)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#28a745' }}>${formatCurrency(c.paid_amount)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#d32f2f' }}>${formatCurrency(c.balance)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                    <td colSpan={6} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Cuentas por Pagar Pendientes:</td>
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

            {clientNotes && (
              <div style={{ marginTop: '1.5rem' }}>
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
        )}
      </div>

      {/* Modal Abono / Pago Cuenta Pagar */}
      {showPayablePaymentModal && (() => {
        const account = selectedAccountForPayablePayment || clientPayableAccounts.find(a => a.id === payablePaymentForm.payable_account_id);
        const previouslyPaid = account?.payable_payments?.reduce((sum: number, p: any) => sum + Number(p.amount_usd || 0), 0) || 0;
        const totalAmount = Number(account?.total_amount_usd || 0);
        const currentBalance = Math.max(0, totalAmount - previouslyPaid);

        return (
          <div className="modal-backdrop">
            <div className="modal-content animate-scale" style={{ maxWidth: '520px', width: '92%', padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                  {payablePaymentMode === 'total' ? (
                    <><CheckCircle size={22} color="var(--success)" /> Liquidar Cuenta por Pagar</>
                  ) : (
                    <><DollarSign size={22} color="var(--primary-color)" /> Registrar Abono</>
                  )}
                </h2>
                <button onClick={() => { setShowPayablePaymentModal(false); setSelectedAccountForPayablePayment(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>

              {/* Mode Toggle */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem', borderRadius: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    border: 'none',
                    background: payablePaymentMode === 'abono' ? 'var(--primary-color)' : 'transparent',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    padding: '0.5rem'
                  }}
                  onClick={() => {
                    setPayablePaymentMode('abono');
                    setPayablePaymentForm({
                      ...payablePaymentForm,
                      amount_usd: '',
                      description: `Abono: ${account?.description || account?.name || 'CxP'}`
                    });
                  }}
                >
                  <DollarSign size={15} /> Abonar (Parcial)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    border: 'none',
                    background: payablePaymentMode === 'total' ? 'var(--success)' : 'transparent',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    padding: '0.5rem'
                  }}
                  onClick={() => {
                    setPayablePaymentMode('total');
                    setPayablePaymentForm({
                      ...payablePaymentForm,
                      amount_usd: formatCurrency(currentBalance),
                      description: `Liquidación total: ${account?.description || account?.name || 'CxP'}`
                    });
                  }}
                >
                  <CheckCircle size={15} /> Liquidar (Pagar Todo)
                </button>
              </div>

              {/* Summary Card */}
              {account && (
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem 1.2rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Beneficiario:</span>
                    <strong style={{ color: 'white' }}>{account.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Proyecto:</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{account.project?.proposal_number ? `#${account.project?.proposal_number} - ` : ''}{account.project?.title || 'General'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Contrato:</span>
                    <strong style={{ color: 'white' }}>${formatCurrency(totalAmount)}</strong>
                  </div>
                  {previouslyPaid > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Abonado Previamente:</span>
                      <strong style={{ color: 'var(--success)' }}>${formatCurrency(previouslyPaid)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.9rem' }}>Saldo Pendiente Restante:</span>
                    <strong style={{ color: 'var(--danger)', fontSize: '1.05rem' }}>${formatCurrency(currentBalance)}</strong>
                  </div>
                </div>
              )}

              <form onSubmit={handleSavePayablePayment}>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ margin: 0, fontSize: '0.85rem' }}>Monto (USD)</label>
                      {payablePaymentMode === 'abono' && (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: 0 }}
                          onClick={() => {
                            setPayablePaymentMode('total');
                            setPayablePaymentForm({
                              ...payablePaymentForm,
                              amount_usd: formatCurrency(currentBalance),
                              description: `Liquidación total: ${account?.description || account?.name || 'CxP'}`
                            });
                          }}
                        >
                          ⚡ Liquidar saldo completo (${formatCurrency(currentBalance)})
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      readOnly={payablePaymentMode === 'total'}
                      className="input-field"
                      style={payablePaymentMode === 'total' ? { background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.4)', fontWeight: 700, color: 'var(--success)' } : {}}
                      value={payablePaymentForm.amount_usd}
                      onChange={(e) => setPayablePaymentForm({...payablePaymentForm, amount_usd: handleMoneyInput(e.target.value)})}
                      onBlur={(e) => setPayablePaymentForm({...payablePaymentForm, amount_usd: formatOnBlur(e.target.value)})}
                      placeholder="Ej. 1500.00"
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.85rem' }}>Concepto / Descripción</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={payablePaymentForm.description}
                      onChange={e => setPayablePaymentForm({...payablePaymentForm, description: e.target.value})}
                      placeholder={payablePaymentMode === 'total' ? `Liquidación total: ${account?.name || 'CxP'}` : 'Ej. Abono primera parte'}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.85rem' }}>Fecha del Pago</label>
                      <input
                        type="date"
                        required
                        className="input-field"
                        value={payablePaymentForm.date}
                        onChange={e => setPayablePaymentForm({...payablePaymentForm, date: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.85rem' }}>Referencia / Banco</label>
                      <input
                        type="text"
                        className="input-field"
                        value={payablePaymentForm.reference}
                        onChange={e => setPayablePaymentForm({...payablePaymentForm, reference: e.target.value})}
                        placeholder="Ej. Zelle 1234"
                      />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => { setShowPayablePaymentModal(false); setSelectedAccountForPayablePayment(null); }}>Cancelar</button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={payablePaymentMode === 'total' ? { background: 'var(--success)', borderColor: 'var(--success)' } : {}}
                  >
                    {payablePaymentMode === 'total' ? (
                      <><CheckCircle size={16} /> Confirmar Liquidación Total</>
                    ) : (
                      <><DollarSign size={16} /> Registrar Abono</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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

      {/* Modal de Autenticación de Administrador para Eliminación o Edición */}
      {showAdminAuth && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: authAction === 'delete' ? 'var(--danger)' : 'var(--primary-color)' }}>
              {authAction === 'delete' ? <Trash2 size={28} /> : <AlertCircle size={28} />}
              <h3 style={{ marginBottom: '0.5rem', color: authAction === 'delete' ? 'var(--danger)' : authAction === 'approve_proposal' ? 'var(--success)' : authAction === 'reject_proposal' ? '#ffcc00' : 'var(--primary-color)' }}>
                {authAction === 'delete' ? '🗑️ Eliminar Renglón' : authAction === 'approve_proposal' ? '✅ Aprobar Propuesta' : authAction === 'reject_proposal' ? '🚫 Rechazar Propuesta' : '🔐 Acción Protegida'}
              </h3>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {authAction === 'approve_proposal' 
                ? 'El proyecto pasará a estado En Ejecución. Ingrese la contraseña de administrador para continuar.' 
                : authAction === 'reject_proposal'
                ? 'La propuesta será rechazada y enviada al historial. Ingrese la contraseña de administrador.'
                : 'Esta acción requiere autorización de administrador. Ingrese la contraseña de sistema para continuar.'}
            </p>

            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              style={{ marginBottom: '1rem', width: '100%', letterSpacing: '0.3em', textAlign: 'center' }}
              onKeyDown={e => e.key === 'Enter' && handleConfirmAuth()}
              autoFocus
            />

            {authError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{authError}</p>}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                className="btn-secondary" 
                onClick={() => { setShowAdminAuth(false); setItemToDelete(null); }}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary" 
                onClick={handleConfirmAuth}
                disabled={deleting}
                style={{ background: authAction === 'delete' ? 'var(--danger)' : authAction === 'approve_proposal' ? 'var(--success)' : authAction === 'reject_proposal' ? '#ffcc00' : 'var(--primary-color)', borderColor: authAction === 'delete' ? 'var(--danger)' : authAction === 'approve_proposal' ? 'var(--success)' : authAction === 'reject_proposal' ? '#ffcc00' : 'var(--primary-color)', color: authAction === 'reject_proposal' ? '#000' : '#fff' }}
              >
                {deleting ? 'Procesando...' : authAction === 'delete' ? 'Eliminar' : authAction === 'approve_proposal' ? 'Confirmar Aprobación' : authAction === 'reject_proposal' ? 'Confirmar Rechazo' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reabrir Proyecto */}
      {showReopenAuth && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '400px', width: '90%', padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? 'rgba(255, 204, 0, 0.1)' : 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                {projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? (
                  <RotateCcw size={30} color="#ffcc00" />
                ) : (
                  <CheckCircle size={30} color="var(--success)" />
                )}
              </div>
              <h2 style={{ fontSize: '1.25rem', color: 'white', margin: '0 0 0.5rem 0' }}>
                {projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? 'Retornar a Propuesta' : 'Reabrir Proyecto'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                {projects.find(p => p.id === projectToReopen)?.status === 'in_progress' 
                  ? 'Esta acción restaurará el proyecto a la pestaña "Propuestas". Ingresa la clave maestra.'
                  : 'Esta acción restaurará el proyecto a la pestaña "Proyectos". Ingresa la clave maestra.'}
              </p>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Contraseña de administrador"
                value={reopenPassword}
                onChange={(e) => setReopenPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmReopen()}
                autoFocus
              />
              {reopenError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{reopenError}</p>}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                className="btn-secondary" 
                style={{ flex: 1, justifyContent: 'center' }} 
                onClick={() => { setShowReopenAuth(false); setProjectToReopen(null); }}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary" 
                style={{ flex: 1, background: projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? '#ffcc00' : 'var(--success)', borderColor: projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? '#ffcc00' : 'var(--success)', color: projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? '#000' : '#fff', justifyContent: 'center' }} 
                onClick={handleConfirmReopen}
                disabled={reopening}
              >
                {reopening ? 'Procesando...' : projects.find(p => p.id === projectToReopen)?.status === 'in_progress' ? 'Confirmar Retorno' : 'Reabrir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Unificar Proyectos */}
      {showMergeModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '600px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlusCircle size={20} color="#8b5cf6" /> Unificar Proyectos
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Selecciona dos proyectos para fusionarlos en uno solo. Los registros del proyecto a integrar se transferirán al proyecto principal, sumando sus presupuestos, y el proyecto a integrar desaparecerá.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto Principal (Se conserva)</label>
                <select className="input-field" value={primaryProjectId} onChange={e => setPrimaryProjectId(e.target.value)}>
                  <option value="">Selecciona el proyecto principal</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proyecto a Integrar (Se eliminará y sus montos se sumarán)</label>
                <select className="input-field" value={secondaryProjectId} onChange={e => setSecondaryProjectId(e.target.value)}>
                  <option value="">Selecciona el proyecto a integrar</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === primaryProjectId}>{p.proposal_number ? `#${p.proposal_number} - ` : ''}{p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowMergeModal(false)}>Cancelar</button>
              <button 
                className="btn-primary" 
                onClick={handleMergeProjects} 
                disabled={merging || !primaryProjectId || !secondaryProjectId}
                style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
              >
                {merging ? 'Unificando...' : 'Unificar Proyectos'}
              </button>
            </div>
          </div>
        </div>
      )}

      <NewProposalModal 
        isOpen={showProposalModal}
        existingProposal={projectToEdit}
        onClose={() => { setShowProposalModal(false); setProjectToEdit(null); }}
        onSaved={() => { setShowProposalModal(false); setProjectToEdit(null); fetchClientData(); }}
        initialClientId={clientId}
        onOpenAI={() => {
          setShowProposalModal(false);
          if (typeof window !== 'undefined' && (window as any).__openProposalAssistant) {
            (window as any).__openProposalAssistant();
          }
        }}
      />


      {/* Modal de Edición de Items (Pagos, Gastos, Adicionales, Cuentas por Pagar) */}
      {showEditItemModal && editingItem && editItemType && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '700px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} /> Editar {editItemType === 'payment' ? 'Pago' : editItemType === 'cost' ? 'Gasto' : editItemType === 'extra' ? 'Trabajo Adicional' : 'Cuenta por Pagar'}
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

            {editItemType === 'extra' && (
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
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Monto Extra a Cobrar (USD)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editItemForm.amount_usd || ''}
                    onChange={e => setEditItemForm({ ...editItemForm, amount_usd: handleMoneyInput(e.target.value) })}
                    onBlur={e => setEditItemForm({ ...editItemForm, amount_usd: formatOnBlur(e.target.value) })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Descripción del Trabajo Adicional</label>
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

      {/* Modal de Abono o Pago a Cuenta por Pagar */}
      {showCommitmentPayModal && commitmentToPay && (() => {
        const previouslyPaid = commitmentToPay.payable_accounts?.[0]?.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
        const totalCommitmentAmount = Number(commitmentToPay.amount_usd || (commitmentToPay.quantity * commitmentToPay.unit_price_usd));
        const currentBalance = Math.max(0, totalCommitmentAmount - previouslyPaid);

        return (
          <div className="modal-overlay hide-on-print" style={{ zIndex: 1000 }}>
            <div className="card modal-content animate-fade" style={{ maxWidth: '450px', width: '90%', padding: '2rem' }}>
              <h2 style={{ fontSize: '1.3rem', color: 'white', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={22} color="var(--success)" />
                {commitmentPayMode === 'total' ? 'Pagar Cuenta por Pagar Total' : 'Abonar a Cuenta por Pagar'}
              </h2>
              <div style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span>Proveedor / Beneficiario:</span>
                  <strong style={{ color: 'white' }}>{commitmentToPay.provider || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span>Total Cuenta por Pagar:</span>
                  <strong style={{ color: 'white' }}>${formatCurrency(totalCommitmentAmount)}</strong>
                </div>
                {previouslyPaid > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span>Abonado Previamente:</span>
                    <strong style={{ color: 'var(--success)' }}>${formatCurrency(previouslyPaid)}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Saldo Pendiente:</span>
                  <strong style={{ color: 'var(--danger)' }}>${formatCurrency(currentBalance)}</strong>
                </div>
              </div>
              <form onSubmit={handleCommitmentPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Monto (USD)</label>
                    {commitmentPayMode === 'abono' && (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: 0 }}
                        onClick={() => {
                          setCommitmentPayMode('total');
                          setCommitmentPayForm({
                            ...commitmentPayForm,
                            amount_usd: formatCurrency(currentBalance),
                            description: commitmentPayForm.description || `Pago total: ${commitmentToPay.description}`
                          });
                        }}
                      >
                        ⚡ Pagar saldo completo (${formatCurrency(currentBalance)})
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="text"
                      required
                      value={commitmentPayForm.amount_usd}
                      onChange={(e) => setCommitmentPayForm({ ...commitmentPayForm, amount_usd: handleMoneyInput(e.target.value) })}
                      onBlur={(e) => setCommitmentPayForm({ ...commitmentPayForm, amount_usd: formatOnBlur(e.target.value) })}
                      className="input-field"
                      style={{ paddingLeft: '2rem' }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Concepto / Descripción</label>
                  <input
                    type="text"
                    required
                    value={commitmentPayForm.description}
                    onChange={(e) => setCommitmentPayForm({ ...commitmentPayForm, description: e.target.value })}
                    className="input-field"
                    placeholder={commitmentPayMode === 'total' ? `Pago total: ${commitmentToPay.description}` : 'Ej: Pago parcial factura #123'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Referencia (Opcional)</label>
                  <input
                    type="text"
                    value={commitmentPayForm.reference}
                    onChange={(e) => setCommitmentPayForm({ ...commitmentPayForm, reference: e.target.value })}
                    className="input-field"
                    placeholder="Zelle, Transferencia, Efectivo..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Fecha de Pago</label>
                  <input
                    type="date"
                    required
                    value={commitmentPayForm.date}
                    onChange={(e) => setCommitmentPayForm({ ...commitmentPayForm, date: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowCommitmentPayModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    {commitmentPayMode === 'total' ? 'Confirmar Pago Total' : 'Confirmar Abono'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {selectedCommitmentForDetails && (
        <div className="modal-overlay hide-on-print" style={{ zIndex: 1000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '650px', width: '95%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', color: 'white', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ClipboardList size={24} color="var(--primary-color)" /> Detalles de la Cuenta por Pagar
                </h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <strong>Concepto:</strong> {selectedCommitmentForDetails.description} <br/>
                  <strong>Proveedor:</strong> {selectedCommitmentForDetails.provider || 'N/A'} | <strong>Fecha:</strong> {selectedCommitmentForDetails.date || new Date(selectedCommitmentForDetails.created_at).toISOString().split('T')[0]}
                </div>
              </div>
              <button onClick={() => setSelectedCommitmentForDetails(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            {(() => {
              const c = selectedCommitmentForDetails;
              const paid = c.payable_accounts?.[0]?.payable_payments?.reduce((s: any, p: any) => s + Number(p.amount_usd), 0) || 0;
              const total = Number(c.amount_usd || (c.quantity * c.unit_price_usd));
              const balance = total - paid;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Total Pactado</div>
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

                  <div>
                    <h4 style={{ margin: '0 0 1rem 0', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                      <Wallet size={18} /> Historial de Abonos
                    </h4>
                    {!c.payable_accounts?.[0]?.payable_payments || c.payable_accounts[0].payable_payments.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                        No hay abonos registrados para esta cuenta por pagar.
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
                            </tr>
                          </thead>
                          <tbody>
                            {c.payable_accounts[0].payable_payments.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((p: any) => (
                              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{p.date}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{p.description}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{p.reference || '-'}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>+ ${formatCurrency(p.amount_usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelectedCommitmentForDetails(null)}>Cerrar</button>
                    {!isViewer && balance > 0 && !isActionDisabledForSales(c.project_id) && (
                      <button 
                        className="btn-primary" 
                        style={{ flex: 1, justifyContent: 'center' }} 
                        onClick={() => {
                          setSelectedCommitmentForDetails(null);
                          setCommitmentToPay(c);
                          setCommitmentPayForm({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
                          setShowCommitmentPayModal(true);
                        }}
                      >
                        Abonar
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Editar Cliente */}
      {showEditClientModal && client && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} color="var(--accent-blue)" /> Editar Datos del Cliente
              </h2>
              <button 
                type="button" 
                onClick={() => setShowEditClientModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditClient} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Nombre Completo *</label>
                <input 
                  required
                  type="text" 
                  className="input-field" 
                  value={editClientForm.name} 
                  onChange={(e) => setEditClientForm({...editClientForm, name: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Empresa</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editClientForm.company_name} 
                  onChange={(e) => setEditClientForm({...editClientForm, company_name: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>RIF / CI</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editClientForm.tax_id} 
                  onChange={(e) => setEditClientForm({...editClientForm, tax_id: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Teléfono</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editClientForm.phone} 
                  onChange={(e) => setEditClientForm({...editClientForm, phone: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Email</label>
                <input 
                  type="email" 
                  className="input-field" 
                  value={editClientForm.email} 
                  onChange={(e) => setEditClientForm({...editClientForm, email: e.target.value})}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Estado del Cliente</label>
                <select
                  className="input-field"
                  value={editClientForm.status}
                  onChange={(e) => setEditClientForm({...editClientForm, status: e.target.value})}
                  style={{ background: 'var(--surface-elevated)', color: 'white' }}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Dirección</label>
                <textarea 
                  className="input-field" 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={editClientForm.address} 
                  onChange={(e) => setEditClientForm({...editClientForm, address: e.target.value})}
                ></textarea>
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                  disabled={savingClientEdit}
                >
                  {savingClientEdit ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : 'Guardar Cambios'}
                </button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => setShowEditClientModal(false)}
                  disabled={savingClientEdit}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Eliminación con Validación de Pendientes */}
      {showDeleteClientModal && client && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '520px' }}>
            {checkingDeletePending ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--primary-color)' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>Verificando registros del cliente...</h3>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>Comprobando si existen propuestas, obras o gastos vinculados.</p>
              </div>
            ) : clientPendingSummary?.hasPending ? (
              // CASO BLOQUEADO: TIENE ASUNTOS PENDIENTES
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', color: 'var(--danger)' }}>
                  <AlertTriangle size={28} />
                  <h3 style={{ margin: 0, color: 'var(--danger)' }}>No se puede eliminar el cliente</h3>
                </div>

                <p style={{ fontSize: '0.95rem', color: 'white', marginBottom: '1rem' }}>
                  El cliente <strong>{client.name}</strong> tiene registros activos o asuntos pendientes en el sistema:
                </p>

                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                    {clientPendingSummary.activeProjectsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5' }}>
                        • <strong>{clientPendingSummary.activeProjectsCount}</strong> Obras / Proyectos en ejecución
                      </li>
                    )}
                    {clientPendingSummary.proposalsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fde047' }}>
                        • <strong>{clientPendingSummary.proposalsCount}</strong> Propuesta(s) pendiente(s)
                      </li>
                    )}
                    {clientPendingSummary.historyProjectsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1' }}>
                        • <strong>{clientPendingSummary.historyProjectsCount}</strong> Obra(s) completada(s) / archivada(s)
                      </li>
                    )}
                    {clientPendingSummary.paymentsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#86efac' }}>
                        • <strong>{clientPendingSummary.paymentsCount}</strong> Pagos / Abonos registrados
                      </li>
                    )}
                    {clientPendingSummary.costsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5' }}>
                        • <strong>{clientPendingSummary.costsCount}</strong> Gastos de obra registrados
                      </li>
                    )}
                    {clientPendingSummary.commitmentsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fde047' }}>
                        • <strong>{clientPendingSummary.commitmentsCount}</strong> Cuentas por pagar vinculadas
                      </li>
                    )}
                    {clientPendingSummary.pendingTelegramCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fde047' }}>
                        • <strong>{clientPendingSummary.pendingTelegramCount}</strong> Entradas pendientes por aprobar desde Telegram
                      </li>
                    )}
                  </ul>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  💡 <strong>¿Por qué está protegido?</strong> Para preservar la trazabilidad contable y evitar inconsistencias financieras, un cliente con propuestas o proyectos no puede eliminarse directamente. Si ya no requiere al cliente, puede cambiar su estado a <strong>Inactivo</strong> o eliminar previamente sus proyectos asociados.
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ minWidth: '130px' }}
                    onClick={() => setShowDeleteClientModal(false)}
                  >
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              // CASO PERMITIDO: NO TIENE NINGÚN ASUNTO PENDIENTE
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', color: 'var(--danger)' }}>
                  <Trash2 size={28} />
                  <h3 style={{ margin: 0, color: 'var(--danger)' }}>Confirmar Eliminación</h3>
                </div>

                <p style={{ fontSize: '0.95rem', color: 'white', marginBottom: '0.75rem' }}>
                  ¿Estás seguro de que deseas eliminar permanentemente al cliente <strong>{client.name}</strong>?
                </p>

                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#86efac' }}>
                  <CheckCircle2 size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.4rem' }} />
                  Verificación completada: Este cliente no tiene propuestas, obras ni gastos pendientes asociados.
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Esta acción es irreversible y removerá la ficha del cliente del sistema. Será redirigido al listado de clientes.
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => setShowDeleteClientModal(false)}
                    disabled={deletingClient}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={handleConfirmDeleteClient}
                    disabled={deletingClient}
                  >
                    {deletingClient ? <><Loader2 size={16} className="animate-spin" /> Eliminando...</> : <><Trash2 size={16} /> Eliminar Cliente</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
