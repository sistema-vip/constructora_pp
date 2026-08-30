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
  DollarSign as DollarIcon,
  Eye,
  RotateCcw,
  Check,
  Ban,
  BarChart3,
  Save,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';
import { useUser } from '@/lib/UserContext';
import TelegramPendingPanel from '@/components/TelegramPendingPanel';
import ProjectTracking from '@/components/ProjectTracking';
import Image from 'next/image';
import { autoPopulateTrackingTasks } from '@/lib/projectTaskHelper';
import { parseProjectRelation, ProjectRelationInfo } from '@/lib/projectRelationsHelper';

interface Project {
  id: string;
  title: string;
  description: string;
  status: string;
  budget_usd: number;
  start_date: string;
  end_date: string;
  proposal_number?: number;
  clients?: {
    id?: string;
    name: string;
    company_name?: string | null;
    tax_id?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  archived_at: string | null;
  notes?: string | null;
  created_at: string;
  parent_project_id?: string | null;
  is_additional?: boolean;
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

interface PayableAccount {
  id: string;
  name?: string;
  description: string;
  provider?: string;
  category?: string;
  type?: string;
  quantity?: number;
  unit_price_usd?: number;
  amount_usd?: number;
  total_amount_usd?: number;
  date?: string;
  created_at?: string;
  status?: string;
  commitment_id?: string;
  payable_accounts?: { id?: string; status?: string; payable_payments?: { id?: string; amount_usd: number; description?: string; reference?: string; date?: string }[] }[];
  payable_payments?: { id?: string; amount_usd: number; description?: string; reference?: string; date?: string }[];
  paid?: number;
  balance?: number;
  isPaid?: boolean;
  isCancelled?: boolean;
}

export default function ProjectDashboard() {
  // Helper to parse simple **bold** markdown syntax
  const parseBoldText = (text: string | null | undefined) => {
    if (!text) return '';
    return text.replace(/\*\*/g, '');
  };

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
  const [payables, setPayables] = useState<PayableAccount[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPrintingReport, setIsPrintingReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'pagos' | 'gastos' | 'cuentas_pagar' | 'retiros' | 'adicionales' | 'seguimiento' | 'notas'>('pagos');

  // Estado para Notas del Proyecto
  const [projectNotes, setProjectNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Estado para impresión y detalles de cuentas por pagar
  const [activePrintJob, setActivePrintJob] = useState<'none' | 'project-report' | 'client-statement' | 'payable-voucher'>('none');
  const [printPayableData, setPrintPayableData] = useState<any>(null);
  const [selectedPayableForDetails, setSelectedPayableForDetails] = useState<any>(null);

  // Permisos
  const { role } = useUser();
  const isViewer = role === 'viewer' || (role === 'sales' && !!project && project.status !== 'proposal');
  const canEdit = !isViewer;

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showPayableModal, setShowPayableModal] = useState(false);

  // Forms state
  const [paymentForm, setPaymentForm] = useState({ amount_usd: '', reference: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [costForm, setCostForm] = useState({ description: '', provider: '', category: 'materials', quantity: 1, unit_price_usd: '', date: new Date().toISOString().split('T')[0] });
  const [extraForm, setExtraForm] = useState({ description: '', amount_usd: '' });
  const [advanceForm, setAdvanceForm] = useState({ partner_name: 'Henry Peraza', amount_usd: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [payableForm, setPayableForm] = useState({ description: '', provider: '', category: 'materials', type: 'proveedor', quantity: 1, unit_price_usd: '', total_amount_usd: '', date: new Date().toISOString().split('T')[0] });
  const [projectRelation, setProjectRelation] = useState<ProjectRelationInfo | null>(null);

  // Estado para pagos a cuentas por pagar
  const [showPayablePayModal, setShowPayablePayModal] = useState(false);
  const [payableToPay, setPayableToPay] = useState<any>(null);
  const [payablePayMode, setPayablePayMode] = useState<'abono' | 'total'>('abono');
  const [payablePayForm, setPayablePayForm] = useState({
    amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0]
  });

  // Estado para cerrar/archivar proyecto
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Estado para edición de gastos y cuentas por pagar
  const [editingCost, setEditingCost] = useState<Cost | null>(null);
  const [editingPayable, setEditingPayable] = useState<PayableAccount | null>(null);

  // Estados para edición inline (estilo clientes)
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editItemType, setEditItemType] = useState<'payment' | 'cost' | 'extra' | 'payable' | 'commitment' | 'advance' | null>(null);
  const [editItemForm, setEditItemForm] = useState<any>({});

  // Estados para eliminación protegida (estilo clientes)
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [adminActionType, setAdminActionType] = useState<'delete' | 'edit' | 'revert' | 'approve_proposal' | 'reject_proposal'>('delete');
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'payment' | 'cost' | 'extra' | 'payable' | 'commitment' | 'advance' } | null>(null);
  const [pendingEditItem, setPendingEditItem] = useState<{ item: any, type: 'payment' | 'cost' | 'extra' | 'payable' | 'commitment' | 'advance' } | null>(null);

  // Formulario de edición universal
  const [universalEditForm, setUniversalEditForm] = useState({
    description: '',
    amount_usd: '',
    unit_price_usd: '',
    quantity: 1,
    date: new Date().toISOString().split('T')[0],
    provider: '',
    reference: '',
    category: 'materials',
    partner_name: 'Henry Peraza'
  });

  useEffect(() => {
    if (projectId) {
      fetchProjectData();
      
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam === 'compromisos' || tabParam === 'cuentas_pagar') {
        setActiveTab('cuentas_pagar');
      } else if (tabParam === 'adicionales' || tabParam === 'detalles' || tabParam === 'propuesta_adicionales') {
        setActiveTab('adicionales');
      } else if (tabParam === 'gastos' || tabParam === 'pagos' || tabParam === 'retiros' || tabParam === 'seguimiento' || tabParam === 'notas') {
        setActiveTab(tabParam as any);
      }
    }
  }, [projectId, role]);

  async function fetchProjectData() {
    setLoading(true);
    try {
      const [
        projectRes,
        paymentsRes,
        costsRes,
        extrasRes,
        advancesRes,
        payablesRes,
        legacyCommitRes
      ] = await Promise.all([
        supabase.from('projects').select('*, clients(*)').eq('id', projectId).single(),
        supabase.from('project_payments').select('*').eq('project_id', projectId).order('date', { ascending: false }),
        supabase.from('project_costs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('project_extras').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
        supabase.from('partner_advances').select('*').eq('project_id', projectId).order('date', { ascending: false }),
        supabase.from('payable_accounts').select('*, payable_payments(id, amount_usd, description, reference, date)').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('project_commitments').select('*, payable_accounts(id, status, payable_payments(id, amount_usd, description, reference, date))').eq('project_id', projectId).order('date', { ascending: false })
      ]);

      if (projectRes.error) throw projectRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (costsRes.error) throw costsRes.error;
      if (extrasRes.error) throw extrasRes.error;
      if (advancesRes.error) throw advancesRes.error;

      // Unificar datos de Cuentas por Pagar
      const unifiedPayables: PayableAccount[] = [];
      const seenCommitmentIds = new Set<string>();

      if (!payablesRes.error && payablesRes.data) {
        payablesRes.data.forEach((p: any) => {
          if (p.commitment_id) seenCommitmentIds.add(p.commitment_id);
          const payments = p.payable_payments || [];
          const paid = payments.reduce((s: any, pay: any) => s + Number(pay.amount_usd || 0), 0);
          const totalAmt = Number(p.total_amount_usd || 0);
          const isPaid = p.status === 'paid' || paid >= totalAmt - 0.01;
          const isCancelled = p.status === 'cancelled';
          const balance = (isPaid || isCancelled) ? 0 : Math.max(0, totalAmt - paid);

          unifiedPayables.push({
            ...p,
            provider: p.name,
            total_amount_usd: totalAmt,
            amount_usd: totalAmt,
            date: p.date || (p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
            payable_payments: payments,
            paid,
            balance,
            isPaid,
            isCancelled
          });
        });
      }

      if (!legacyCommitRes.error && legacyCommitRes.data) {
        legacyCommitRes.data.forEach((c: any) => {
          if (!seenCommitmentIds.has(c.id)) {
            let payableType = 'otro';
            if (c.category === 'materials') payableType = 'proveedor';
            else if (c.category === 'labor') payableType = 'obrero';
            else if (c.category === 'equipment') payableType = 'alquiler';
            else if (c.category === 'subcontract') payableType = 'subcontratista';

            const linkedPayable = c.payable_accounts?.[0];
            const payments = linkedPayable?.payable_payments || [];
            const status = linkedPayable?.status || 'active';
            const totalAmt = Number(c.amount_usd || (Number(c.quantity || 1) * Number(c.unit_price_usd || 0)));
            const paid = payments.reduce((s: any, pay: any) => s + Number(pay.amount_usd || 0), 0);
            const isPaid = status === 'paid' || paid >= totalAmt - 0.01;
            const isCancelled = status === 'cancelled';
            const balance = (isPaid || isCancelled) ? 0 : Math.max(0, totalAmt - paid);

            unifiedPayables.push({
              id: c.id,
              name: c.provider || 'Proveedor sin nombre',
              provider: c.provider || 'Proveedor sin nombre',
              type: payableType,
              category: c.category,
              description: c.description,
              quantity: c.quantity || 1,
              unit_price_usd: c.unit_price_usd || totalAmt,
              amount_usd: totalAmt,
              total_amount_usd: totalAmt,
              date: c.date,
              created_at: c.created_at || c.date,
              status: status,
              commitment_id: c.id,
              payable_payments: payments,
              payable_accounts: c.payable_accounts,
              paid,
              balance,
              isPaid,
              isCancelled
            });
          }
        });
      }

      // Auto-heal en segundo plano: sincronizar cuentas que ya fueron 100% saldadas pero tienen status 'active'
      const payablesToHeal = unifiedPayables.filter(p => p.status === 'active' && p.isPaid && (p.paid ?? 0) > 0);
      if (payablesToHeal.length > 0) {
        Promise.all(payablesToHeal.map(p => supabase.from('payable_accounts').update({ status: 'paid' }).eq('id', p.id))).catch(console.error);
      }

      setProject(projectRes.data);

      // Obtener todos los proyectos del cliente para detectar relaciones padre/hijo
      let allClientProjects: any[] = [];
      if (projectRes.data?.client_id) {
        const { data: clientProjs } = await supabase
          .from('projects')
          .select('id, title, proposal_number, budget_usd, description, status, parent_project_id, created_at')
          .eq('client_id', projectRes.data.client_id);
        allClientProjects = clientProjs || [];
      }

      const relationInfo = parseProjectRelation(projectRes.data, allClientProjects);
      setProjectRelation(relationInfo);

      // Cargar notas del proyecto (con fallback a global_settings si la columna notes aún no existe en Supabase)
      if (projectRes.data?.notes) {
        setProjectNotes(projectRes.data.notes);
      } else {
        try {
          const { data: noteSetting } = await supabase
            .from('global_settings')
            .select('setting_value')
            .eq('setting_key', `project_notes_${projectId}`)
            .maybeSingle();
          if (noteSetting?.setting_value?.text) {
            setProjectNotes(noteSetting.setting_value.text);
          } else if (typeof noteSetting?.setting_value === 'string') {
            setProjectNotes(noteSetting.setting_value);
          }
        } catch {
          // Fallback silencioso si global_settings no contiene la clave
        }
      }
      setPayments(paymentsRes.data || []);
      setCosts(costsRes.data || []);
      setExtras(extrasRes.data || []);
      setAdvances(advancesRes.data || []);
      setPayables(unifiedPayables);

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
  const totalPayablesPending = payables.reduce((sum, p) => {
    // Si la cuenta está saldada o cancelada, se excluye de la deuda pendiente
    if (p.status === 'paid' || p.status === 'cancelled') return sum;
    const paid = (p.payable_payments || []).reduce((s: any, pay: any) => s + Number(pay.amount_usd || 0), 0);
    const totalAmount = Number(p.total_amount_usd || p.amount_usd || ((p.quantity || 1) * (p.unit_price_usd || 0)) || 0);
    const isPaid = paid >= totalAmount - 0.01;
    if (isPaid) return sum;
    const balance = Math.max(0, totalAmount - paid);
    return sum + balance;
  }, 0);
  const totalBudget = baseBudget + totalExtra;
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount_usd) || 0), 0);
  const balanceDue = totalBudget - totalPaid;
  const totalCosts = costs.reduce((sum, c) => sum + (Number(c.quantity || 0) * (Number(c.unit_price_usd) || 0)), 0);
  const estimatedProfit = totalBudget - totalCosts - totalPayablesPending;
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

  function openEditPayable(p: PayableAccount) {
    setEditingPayable(p);
    setPayableForm({
      description: p.description,
      provider: p.provider || p.name || '',
      category: p.category || 'materials',
      type: p.type || 'proveedor',
      quantity: p.quantity || 1,
      unit_price_usd: (p.unit_price_usd || p.total_amount_usd || p.amount_usd || '').toString(),
      total_amount_usd: (p.total_amount_usd || p.amount_usd || '').toString(),
      date: p.date || (p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
    });
    setShowPayableModal(true);
  }

  async function handleDeletePayable(id: string) {
    if (!confirm('¿Eliminar esta cuenta por pagar? Esta acción no se puede deshacer.')) return;
    const item = payables.find(p => p.id === id);
    if (item?.commitment_id) {
      await supabase.from('project_commitments').delete().eq('id', item.commitment_id);
    }
    const { error } = await supabase.from('payable_accounts').delete().eq('id', id);
    if (error) {
      // Intentar eliminar de project_commitments si es un registro legacy
      await supabase.from('project_commitments').delete().eq('id', id);
    }
    fetchProjectData();
  }

  const initiateDelete = (id: string, type: 'payment' | 'cost' | 'extra' | 'payable' | 'commitment' | 'advance') => {
    setItemToDelete({ id, type });
    setAdminActionType('delete');
    setShowAdminAuth(true);
    setAdminPassword('');
    setAuthError('');
  };

  const handleConfirmAdminAuth = async () => {
    const MASTER_KEY = '080911';
    if (adminPassword !== MASTER_KEY) {
      setAuthError('Contraseña incorrecta. Solo administradores autorizados.');
      return;
    }
    
    if (adminActionType === 'delete') {
      if (!itemToDelete) return;
      setDeleting(true);
      try {
        if (itemToDelete.type === 'payable' || itemToDelete.type === 'commitment') {
          const item = payables.find(p => p.id === itemToDelete.id);
          if (item?.commitment_id) {
            await supabase.from('project_commitments').delete().eq('id', item.commitment_id);
          }
          await supabase.from('payable_accounts').delete().eq('id', itemToDelete.id);
          await supabase.from('project_commitments').delete().eq('id', itemToDelete.id);
        } else {
          const tableMap: Record<string, string> = {
            payment: 'project_payments', cost: 'project_costs',
            extra: 'project_extras', advance: 'partner_advances'
          };
          const { error } = await supabase.from(tableMap[itemToDelete.type]).delete().eq('id', itemToDelete.id);
          if (error) throw error;
        }
        setShowAdminAuth(false);
        setItemToDelete(null);
        fetchProjectData();
      } catch (err: any) {
        alert('Error al eliminar: ' + err.message);
      } finally {
        setDeleting(false);
      }
    } else if (adminActionType === 'revert' || adminActionType === 'approve_proposal' || adminActionType === 'reject_proposal') {
      setShowAdminAuth(false);
      try {
        let newStatus = 'proposal';
        if (adminActionType === 'approve_proposal') newStatus = 'in_progress';
        if (adminActionType === 'reject_proposal') newStatus = 'cancelled';
        
        const { error } = await supabase
          .from('projects')
          .update({ status: newStatus })
          .eq('id', projectId);
        if (error) throw error;

        // Auto-poblar tareas de seguimiento al aprobar la propuesta
        if (newStatus === 'in_progress' && project?.description) {
          autoPopulateTrackingTasks(projectId, project.description);
        }

        fetchProjectData();
      } catch (err: any) {
        alert('Error al actualizar estado: ' + err.message);
      }
    } else if (adminActionType === 'edit') {
      setShowAdminAuth(false);
      if (pendingEditItem) {
        setEditingItem(pendingEditItem.item);
        setEditItemType(pendingEditItem.type);
        setEditItemForm({ ...pendingEditItem.item });
        setShowEditItemModal(true);
        setPendingEditItem(null);
      }
    }
  };

  const initiateEditItem = (item: any, type: 'payment' | 'cost' | 'extra' | 'payable' | 'commitment' | 'advance') => {
    if (isViewer) return;
    setPendingEditItem({ item, type });
    setAdminActionType('edit');
    setShowAdminAuth(true);
    setAdminPassword('');
    setAuthError('');
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
      } else if (editItemType === 'extra') {
        table = 'project_extras';
        updateData = {
          description: editItemForm.description,
          amount_usd: parseCurrency(editItemForm.amount_usd)
        };
      } else if (editItemType === 'advance') {
        table = 'partner_advances';
        updateData = {
          partner_name: editItemForm.partner_name,
          amount_usd: parseCurrency(editItemForm.amount_usd),
          description: editItemForm.description,
          date: editItemForm.date
        };
      } else if (editItemType === 'payable' || editItemType === 'commitment') {
        const up = parseCurrency(String(editItemForm.unit_price_usd || editItemForm.total_amount_usd || 0));
        const qty = Number(editItemForm.quantity || 1);
        const amount_usd = qty > 1 ? qty * up : (parseCurrency(String(editItemForm.total_amount_usd)) || up);

        // Actualizar payable_accounts
        await supabase.from('payable_accounts').update({
          name: editItemForm.provider || editItemForm.name || 'Proveedor sin nombre',
          total_amount_usd: amount_usd,
          description: editItemForm.description,
          status: editItemForm.status || 'active'
        }).eq('id', editingItem.id);

        if (editingItem.commitment_id) {
          await supabase.from('project_commitments').update({
            description: editItemForm.description,
            provider: editItemForm.provider || editItemForm.name,
            category: editItemForm.category || 'materials',
            quantity: qty,
            unit_price_usd: up,
            amount_usd: amount_usd,
            date: editItemForm.date
          }).eq('id', editingItem.commitment_id);
        } else {
          // Intentar actualizar en project_commitments por id directo si fuera legacy
          await supabase.from('project_commitments').update({
            description: editItemForm.description,
            provider: editItemForm.provider || editItemForm.name,
            category: editItemForm.category || 'materials',
            quantity: qty,
            unit_price_usd: up,
            amount_usd: amount_usd,
            date: editItemForm.date
          }).eq('id', editingItem.id);
        }
        
        setShowEditItemModal(false);
        setEditingItem(null);
        setEditItemType(null);
        fetchProjectData();
        return;
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

  async function handleAddPayable(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(payableForm.quantity || 1);
    const unitPrice = parseCurrency(String(payableForm.unit_price_usd));
    const totalAmt = qty > 1 && unitPrice > 0 ? qty * unitPrice : (parseCurrency(String(payableForm.total_amount_usd)) || unitPrice);

    let payableType = payableForm.type || 'proveedor';
    if (payableForm.category === 'materials') payableType = 'proveedor';
    else if (payableForm.category === 'labor') payableType = 'obrero';
    else if (payableForm.category === 'equipment') payableType = 'alquiler';
    else if (payableForm.category === 'subcontract') payableType = 'subcontratista';

    try {
      if (editingPayable) {
        // Actualizar cuenta existente
        const { error: paErr } = await supabase.from('payable_accounts').update({
          name: payableForm.provider || 'Proveedor sin nombre',
          type: payableType,
          total_amount_usd: totalAmt,
          description: payableForm.description
        }).eq('id', editingPayable.id);

        if (editingPayable.commitment_id) {
          await supabase.from('project_commitments').update({
            description: payableForm.description,
            provider: payableForm.provider,
            category: payableForm.category,
            quantity: qty,
            unit_price_usd: unitPrice || totalAmt,
            amount_usd: totalAmt,
            date: payableForm.date
          }).eq('id', editingPayable.commitment_id);
        }
        if (paErr) throw paErr;
      } else {
        // Crear nuevo registro sincronizado en project_commitments y payable_accounts
        const { data: newCommitment } = await supabase.from('project_commitments').insert([{
          project_id: projectId,
          description: payableForm.description,
          provider: payableForm.provider,
          category: payableForm.category,
          quantity: qty,
          unit_price_usd: unitPrice || totalAmt,
          amount_usd: totalAmt,
          date: payableForm.date
        }]).select().single();

        const { error: payableError } = await supabase.from('payable_accounts').insert([{
          name: payableForm.provider || 'Proveedor sin nombre',
          type: payableType,
          total_amount_usd: totalAmt,
          project_id: projectId,
          commitment_id: newCommitment?.id || null,
          description: payableForm.description,
          status: 'active'
        }]);

        if (payableError) throw payableError;
      }

      setShowPayableModal(false);
      setEditingPayable(null);
      setPayableForm({ description: '', provider: '', category: 'materials', type: 'proveedor', quantity: 1, unit_price_usd: '', total_amount_usd: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    } catch (err: any) {
      alert(`Error al guardar cuenta por pagar: ${err.message}`);
    }
  }

  async function handlePayablePayment(e: React.FormEvent) {
    e.preventDefault();
    if (isViewer || !payableToPay) return;

    const monto = parseFloat(payablePayForm.amount_usd) || 0;
    if (monto <= 0) return alert('El monto debe ser mayor a 0');

    try {
      let payableAccountId = payableToPay.id;

      // Si es un objeto legacy sin id directo en payable_accounts
      if (!payableAccountId || payableToPay.payable_accounts?.[0]?.id) {
        payableAccountId = payableToPay.payable_accounts?.[0]?.id || payableToPay.id;
      }

      // Verificar que exista en payable_accounts
      const { data: existingPayable } = await supabase.from('payable_accounts').select('id, total_amount_usd, status').eq('id', payableAccountId).maybeSingle();

      if (!existingPayable) {
        let payableType = 'otro';
        if (payableToPay.category === 'materials' || payableToPay.type === 'proveedor') payableType = 'proveedor';
        else if (payableToPay.category === 'labor' || payableToPay.type === 'obrero') payableType = 'obrero';
        else if (payableToPay.category === 'equipment' || payableToPay.type === 'alquiler') payableType = 'alquiler';
        else if (payableToPay.category === 'subcontract' || payableToPay.type === 'subcontratista') payableType = 'subcontratista';

        const { data: newPayable, error: createPayableErr } = await supabase.from('payable_accounts').insert([{
          name: payableToPay.provider || payableToPay.name || 'Proveedor sin nombre',
          type: payableType,
          total_amount_usd: Number(payableToPay.total_amount_usd || payableToPay.amount_usd || 0),
          project_id: projectId,
          commitment_id: payableToPay.commitment_id || payableToPay.id,
          description: payableToPay.description,
          status: 'active'
        }]).select().single();

        if (createPayableErr) throw new Error(`Error al crear la cuenta por pagar vinculada: ${createPayableErr.message}`);
        payableAccountId = newPayable.id;
      }

      // 1. Insertar en payable_payments
      const { error: payError } = await supabase.from('payable_payments').insert([{
        payable_account_id: payableAccountId,
        amount_usd: monto,
        description: payablePayForm.description,
        reference: payablePayForm.reference,
        date: payablePayForm.date
      }]);
      if (payError) throw new Error(`Error al registrar abono en la cuenta por pagar: ${payError.message}`);

      // 2. Insertar en project_costs (Gastos)
      const previouslyPaid = (payableToPay.payable_payments || payableToPay.payable_accounts?.[0]?.payable_payments || []).reduce((s: any, p: any) => s + Number(p.amount_usd), 0);
      const totalAmount = Number(payableToPay.total_amount_usd || payableToPay.amount_usd || (payableToPay.quantity * payableToPay.unit_price_usd) || 0);
      const remainingBalance = totalAmount - previouslyPaid - monto;
      const isFullPay = remainingBalance <= 0.01 || payablePayMode === 'total';

      const providerName = payableToPay.provider || payableToPay.name || 'Proveedor';
      const conceptText = payablePayForm.description || payableToPay.description || (isFullPay ? 'Liquidación total' : 'Abono');
      const refPart = payablePayForm.reference ? ` (Ref: ${payablePayForm.reference})` : '';

      const costDescription = isFullPay
        ? `Liquidación total cuenta por pagar: ${providerName} - ${conceptText}${refPart}`
        : `Abono a cuenta por pagar: ${providerName} - ${conceptText}${refPart}`;

      let costCategory = payableToPay.category || 'materials';
      if (payableToPay.type === 'obrero' || payableToPay.category === 'labor') costCategory = 'labor';
      else if (payableToPay.type === 'alquiler' || payableToPay.category === 'equipment') costCategory = 'equipment';
      else if (payableToPay.type === 'subcontratista' || payableToPay.category === 'subcontract') costCategory = 'subcontract';

      const { error: costError } = await supabase.from('project_costs').insert([{
        project_id: projectId,
        description: costDescription,
        provider: providerName,
        category: costCategory,
        quantity: 1,
        unit_price_usd: monto,
        total_usd: monto,
        date: payablePayForm.date
      }]);
      if (costError) throw new Error(`Error al registrar como gasto: ${costError.message}`);

      // 3. Actualizar estado a 'paid' si quedó saldada
      if (remainingBalance <= 0.01 || isFullPay) {
        await supabase.from('payable_accounts')
          .update({ status: 'paid' })
          .eq('id', payableAccountId);
      }

      setShowPayablePayModal(false);
      setPayableToPay(null);
      setPayablePayForm({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function handlePrintReport() {
    setIsPrintingReport(true);
    setActivePrintJob('project-report');
    setTimeout(() => {
      window.print();
      setIsPrintingReport(false);
      setActivePrintJob('none');
    }, 500);
  }

  function handlePrintClientStatement() {
    setIsPrintingReport(true);
    setActivePrintJob('client-statement');
    setTimeout(() => {
      window.print();
      setIsPrintingReport(false);
      setActivePrintJob('none');
    }, 500);
  }

  function handlePrintPayable(p: any) {
    setPrintPayableData(p);
    setActivePrintJob('payable-voucher');
    setTimeout(() => {
      window.print();
      setActivePrintJob('none');
      setPrintPayableData(null);
    }, 300);
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

  async function handleSaveNotes() {
    if (!projectId) return;
    setSavingNotes(true);
    try {
      // 1. Intentar actualizar directamente la columna notes en projects
      const { error: projError } = await supabase
        .from('projects')
        .update({ notes: projectNotes })
        .eq('id', projectId);

      if (projError) {
        console.warn('Fallo al actualizar columna notes en projects, guardando en global_settings:', projError.message);
        // 2. Fallback resiliente a global_settings si la columna aún no existe
        const { error: settingsError } = await supabase
          .from('global_settings')
          .upsert({
            setting_key: `project_notes_${projectId}`,
            setting_value: { text: projectNotes, updated_at: new Date().toISOString() }
          }, { onConflict: 'setting_key' });

        if (settingsError) throw settingsError;
      }

      setNotesSaved(true);
      if (project) {
        setProject({ ...project, notes: projectNotes });
      }
      setTimeout(() => setNotesSaved(false), 3000);
    } catch (err: any) {
      console.error('Error al guardar notas del proyecto:', err);
      alert('Error al guardar notas: ' + (err.message || err));
    } finally {
      setSavingNotes(false);
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
            {projectRelation?.isAdditional && projectRelation.parentProject && (
              <span className="badge" style={{ background: 'rgba(234, 88, 12, 0.2)', color: '#fb923c', border: '1px solid rgba(234, 88, 12, 0.4)', fontSize: '0.75rem', fontWeight: 600 }}>
                🔗 Adicional de {projectRelation.parentProject.proposal_number ? `#${projectRelation.parentProject.proposal_number}` : 'Obra Principal'}
              </span>
            )}
            {!projectRelation?.isAdditional && projectRelation?.additionals && projectRelation.additionals.length > 0 && (
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.75rem', fontWeight: 600 }}>
                ⭐ Principal (+{projectRelation.additionals.length} Adicional{projectRelation.additionals.length === 1 ? '' : 'es'})
              </span>
            )}
          </div>
        </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={() => router.push(`/proyectos?print=${project.id}`)}
            title="Imprimir Propuesta Original"
            style={{ padding: '0.65rem 1.1rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'var(--surface-color)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
          >
            <Printer size={16} /> Propuesta Original
          </button>
          <button
            className="btn-primary"
            onClick={handlePrintClientStatement}
            title="Imprimir Estado de Cuenta Oficial para el Cliente"
            style={{ padding: '0.65rem 1.2rem', display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }}
          >
            <FileText size={16} /> Imprimir Estado de Cuenta
          </button>
          <button
            className="btn-secondary"
            onClick={handlePrintReport}
            title="Imprimir Reporte Financiero Interno de Socios"
            style={{ padding: '0.65rem 1.1rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.3)', color: '#c4b5fd', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <BarChart3 size={16} /> Reporte para Socios
          </button>
          {project.status === 'in_progress' && (
            <>
              <button
                className="btn-primary"
                onClick={() => setShowCloseConfirm(true)}
                title="Cerrar proyecto"
                style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--success)', borderColor: 'var(--success)' }}
              >
                <CheckCircle size={18} /> Cerrar Proyecto
              </button>
              {!isViewer && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setAdminActionType('revert');
                    setShowAdminAuth(true);
                    setAdminPassword('');
                    setAuthError('');
                  }}
                  title="Retornar a Propuesta (requiere clave admin)"
                  style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#ffcc00', borderColor: '#ffcc00' }}
                >
                  <RotateCcw size={18} /> Retornar a Propuesta
                </button>
              )}
            </>
          )}
          {project.status === 'proposal' && !isViewer && (
            <>
              <button
                className="btn-primary"
                onClick={() => {
                  setAdminActionType('approve_proposal');
                  setShowAdminAuth(true);
                  setAdminPassword('');
                  setAuthError('');
                }}
                title="Aprobar Propuesta (requiere clave admin)"
                style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--success)', borderColor: 'var(--success)' }}
              >
                <Check size={18} /> Aprobar Propuesta
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setAdminActionType('reject_proposal');
                  setShowAdminAuth(true);
                  setAdminPassword('');
                  setAuthError('');
                }}
                title="Rechazar Propuesta (requiere clave admin)"
                style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#ffcc00', borderColor: '#ffcc00' }}
              >
                <Ban size={18} /> Rechazar Propuesta
              </button>
            </>
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
              <button className="btn-secondary" onClick={() => { setEditingPayable(null); setPayableForm({ description: '', provider: '', category: 'materials', type: 'proveedor', quantity: 1, unit_price_usd: '', total_amount_usd: '', date: new Date().toISOString().split('T')[0] }); setShowPayableModal(true); }} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(245,158,11,0.5)', color: 'var(--primary-color)' }}>
                <ClipboardList size={15} /> Cuenta por Pagar
              </button>
              <button className="btn-secondary" onClick={() => setShowAdvanceModal(true)} style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(168,85,247,0.5)', color: '#c084fc' }}>
                <Wallet size={15} /> Retiro de Socio
              </button>
            </>
          )}
        </div>
      )}

      {/* Panel de Entradas Pendientes de Telegram para este Proyecto */}
      {project && (
        <TelegramPendingPanel
          projectIdFilter={project.id}
          projects={[{
            id: project.id,
            title: project.title,
            clientName: project.clients?.name || 'Cliente sin nombre',
          }]}
        />
      )}

      {/* Banner de Proyectos Unificados */}
      {projectRelation?.additionals && projectRelation.additionals.length > 0 && !projectRelation.isAdditional && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(2, 132, 199, 0.03) 100%)',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🔗</span>
              <strong style={{ color: '#38bdf8', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Proyectos Unificados ({1 + projectRelation.additionals.length} Conceptos Consolidados)
              </strong>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Presupuesto Total Consolidado: <strong style={{ color: 'white', fontSize: '0.9rem' }}>${Number(project.budget_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD</strong>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '0.2rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Proyecto Base Principal (#{project.proposal_number || 'Base'})</div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem', margin: '0.2rem 0' }}>{project.title}</div>
              <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem' }}>${projectRelation.originalBudgetUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD</div>
            </div>
            {projectRelation.additionals.map((a: any, idx: number) => (
              <div key={a.id || idx} style={{ background: 'rgba(14, 165, 233, 0.05)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(14, 165, 233, 0.15)' }}>
                <div style={{ fontSize: '0.72rem', color: '#7dd3fc', textTransform: 'uppercase', fontWeight: 600 }}>Proyecto Unificado (#{a.proposal_number || 'Adicional'})</div>
                <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem', margin: '0.2rem 0' }}>{a.title}</div>
                <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem' }}>${Number(a.budget_usd || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD</div>
              </div>
            ))}
          </div>
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

        {/* 5. CUENTAS POR PAGAR */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(245,158,11,0.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <AlertCircle size={14} /> <span>Cuentas por Pagar</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${totalPayablesPending.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Deudas pendientes</div>
        </div>

        {/* 6. GANANCIA FINAL */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(145deg, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 100%)', borderColor: 'rgba(16,185,129,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingUp size={14} /> <span style={{ fontWeight: 700 }}>Ganancia Final</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>
            ${estimatedProfit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monto − Gastos − Cuentas por Pagar</div>
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
            className={`btn-secondary ${activeTab === 'cuentas_pagar' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'cuentas_pagar' ? 'var(--primary-color)' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('cuentas_pagar')}
          >Cuentas por Pagar</button>
          <button
            className={`btn-secondary ${activeTab === 'retiros' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'retiros' ? '#8b5cf6' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('retiros')}
          >Retiro de Socios</button>
          <button
            className={`btn-secondary ${activeTab === 'adicionales' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'adicionales' ? 'var(--accent-blue)' : 'transparent', border: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setActiveTab('adicionales')}
          ><PlusCircle size={15} /> Adicionales</button>
          {(project?.status === 'in_progress' || project?.status === 'completed') && (
            <button
              className={`btn-secondary ${activeTab === 'seguimiento' ? 'btn-primary' : ''}`}
              style={{ padding: '0.5rem 1rem', background: activeTab === 'seguimiento' ? '#10b981' : 'transparent', border: 'none', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('seguimiento')}
            >📋 Seguimiento</button>
          )}
          <button
            className={`btn-secondary ${activeTab === 'notas' ? 'btn-primary' : ''}`}
            style={{ padding: '0.5rem 1rem', background: activeTab === 'notas' ? '#f59e0b' : 'transparent', border: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setActiveTab('notas')}
          >
            <FileText size={15} /> Notas
          </button>
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


        {/* TAB: CUENTAS POR PAGAR */}
        {activeTab === 'cuentas_pagar' && (
          <div className="animate-fade">
            {(() => {
              const activePayablesList = payables.filter(p => {
                if (p.status === 'cancelled' || p.status === 'paid' || p.isPaid || p.isCancelled) return false;
                const paid = (p.payable_payments || []).reduce((s: any, pay: any) => s + Number(pay.amount_usd || 0), 0);
                const totalAmt = Number(p.total_amount_usd || p.amount_usd || ((p.quantity || 1) * (p.unit_price_usd || 0)) || 0);
                const isPaid = paid >= totalAmt - 0.01;
                const balance = isPaid ? 0 : Math.max(0, totalAmt - paid);
                return balance > 0.01 && p.status === 'active';
              });

              return (
                <div>
                  {activePayablesList.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <CheckCircle size={36} color="var(--success)" style={{ margin: '0 auto 0.75rem auto', display: 'block', opacity: 0.85 }} />
                      <p style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 600 }}>¡No hay cuentas por pagar pendientes!</p>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem' }}>Todas las deudas y compromisos de este proyecto han sido saldados.</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          <th style={{ textAlign: 'left', padding: '1rem' }}>FECHA</th>
                          <th style={{ textAlign: 'left', padding: '1rem' }}>CONCEPTO</th>
                          <th style={{ textAlign: 'left', padding: '1rem' }}>PROVEEDOR / BENEFICIARIO</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}>ESTADO</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}>SALDO (USD)</th>
                          <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePayablesList.map(p => {
                          const paid = (p.payable_payments || []).reduce((s: any, pay: any) => s + Number(pay.amount_usd || 0), 0);
                          const totalAmt = Number(p.total_amount_usd || p.amount_usd || ((p.quantity || 1) * (p.unit_price_usd || 0)) || 0);
                          const isPaid = p.status === 'paid' || paid >= totalAmt - 0.01;
                          const isCancelled = p.status === 'cancelled';
                          const balance = (isPaid || isCancelled) ? 0 : Math.max(0, totalAmt - paid);
                          
                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.date}</td>
                              <td style={{ padding: '1rem' }}>
                                {p.description}<br/>
                                {p.quantity && p.quantity > 1 && p.unit_price_usd ? (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.quantity} x ${Number(p.unit_price_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                ) : null}
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.provider || p.name || 'N/A'}</td>
                              <td style={{ padding: '1rem', textAlign: 'right' }}>
                                {isCancelled ? (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 'bold', padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>Cancelada</span>
                                ) : isPaid ? (
                                  <div style={{ fontSize: '0.8rem' }}>
                                    <div style={{ color: 'var(--success)', fontWeight: 'bold' }}>Saldada</div>
                                    <div style={{ color: 'var(--text-muted)' }}>${paid.toLocaleString('es-VE', { minimumFractionDigits: 2 })} / ${totalAmt.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                                  </div>
                                ) : paid > 0 ? (
                                  <div style={{ fontSize: '0.8rem' }}>
                                    <div style={{ color: 'var(--warning)', fontWeight: 'bold' }}>Abonado</div>
                                    <div style={{ color: 'var(--text-muted)' }}>${paid.toLocaleString('es-VE', { minimumFractionDigits: 2 })} / ${totalAmt.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 'bold', padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>Pendiente</span>
                                )}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balance > 0 ? 'var(--primary-color)' : 'var(--success)' }}>
                                {balance > 0 ? `- $${Number(balance).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00'}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button 
                                  className="btn-secondary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }}
                                  onClick={() => setSelectedPayableForDetails(p)}
                                  title="Ver detalles e imprimir"
                                >
                                  <Eye size={14} /> Detalles
                                </button>
                                <button 
                                  className="btn-secondary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                                  onClick={() => handlePrintPayable(p)}
                                  title="Imprimir"
                                >
                                  <Printer size={14} />
                                </button>
                                {!isViewer && balance > 0 && !isCancelled && !isPaid && (
                                  <>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.3)' }} 
                                      onClick={() => {
                                        setPayableToPay(p);
                                        setPayablePayMode('abono');
                                        setPayablePayForm({ amount_usd: '', description: `Abono: ${p.description || p.name || 'CxP'}`, reference: '', date: new Date().toISOString().split('T')[0] });
                                        setShowPayablePayModal(true);
                                      }} 
                                      title="Abonar monto parcial a la cuenta por pagar"
                                    >
                                      <DollarSign size={13} style={{ marginRight: '2px', display: 'inline' }} /> Abonar
                                    </button>
                                    <button 
                                      className="btn-primary" 
                                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'var(--success)', borderColor: 'var(--success)' }} 
                                      onClick={() => {
                                        setPayableToPay(p);
                                        setPayablePayMode('total');
                                        setPayablePayForm({
                                          amount_usd: formatCurrency(balance),
                                          description: `Liquidación total: ${p.description || p.name || 'CxP'}`,
                                          reference: '',
                                          date: new Date().toISOString().split('T')[0]
                                        });
                                        setShowPayablePayModal(true);
                                      }} 
                                      title="Pagar saldo total de la cuenta por pagar"
                                    >
                                      <CheckCircle size={13} style={{ marginRight: '2px', display: 'inline' }} /> Liquidar
                                    </button>
                                  </>
                                )}
                                {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }} onClick={() => initiateEditItem(p, 'payable')} title="Editar cuenta por pagar"><Edit3 size={14} /></button>)}
                                {!isViewer && (<button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(p.id, 'payable')}><Trash2 size={14} /></button>)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
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
                        {!isViewer && (
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }} onClick={() => initiateEditItem(a, 'advance')} title="Editar retiro"><Edit3 size={14} /></button>
                            <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => initiateDelete(a.id, 'advance')}><Trash2 size={14} /></button>
                          </div>
                        )}
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
          <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                  <PlusCircle size={20} color="var(--accent-blue)" /> Trabajos Adicionales
                </h3>
                <span style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', padding: '0.15rem 0.55rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
                  {extras.length}
                </span>
              </div>
              {!isViewer && (
                <button
                  className="btn-secondary"
                  onClick={() => setShowExtraModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    borderColor: 'var(--accent-blue)',
                    color: 'var(--accent-blue)'
                  }}
                >
                  <Plus size={15} /> + Trabajo Adicional
                </button>
              )}
            </div>

            {/* SECCIÓN DE PRESUPUESTOS / PROYECTOS UNIFICADOS */}
            {projectRelation?.additionals && projectRelation.additionals.length > 0 && (
              <div style={{ background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(2, 132, 199, 0.03) 100%)', border: '1px solid rgba(14, 165, 233, 0.3)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem', borderBottom: '1px solid rgba(14, 165, 233, 0.2)', paddingBottom: '0.6rem' }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#38bdf8', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🔗</span> Presupuestos Unificados al Contrato Principal
                    </h4>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Presupuestos y obras adicionales aprobados e integrados al valor de este proyecto.
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Suma Adicionales Unificados:</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>
                      +${projectRelation.totalAdditionalsBudget.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Contrato Base (#{project.proposal_number || 'Principal'})</span>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0' }}>Base</span>
                    </div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', margin: '0.4rem 0' }}>{project.title}</div>
                    <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1rem' }}>
                      ${projectRelation.originalBudgetUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
                    </div>
                  </div>

                  {projectRelation.additionals.map((add: any, idx: number) => (
                    <div key={add.id || idx} style={{ background: 'rgba(14, 165, 233, 0.06)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(14, 165, 233, 0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>
                          {add.proposal_number ? `Propuesta #${add.proposal_number}` : 'Trabajo Adicional'}
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(14, 165, 233, 0.2)', color: '#7dd3fc', fontWeight: 600 }}>
                          Unificado
                        </span>
                      </div>
                      <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', margin: '0.4rem 0' }}>{add.title}</div>
                      <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '1rem' }}>
                        +${Number(add.budget_usd || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '1px dashed rgba(14, 165, 233, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span style={{ color: '#94a3b8' }}>Total Presupuesto Consolidado de la Obra:</span>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>
                    ${Number(project.budget_usd || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
                  </span>
                </div>
              </div>
            )}

            {extras.length === 0 ? (
              <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <PlusCircle size={44} style={{ margin: '0 auto 1rem auto', display: 'block', opacity: 0.35, color: 'var(--accent-blue)' }} />
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'white', fontWeight: 600 }}>No hay trabajos adicionales registrados</p>
                <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Los trabajos adicionales se suman al presupuesto total del proyecto sin modificar la propuesta original.
                </p>
                {!isViewer && (
                  <button
                    className="btn-secondary"
                    onClick={() => setShowExtraModal(true)}
                    style={{ padding: '0.55rem 1.2rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
                  >
                    <Plus size={15} /> Registrar Primer Adicional
                  </button>
                )}
              </div>
            ) : (
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>DESCRIPCIÓN</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}>MONTO EXTRA (USD)</th>
                      {!isViewer && <th style={{ textAlign: 'right', padding: '1rem', width: '100px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {extras.map(e => (
                      <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '1rem', fontSize: '0.95rem' }}>{e.description}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-blue)', fontSize: '0.95rem' }}>
                          + ${Number(e.amount_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        {!isViewer && (
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: 'var(--primary-color)', borderColor: 'rgba(59,130,246,0.2)' }}
                                onClick={() => initiateEditItem({ ...e, amount_usd: formatCurrency(e.amount_usd) }, 'extra')}
                                title="Editar adicional"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }}
                                onClick={() => initiateDelete(e.id, 'extra')}
                                title="Eliminar adicional"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem', fontWeight: 'bold', textAlign: 'right' }}>Total Trabajos Adicionales:</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-blue)', fontSize: '1.05rem' }}>
                        + ${totalExtra.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {!isViewer && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.2rem 1.5rem',
              background: 'linear-gradient(145deg, rgba(59,130,246,0.08) 0%, rgba(0,0,0,0) 100%)',
              borderRadius: '10px',
              border: '1px solid rgba(59,130,246,0.2)',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'white' }}>Monto Total Contratado (Base + Extras):</span>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Base: ${baseBudget.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Extras: ${totalExtra.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-blue)' }}>
                ${totalBudget.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* TAB: SEGUIMIENTO */}
        {activeTab === 'seguimiento' && (
          <div className="animate-fade">
            <ProjectTracking
              projectId={projectId}
              projectTitle={project?.title}
              proposalNumber={project?.proposal_number}
              clientName={project?.clients?.name}
              clientData={project?.clients}
              projectDescription={project?.description || ''}
              startDate={project?.start_date}
              isAdditional={projectRelation?.isAdditional}
              parentProject={projectRelation?.parentProject}
              additionals={projectRelation?.additionals}
            />
          </div>
        )}

        {/* TAB: NOTAS DEL PROYECTO */}
        {activeTab === 'notas' && (
          <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                  <FileText size={20} style={{ color: '#f59e0b' }} /> Notas del Proyecto
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Espacio centralizado para bitácora, acuerdos con el cliente, apuntes técnicos de obra o pendientes del equipo.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {notesSaved && (
                  <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(16,185,129,0.1)', padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <CheckCircle2 size={16} /> Cambios guardados
                  </span>
                )}
                {canEdit && (
                  <button
                    className="btn-primary"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    style={{ minWidth: '160px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.25rem' }}
                  >
                    <Save size={17} />
                    {savingNotes ? 'Guardando...' : 'Guardar Notas'}
                  </button>
                )}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <textarea
                className="input-field"
                style={{
                  width: '100%',
                  minHeight: '320px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  fontSize: '0.92rem',
                  lineHeight: '1.6',
                  padding: '1rem 1.25rem',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  color: 'white'
                }}
                placeholder="Escribe aquí las notas del proyecto: bitácora de obra, acuerdos comerciales, especificaciones técnicas, números de contacto o temas pendientes..."
                value={projectNotes}
                onChange={(e) => setProjectNotes(e.target.value)}
                disabled={!canEdit}
                onKeyDown={(e) => {
                  // Atajo de teclado: Ctrl+Enter o Cmd+Enter para guardar notas
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (canEdit && !savingNotes) {
                      handleSaveNotes();
                    }
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>💡 Tip: Presiona <kbd style={{ padding: '0.1rem 0.35rem', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>Ctrl + Enter</kbd> para guardar rápidamente.</span>
                <span>{projectNotes.length} caracteres</span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Modales de Formulario */}
        
      {/* Modal de Abono o Pago a Cuenta por Pagar */}
      {showPayablePayModal && payableToPay && (() => {
          const previouslyPaid = (payableToPay.payable_payments || payableToPay.payable_accounts?.[0]?.payable_payments || []).reduce((s: any, p: any) => s + Number(p.amount_usd), 0);
          const totalPayableAmount = Number(payableToPay.total_amount_usd || payableToPay.amount_usd || (payableToPay.quantity * payableToPay.unit_price_usd) || 0);
          const currentBalance = Math.max(0, totalPayableAmount - previouslyPaid);

          return (
            <div className="modal-overlay">
              <div className="card modal-content animate-fade" style={{ maxWidth: '520px', width: '92%', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.35rem' }}>
                    {payablePayMode === 'total' ? (
                      <><CheckCircle size={22} color="var(--success)" /> Liquidar Cuenta por Pagar</>
                    ) : (
                      <><DollarSign size={22} color="var(--primary-color)" /> Registrar Abono</>
                    )}
                  </h2>
                  <button onClick={() => { setShowPayablePayModal(false); setPayableToPay(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
                      background: payablePayMode === 'abono' ? 'var(--primary-color)' : 'transparent',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      padding: '0.5rem'
                    }}
                    onClick={() => {
                      setPayablePayMode('abono');
                      setPayablePayForm({
                        ...payablePayForm,
                        amount_usd: '',
                        description: `Abono: ${payableToPay.description || payableToPay.name || 'CxP'}`
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
                      background: payablePayMode === 'total' ? 'var(--success)' : 'transparent',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      padding: '0.5rem'
                    }}
                    onClick={() => {
                      setPayablePayMode('total');
                      setPayablePayForm({
                        ...payablePayForm,
                        amount_usd: formatCurrency(currentBalance),
                        description: `Liquidación total: ${payableToPay.description || payableToPay.name || 'CxP'}`
                      });
                    }}
                  >
                    <CheckCircle size={15} /> Liquidar (Pagar Todo)
                  </button>
                </div>
                
                {/* Summary Box */}
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem 1.2rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Proveedor / Beneficiario:</span>
                    <strong style={{ color: 'white' }}>{payableToPay.provider || payableToPay.name || 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Cuenta por Pagar:</span>
                    <strong style={{ color: 'white' }}>${formatCurrency(totalPayableAmount)}</strong>
                  </div>
                  {previouslyPaid > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Abonado Previamente:</span>
                      <strong style={{ color: 'var(--success)' }}>${formatCurrency(previouslyPaid)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.9rem' }}>Saldo Pendiente Restante:</span>
                    <strong style={{ color: 'var(--danger)', fontSize: '1.05rem' }}>
                      ${formatCurrency(currentBalance)}
                    </strong>
                  </div>
                </div>

                <form onSubmit={handlePayablePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>Monto (USD)</label>
                      {payablePayMode === 'abono' && (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: 0 }}
                          onClick={() => {
                            setPayablePayMode('total');
                            setPayablePayForm({
                              ...payablePayForm,
                              amount_usd: formatCurrency(currentBalance),
                              description: `Liquidación total: ${payableToPay.description || payableToPay.name || 'CxP'}`
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
                      readOnly={payablePayMode === 'total'}
                      className="input-field"
                      style={payablePayMode === 'total' ? { background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.4)', fontWeight: 700, color: 'var(--success)' } : {}}
                      value={payablePayForm.amount_usd}
                      onChange={e => setPayablePayForm({...payablePayForm, amount_usd: handleMoneyInput(e.target.value)})}
                      onBlur={e => setPayablePayForm({...payablePayForm, amount_usd: formatOnBlur(e.target.value)})}
                      placeholder="Ej. 1500.00"
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Concepto / Descripción</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={payablePayForm.description}
                      onChange={e => setPayablePayForm({...payablePayForm, description: e.target.value})}
                      placeholder={payablePayMode === 'total' ? `Liquidación total: ${payableToPay.description || payableToPay.name || 'CxP'}` : 'Ej. Abono primera parte'}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Fecha de Pago</label>
                      <input type="date" required className="input-field" value={payablePayForm.date} onChange={e => setPayablePayForm({...payablePayForm, date: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Referencia / Recibo (Opcional)</label>
                      <input type="text" className="input-field" value={payablePayForm.reference} onChange={e => setPayablePayForm({...payablePayForm, reference: e.target.value})} placeholder="Ej. Zelle 1234, Recibo 42" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => { setShowPayablePayModal(false); setPayableToPay(null); }}>Cancelar</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      style={payablePayMode === 'total' ? { background: 'var(--success)', borderColor: 'var(--success)' } : {}}
                    >
                      {payablePayMode === 'total' ? (
                        <><CheckCircle size={16} /> Confirmar Liquidación Total</>
                      ) : (
                        <><DollarSign size={16} /> Confirmar Abono</>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

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

      {showPayableModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'white' }}>{editingPayable ? 'Editar Cuenta por Pagar' : 'Registrar Cuenta por Pagar'}</h2>
            <form onSubmit={handleAddPayable} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                <input type="date" required className="input-field" value={payableForm.date} onChange={e => setPayableForm({...payableForm, date: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor / Beneficiario</label>
                <input type="text" required placeholder="Ej. Ferretería EPA / Juan Pérez" className="input-field" value={payableForm.provider} onChange={e => setPayableForm({...payableForm, provider: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción / Concepto</label>
                <input type="text" required placeholder="Ej. Materiales de construcción" className="input-field" value={payableForm.description} onChange={e => setPayableForm({...payableForm, description: e.target.value})} />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Tipo / Categoría</label>
                <select className="input-field" value={payableForm.category} onChange={e => setPayableForm({...payableForm, category: e.target.value})}>
                  <option value="materials">Materiales (Proveedor)</option>
                  <option value="labor">Mano de Obra (Obrero)</option>
                  <option value="equipment">Equipos (Alquiler)</option>
                  <option value="subcontract">Subcontrato</option>
                  <option value="other">Otros</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                 <div style={{ flex: 1 }}>
                   <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Cantidad</label>
                   <input type="number" step="0.01" required className="input-field" value={payableForm.quantity} onChange={e => setPayableForm({...payableForm, quantity: parseFloat(e.target.value) || 0})} />
                 </div>
                 <div style={{ flex: 1 }}>
                   <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Precio Unitario / Total (USD)</label>
                   <input 
                     type="text" 
                     required 
                     className="input-field" 
                     value={payableForm.unit_price_usd} 
                     onChange={e => setPayableForm({...payableForm, unit_price_usd: handleMoneyInput(e.target.value), total_amount_usd: handleMoneyInput(e.target.value)})} 
                     onBlur={e => setPayableForm({...payableForm, unit_price_usd: formatOnBlur(e.target.value), total_amount_usd: formatOnBlur(e.target.value)})}
                   />
                 </div>
              </div>
              <div style={{ marginTop: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                 Total: ${(Number(payableForm.quantity || 1) * parseCurrency(String(payableForm.unit_price_usd))).toLocaleString('es-VE', {minimumFractionDigits: 2})}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowPayableModal(false); setEditingPayable(null); setPayableForm({ description: '', provider: '', category: 'materials', type: 'proveedor', quantity: 1, unit_price_usd: '', total_amount_usd: '', date: new Date().toISOString().split('T')[0] }); }}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{editingPayable ? 'Guardar Cambios' : 'Guardar Cuenta por Pagar'}</button>
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
              ¿Está seguro que desea cerrar este proyecto? Una vez cerrado, no podrá agregar más registros de pagos, gastos o cuentas por pagar.
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

      {/* MODAL DETALLES DE CUENTA POR PAGAR */}
      {selectedPayableForDetails && (
        <div className="modal-overlay hide-on-print" style={{ zIndex: 1000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '650px', width: '95%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', color: 'white', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={24} color="var(--primary-color)" /> Detalles de la Cuenta por Pagar
                </h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <strong>Concepto:</strong> {selectedPayableForDetails.description} <br/>
                  <strong>Proveedor / Beneficiario:</strong> {selectedPayableForDetails.provider || selectedPayableForDetails.name || 'N/A'} | <strong>Fecha:</strong> {selectedPayableForDetails.date}
                </div>
              </div>
              <button onClick={() => setSelectedPayableForDetails(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            {(() => {
              const p = selectedPayableForDetails;
              const paid = (p.payable_payments || p.payable_accounts?.[0]?.payable_payments || []).reduce((s: any, pay: any) => s + Number(pay.amount_usd), 0);
              const total = Number(p.total_amount_usd || p.amount_usd || ((p.quantity || 1) * (p.unit_price_usd || 0)) || 0);
              const isPaid = p.status === 'paid' || paid >= total - 0.01;
              const isCancelled = p.status === 'cancelled';
              const balance = (isPaid || isCancelled) ? 0 : Math.max(0, total - paid);
              const paymentsList = p.payable_payments || p.payable_accounts?.[0]?.payable_payments || [];

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
                    {paymentsList.length === 0 ? (
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
                            {paymentsList.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((pay: any) => (
                              <tr key={pay.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{pay.date}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{pay.description}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{pay.reference || '-'}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>+ ${formatCurrency(pay.amount_usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelectedPayableForDetails(null)}>Cerrar</button>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => handlePrintPayable(p)}>
                      <Printer size={16} /> Imprimir Vale
                    </button>
                    {!isViewer && balance > 0 && !isCancelled && !isPaid && (
                      <button 
                        className="btn-primary" 
                        style={{ flex: 1, justifyContent: 'center' }} 
                        onClick={() => {
                          setSelectedPayableForDetails(null);
                          setPayableToPay(p);
                          setPayablePayForm({ amount_usd: '', description: '', reference: '', date: new Date().toISOString().split('T')[0] });
                          setShowPayablePayModal(true);
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

      {/* ESTADO DE CUENTA PARA CLIENTE (PRINT) */}
      {activePrintJob === 'client-statement' && (
        <div className="show-only-on-print" style={{ display: 'none', color: 'black', background: 'white', padding: '2rem', width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
          {/* Encabezado con Logo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '1.2rem', marginBottom: '1.5rem' }}>
            <Image src="/logo_3d.png" alt="P&P Construye" width={190} height={85} style={{ objectFit: 'contain' }} />
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#000', letterSpacing: '0.5px' }}>ESTADO DE CUENTA</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#555' }}>Fecha de Emisión: <strong>{new Date().toLocaleDateString('es-VE')}</strong></p>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#555' }}>Propuesta / Obra: <strong>#{project.proposal_number || 'N/A'}</strong></p>
            </div>
          </div>

          {/* Información del Cliente y Obra */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '13px', textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>DATOS DEL CLIENTE</h4>
              <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                <div><strong>Cliente:</strong> {project.clients?.name || 'N/A'}</div>
                {project.clients?.company_name && <div><strong>Empresa:</strong> {project.clients.company_name}</div>}
                {project.clients?.tax_id && <div><strong>RIF / CI:</strong> {project.clients.tax_id}</div>}
                {project.clients?.phone && <div><strong>Teléfono:</strong> {project.clients.phone}</div>}
                {project.clients?.email && <div><strong>Email:</strong> {project.clients.email}</div>}
                {project.clients?.address && <div><strong>Dirección:</strong> {project.clients.address}</div>}
              </div>
            </div>

            <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '13px', textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>DATOS DEL PROYECTO</h4>
              <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                <div><strong>Proyecto:</strong> {project.title}</div>
                <div><strong>Estado:</strong> {project.status === 'completed' ? 'Completado' : 'En Ejecución'}</div>
                <div><strong>Fecha de Inicio:</strong> {new Date(project.created_at).toLocaleDateString('es-VE')}</div>
                {projectRelation?.isAdditional && projectRelation.parentProject && (
                  <div style={{ marginTop: '4px', color: '#c2410c', fontWeight: 600 }}>
                    <strong>Tipo:</strong> OBRA ADICIONAL vinculada a Obra #{projectRelation.parentProject.proposal_number || 'S/N'} ({projectRelation.parentProject.title})
                  </div>
                )}
                {!projectRelation?.isAdditional && projectRelation?.additionals && projectRelation.additionals.length > 0 && (
                  <div style={{ marginTop: '4px', color: '#15803d', fontWeight: 600 }}>
                    <strong>Tipo:</strong> CONTRATO PRINCIPAL (+{projectRelation.additionals.length} Adicional{projectRelation.additionals.length === 1 ? '' : 'es'} unificado{projectRelation.additionals.length === 1 ? '' : 's'})
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resumen de Estado de Cuenta */}
          <h3 style={{ fontSize: '15px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>RESUMEN DE CUENTA</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '13px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', background: '#f8fafc', width: '60%' }}>
                  Presupuesto Base Acordado (Original):
                </td>
                <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', width: '40%', textAlign: 'right', fontWeight: 600 }}>
                  ${formatCurrency(projectRelation?.originalBudgetUsd || baseBudget)}
                </td>
              </tr>
              {projectRelation?.additionals && projectRelation.additionals.length > 0 && (
                <tr>
                  <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                    Proyectos Adicionales Unificados ({projectRelation.additionals.length}):
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                    + ${formatCurrency(projectRelation.totalAdditionalsBudget)}
                  </td>
                </tr>
              )}
              {extras.length > 0 && (
                <tr>
                  <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', background: '#f8fafc' }}>Partidas Adicionales de Proyecto ({extras.length}):</td>
                  <td style={{ padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>+ ${formatCurrency(totalExtra)}</td>
                </tr>
              )}
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #94a3b8', fontSize: '14px' }}>TOTAL CONTRATADO / INVERSIÓN:</td>
                <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #94a3b8', textAlign: 'right', fontSize: '14px' }}>${formatCurrency(totalBudget)}</td>
              </tr>
              <tr style={{ background: '#f0fdf4' }}>
                <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #86efac', fontWeight: 'bold', color: '#166534' }}>TOTAL ABONADO / PAGADO:</td>
                <td style={{ padding: '0.7rem 0.8rem', border: '1px solid #86efac', textAlign: 'right', fontWeight: 'bold', color: '#166534', fontSize: '14px' }}>- ${formatCurrency(totalPaid)}</td>
              </tr>
              <tr style={{ background: balanceDue > 0 ? '#fffbeb' : '#f0fdf4' }}>
                <td style={{ padding: '0.8rem', border: '2px solid ' + (balanceDue > 0 ? '#f59e0b' : '#10b981'), fontWeight: 'bold', fontSize: '15px' }}>SALDO PENDIENTE POR PAGAR:</td>
                <td style={{ padding: '0.8rem', border: '2px solid ' + (balanceDue > 0 ? '#f59e0b' : '#10b981'), textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: balanceDue > 0 ? '#b45309' : '#166534' }}>
                  ${formatCurrency(balanceDue)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 1. Detalle de Contratación y Adicionales */}
          <h3 style={{ fontSize: '14px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>1. DETALLE DE PRESUPUESTO Y ADICIONALES</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>CONCEPTO / DESCRIPCIÓN</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center', width: '140px' }}>TIPO</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', width: '140px' }}>MONTO (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>
                  <strong>Presupuesto Base Original</strong>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{project.title}</div>
                </td>
                <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center', color: '#475569' }}>Contrato Base Original</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 600 }}>
                  ${formatCurrency(projectRelation?.originalBudgetUsd || baseBudget)}
                </td>
              </tr>
              {projectRelation?.additionals?.map((add, idx) => (
                <tr key={idx} style={{ background: '#f0fdf4' }}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>
                    <strong>{add.proposal_number ? `Propuesta Adicional #${add.proposal_number}: ` : ''}{add.title}</strong>
                    <div style={{ fontSize: '11px', color: '#166534' }}>Obra Adicional Unificada</div>
                  </td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>
                    Adicional Unificado
                  </td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                    + ${formatCurrency(add.budget_usd || 0)}
                  </td>
                </tr>
              ))}
              {extras.map(e => (
                <tr key={e.id}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>
                    <strong>{e.description}</strong>
                  </td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center', color: '#0284c7' }}>Trabajo Adicional</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>+ ${formatCurrency(e.amount_usd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right' }}>Total Inversión Acordada:</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontSize: '13px' }}>${formatCurrency(totalBudget)}</td>
              </tr>
            </tbody>
          </table>

          {/* 2. Historial de Pagos Recibidos */}
          <h3 style={{ fontSize: '14px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>2. HISTORIAL DE PAGOS Y ABONOS RECIBIDOS</h3>
          {payments.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '1.5rem', fontStyle: 'italic' }}>No se registran pagos o abonos recibidos hasta la fecha.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left', width: '100px' }}>FECHA</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'left' }}>CONCEPTO / DESCRIPCIÓN</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center', width: '140px' }}>REFERENCIA</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', width: '140px' }}>MONTO (USD)</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{p.date}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem' }}>{p.description || 'Abono a cuenta'}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'center', color: '#64748b' }}>{p.reference || 'N/A'}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '0.6rem', textAlign: 'right', fontWeight: 600, color: '#166534' }}>${formatCurrency(p.amount_usd)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f0fdf4', fontWeight: 'bold' }}>
                  <td colSpan={3} style={{ border: '1px solid #86efac', padding: '0.6rem', textAlign: 'right', color: '#166534' }}>Total Abonado Recibido:</td>
                  <td style={{ border: '1px solid #86efac', padding: '0.6rem', textAlign: 'right', color: '#166534', fontSize: '13px' }}>${formatCurrency(totalPaid)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Pie de página y Notas */}
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
      )}

      {/* REPORTE FINANCIERO DE SOCIOS (CONFIDENCIAL) */}
      {activePrintJob === 'project-report' && (
        <div className="show-only-on-print" style={{ display: 'none', color: 'black', background: 'white', padding: '1rem', width: '100%' }}>
        {/* Encabezado con Logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <Image src="/logo_3d.png" alt="Logo" width={180} height={80} style={{ objectFit: 'contain' }} />
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>REPORTE FINANCIERO DE SOCIOS</h2>
            <p style={{ margin: 0, fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>USO INTERNO EXCLUSIVO DE SOCIOS</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Fecha de Emisión: {new Date().toLocaleDateString('es-VE')}</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Propuesta: #{project.proposal_number || 'N/A'}</p>
          </div>
        </div>

        {/* Datos del Proyecto */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '16px' }}>PROYECTO: {project.title}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '12px' }}>
            <div><strong>Cliente:</strong> {project.clients?.name}</div>
            {project.clients?.company_name && <div><strong>Empresa:</strong> {project.clients.company_name}</div>}
            <div><strong>Estado Actual:</strong> {project.status === 'proposal' ? 'PROPUESTA' : project.status === 'in_progress' ? 'EN EJECUCIÓN' : 'COMPLETADO'}</div>
            <div><strong>Fecha de Inicio:</strong> {new Date(project.created_at).toLocaleDateString('es-VE')}</div>
            {projectRelation?.isAdditional && projectRelation.parentProject && (
              <div style={{ gridColumn: 'span 2', color: '#c2410c', fontWeight: 600, marginTop: '0.3rem' }}>
                🔗 TIPO: OBRA ADICIONAL vinculada a la Obra #{projectRelation.parentProject.proposal_number || 'S/N'} ({projectRelation.parentProject.title})
              </div>
            )}
          </div>
        </div>

        {/* Desglose de Presupuesto y Adicionales */}
        <h3 style={{ fontSize: '15px', fontWeight: 700, borderBottom: '1.5px solid #000', paddingBottom: '0.4rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>
          DESGLOSE DE PRESUPUESTO Y ADICIONALES
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.8rem', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f1f1f1' }}>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO / DESCRIPCIÓN</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center', width: '160px' }}>TIPO</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', width: '140px' }}>MONTO (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                <strong>Presupuesto Base Original</strong>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{project.title}</div>
              </td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center', color: '#475569' }}>Contrato Base Original</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                ${formatCurrency(projectRelation?.originalBudgetUsd || baseBudget)}
              </td>
            </tr>
            {projectRelation?.additionals?.map((add: any, idx: number) => (
              <tr key={idx} style={{ background: '#f0fdf4' }}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <strong>{add.proposal_number ? `Propuesta Adicional #${add.proposal_number}: ` : ''}{add.title}</strong>
                  <div style={{ fontSize: '11px', color: '#166534' }}>Obra Adicional Unificada</div>
                </td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>
                  Adicional Unificado
                </td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                  + ${formatCurrency(add.budget_usd || 0)}
                </td>
              </tr>
            ))}
            {extras.map((e: any) => (
              <tr key={e.id}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <strong>{e.description}</strong>
                </td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center', color: '#0284c7' }}>Trabajo Adicional</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>
                  + ${formatCurrency(e.amount_usd)}
                </td>
              </tr>
            ))}
            <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
              <td colSpan={2} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Presupuesto Contratado:</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontSize: '13px' }}>${formatCurrency(totalBudget)}</td>
            </tr>
          </tbody>
        </table>

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
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f8f9fa' }}><strong>Cuentas por Pagar Pendientes:</strong></td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(totalPayablesPending)}</td>
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

        {/* Detalle de Cuentas por Pagar */}
        <h3 style={{ fontSize: '16px', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem', marginBottom: '1rem' }}>3. CUENTAS POR PAGAR (PENDIENTES)</h3>
        {(() => {
          const pendingPayablesList = payables.map(p => {
            const paid = (p.payable_payments || p.payable_accounts?.[0]?.payable_payments || []).reduce((s: any, pay: any) => s + Number(pay.amount_usd), 0);
            const total = Number(p.total_amount_usd || p.amount_usd || ((p.quantity || 1) * (p.unit_price_usd || 0)) || 0);
            const isPaid = p.status === 'paid' || paid >= total - 0.01;
            const isCancelled = p.status === 'cancelled';
            const balance = (isPaid || isCancelled) ? 0 : Math.max(0, total - paid);
            return { ...p, total_amount: total, paid_amount: paid, balance };
          }).filter(p => p.balance > 0.01);
          const printPayablesTotal = pendingPayablesList.reduce((sum, p) => sum + p.balance, 0);

          return pendingPayablesList.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555', marginBottom: '1.5rem' }}>No hay cuentas por pagar pendientes por ejecutar.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f1f1' }}>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>FECHA</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>PROVEEDOR / BENEFICIARIO</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>TOTAL PACTADO</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>ABONADO</th>
                  <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>SALDO PENDIENTE (USD)</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayablesList.map(p => (
                  <tr key={p.id}>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.date}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.provider || p.name || 'N/A'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.description}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>${formatCurrency(p.total_amount)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#28a745' }}>${formatCurrency(p.paid_amount)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#d32f2f' }}>${formatCurrency(p.balance)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                  <td colSpan={5} style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Cuentas por Pagar Pendientes:</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#d32f2f' }}>${formatCurrency(printPayablesTotal)}</td>
                </tr>
              </tbody>
            </table>
          );
        })()}

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
      )}

      {/* VALE DE CUENTA POR PAGAR DE IMPRESIÓN */}
      {activePrintJob === 'payable-voucher' && printPayableData && (() => {
        const p = printPayableData;
        const paid = (p.payable_payments || p.payable_accounts?.[0]?.payable_payments || []).reduce((s: any, pay: any) => s + Number(pay.amount_usd), 0);
        const total = Number(p.total_amount_usd || p.amount_usd || ((p.quantity || 1) * (p.unit_price_usd || 0)) || 0);
        const isPaid = p.status === 'paid' || paid >= total - 0.01;
        const isCancelled = p.status === 'cancelled';
        const balance = (isPaid || isCancelled) ? 0 : Math.max(0, total - paid);
        const paymentsList = p.payable_payments || p.payable_accounts?.[0]?.payable_payments || [];

        return (
          <div className="show-only-on-print" style={{ display: 'none', color: 'black', background: 'white', padding: '2rem', width: '100%', maxWidth: '800px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '2rem' }}>
              <div>
                <Image src="/logo_3d.png" alt="Logo" width={150} height={60} style={{ objectFit: 'contain' }} />
                <div style={{ fontSize: '11px', color: '#555', marginTop: '0.5rem' }}>P&P Construye</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'uppercase' }}>VALE DE CUENTA POR PAGAR</h2>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '12px', color: '#555' }}>Fecha Emisión: {new Date().toLocaleDateString('es-VE')}</p>
                <p style={{ margin: '0', fontSize: '12px', color: '#555' }}>ID: {p.id.split('-')[0].toUpperCase()}</p>
              </div>
            </div>

            <div style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '13px' }}>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px', background: '#f8f9fa' }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Proyecto:</strong> {project?.title}</div>
                <div style={{ marginBottom: '0.5rem' }}><strong>Concepto:</strong> {p.description}</div>
                <div><strong>Proveedor / Beneficiario:</strong> {p.provider || p.name || 'N/A'}</div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px', background: '#f8f9fa' }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Fecha:</strong> {p.date}</div>
                <div style={{ marginBottom: '0.5rem' }}><strong>Cantidad:</strong> {p.quantity || 1}</div>
                <div><strong>Precio Unitario / Total:</strong> ${Number(p.unit_price_usd || total).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem', textAlign: 'center' }}>
              <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#555' }}>Total Pactado</div>
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
            {paymentsList.length === 0 ? (
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
                  {paymentsList.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((pay: any) => (
                    <tr key={pay.id}>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{pay.date}</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{pay.description}</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{pay.reference || '-'}</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'right' }}>${formatCurrency(pay.amount_usd)}</td>
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
        .show-only-on-print, .print-only { display: none; }
        @media print {
          body { 
            background: white !important; 
            color: black !important; 
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
          }
          .hide-on-print, nav, header, aside, .sidebar, .top-bar, .modal-overlay { display: none !important; }
          .show-only-on-print, .print-only { 
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: adminActionType === 'delete' ? 'var(--danger)' : 'var(--primary-color)' }}>
              {adminActionType === 'delete' ? <Trash2 size={28} /> : <AlertCircle size={28} />}
              <h3 style={{ marginBottom: '0.5rem', color: adminActionType === 'delete' ? 'var(--danger)' : adminActionType === 'revert' ? '#ffcc00' : adminActionType === 'approve_proposal' ? 'var(--success)' : adminActionType === 'reject_proposal' ? '#ffcc00' : 'var(--primary-color)' }}>
                {adminActionType === 'delete' ? '🗑️ Eliminar Renglón' : adminActionType === 'revert' ? '🔄 Retornar a Propuesta' : adminActionType === 'approve_proposal' ? '✅ Aprobar Propuesta' : adminActionType === 'reject_proposal' ? '🚫 Rechazar Propuesta' : '🔐 Acción Protegida'}
              </h3>
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {adminActionType === 'revert' 
                ? 'El proyecto regresará al estado de Propuesta. Ingrese la contraseña de administrador para continuar.'
                : adminActionType === 'approve_proposal'
                ? 'El proyecto pasará a estado En Ejecución. Ingrese la contraseña de administrador para continuar.'
                : adminActionType === 'reject_proposal'
                ? 'La propuesta será rechazada y enviada al historial. Ingrese la contraseña de administrador.'
                : adminActionType === 'delete' 
                ? 'Esta acción requiere autorización de administrador. Ingrese la contraseña de sistema para continuar.'
                : 'Esta acción requiere autorización de administrador. Ingrese la contraseña de sistema para continuar.'}
            </p>
            <div>
              <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Contraseña de Administrador</label>
              <input
                type="password"
                className="input-field"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmAdminAuth()}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            {authError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{authError}</p>}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAdminAuth(false); setAdminPassword(''); setAuthError(''); }}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, background: adminActionType === 'delete' ? 'var(--danger)' : adminActionType === 'revert' || adminActionType === 'reject_proposal' ? '#ffcc00' : adminActionType === 'approve_proposal' ? 'var(--success)' : 'var(--primary-color)', borderColor: adminActionType === 'delete' ? 'var(--danger)' : adminActionType === 'revert' || adminActionType === 'reject_proposal' ? '#ffcc00' : adminActionType === 'approve_proposal' ? 'var(--success)' : 'var(--primary-color)', color: adminActionType === 'revert' || adminActionType === 'reject_proposal' ? '#000' : '#fff' }} onClick={handleConfirmAdminAuth} disabled={deleting}>
                {adminActionType === 'delete' ? (deleting ? 'Eliminando...' : 'Confirmar Eliminación') : adminActionType === 'revert' ? 'Confirmar Retorno' : adminActionType === 'approve_proposal' ? 'Confirmar Aprobación' : adminActionType === 'reject_proposal' ? 'Confirmar Rechazo' : 'Autorizar Edición'}
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
              {editItemType === 'payment' ? '✏️ Editar Pago' : editItemType === 'cost' ? '✏️ Editar Gasto' : editItemType === 'extra' ? '✏️ Editar Trabajo Adicional' : editItemType === 'advance' ? '✏️ Editar Retiro' : '✏️ Editar Cuenta por Pagar'}
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
              {editItemType === 'extra' && (
                <>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción del Trabajo Adicional</label>
                    <input type="text" className="input-field" value={editItemForm.description || ''} onChange={e => setEditItemForm({...editItemForm, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto Extra a Cobrar (USD)</label>
                    <input type="text" className="input-field" value={editItemForm.amount_usd || ''} onChange={e => setEditItemForm({...editItemForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setEditItemForm({...editItemForm, amount_usd: formatOnBlur(e.target.value)})} />
                  </div>
                </>
              )}
              {editItemType === 'advance' && (
                <>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Socio</label>
                    <select className="input-field" value={editItemForm.partner_name} onChange={e => setEditItemForm({...editItemForm, partner_name: e.target.value})}>
                      <option value="Henry Peraza">Henry Peraza</option>
                      <option value="Losbers Perez">Losbers Perez</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto (USD)</label>
                    <input type="text" className="input-field" value={editItemForm.amount_usd} onChange={e => setEditItemForm({...editItemForm, amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setEditItemForm({...editItemForm, amount_usd: formatOnBlur(e.target.value)})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Concepto</label>
                    <input type="text" className="input-field" value={editItemForm.description} onChange={e => setEditItemForm({...editItemForm, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Fecha</label>
                    <input type="date" className="input-field" value={editItemForm.date} onChange={e => setEditItemForm({...editItemForm, date: e.target.value})} />
                  </div>
                </>
              )}
              {(editItemType === 'cost' || editItemType === 'payable' || editItemType === 'commitment') && (
                <>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
                    <input type="text" className="input-field" value={editItemForm.description} onChange={e => setEditItemForm({...editItemForm, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Proveedor / Beneficiario</label>
                    <input type="text" className="input-field" value={editItemForm.provider || editItemForm.name || ''} onChange={e => setEditItemForm({...editItemForm, provider: e.target.value, name: e.target.value})} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Cantidad</label>
                      <input type="number" className="input-field" value={editItemForm.quantity || 1} onChange={e => setEditItemForm({...editItemForm, quantity: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>P. Unitario / Total (USD)</label>
                      <input type="text" className="input-field" value={editItemForm.unit_price_usd || editItemForm.total_amount_usd} onChange={e => setEditItemForm({...editItemForm, unit_price_usd: handleMoneyInput(e.target.value), total_amount_usd: handleMoneyInput(e.target.value)})} onBlur={e => setEditItemForm({...editItemForm, unit_price_usd: formatOnBlur(e.target.value), total_amount_usd: formatOnBlur(e.target.value)})} />
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
