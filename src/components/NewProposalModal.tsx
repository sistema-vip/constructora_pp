'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Send, Loader2, CheckCircle, Save, FileText, User, DollarSign, Clock, HardHat, MessageSquare, Eye } from 'lucide-react';
import { modifyProposalText, refineProposalField, chatAndUpdateForm, ChatMessage, ProposalData, parseProposalTextToForm } from '@/app/actions/ai-actions';
import { supabase } from '@/lib/supabase';
import { handleMoneyInput, formatOnBlur, formatCurrency } from '@/lib/formatters';
import { useAdminAction } from '@/lib/useAdminAction';

interface Client { id: string; name: string; company_name?: string; }
interface Props { isOpen: boolean; onClose: () => void; onSaved?: () => void; onOpenAI?: () => void; initialClientId?: string; existingProposal?: any; }
type Mode = 'manual' | 'ai';
type Step = 'chat' | 'preview' | 'done';

const INITIAL_FORM_CHAT_MSG: ChatMessage = { role: 'model', text: '¡Hola! Soy Pepe. Escribe los detalles del proyecto y yo rellenaré el formulario por ti. También puedes modificar los campos a la izquierda manualmente.' };
const TEMPLATE_TODO_COSTO = 'La presente propuesta técnica y económica ha sido estructurada bajo la modalidad "A Todo Costo". Esta condición establece que el monto total presupuestado contempla el suministro integral de la totalidad de los materiales requeridos para la ejecución (tales como mantos, láminas de fibrocemento, cemento, pintura, etc.), así como los costos de fletes, maquinarias, herramientas menores, consumibles y la disposición de mano de obra altamente calificada. Nuestro compromiso es entregar el proyecto 100% terminado, operativo y con los más altos estándares de calidad, relevando al cliente de cualquier gestión de procura o gastos operativos adicionales.';
const TEMPLATE_MANO_OBRA = 'La presente propuesta técnica y económica ha sido estructurada bajo la modalidad de "Solo Mano de Obra". Bajo esta condición, P&P CONSTRUYE se encarga exclusivamente de la disposición de mano de obra altamente calificada y las herramientas necesarias para la ejecución del proyecto. El suministro integral de todos los materiales requeridos (tales como lajas, cemento, adhesivos, etc.), así como los costos de fletes de materiales, son responsabilidad directa del cliente.';
const TEMPLATE_MATERIALES = 'La presente propuesta técnica y económica ha sido estructurada bajo la modalidad de "Solo Materiales" (Suministro de Materiales). Bajo esta condición, P&P CONSTRUYE se encarga exclusivamente de la procura, suministro y entrega en obra de la totalidad de los materiales especificados en la propuesta técnica. La contratación, supervisión y pago de la mano de obra para la ejecución, así como las herramientas y equipos necesarios para la instalación de los mismos, son responsabilidad directa y exclusiva del cliente.';

const INIT_FORM = { 
  title: '', clientId: '', clientName: '', area: '', objective: '', phases: '', 
  investmentModality: TEMPLATE_TODO_COSTO, 
  time: '', amount: '', payment: '60% anticipo / 40% al finalizar',
  currency: 'Divisas',
  paymentMethods: 'Este presupuesto está expresado en divisas. Métodos de pago: Efectivo, Zelle y Binance.'
};

type ModalityType = 'todo-costo' | 'mano-obra' | 'materiales' | 'personalizado';

function detectModalityType(text: string): ModalityType {
  if (!text) return 'todo-costo';
  const lower = text.toLowerCase();
  if (lower.includes('todo costo')) return 'todo-costo';
  if (lower.includes('mano de obra')) return 'mano-obra';
  if (lower.includes('materiales')) return 'materiales';
  return 'personalizado';
}

export default function NewProposalModal({ isOpen, onClose, onSaved, initialClientId, existingProposal }: Props) {
  const { isSales } = useAdminAction();
  // Helper to parse simple **bold** markdown syntax
  const parseBoldText = (text: string | null | undefined) => {
    if (!text) return '';
    const parts = text.split('**');
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} style={{ fontWeight: 'bold' }}>{part}</strong>;
      }
      return part;
    });
  };

  const [mode, setMode] = useState<Mode>('manual');
  const [step, setStep] = useState<Step>('chat');
  const [selectedModality, setSelectedModality] = useState<ModalityType>('todo-costo');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_FORM_CHAT_MSG]);
  const [input, setInput] = useState('');
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [editableText, setEditableText] = useState('');
  const [aiRefinement, setAiRefinement] = useState('');
  const [refining, setRefining] = useState(false);
  const [linkedClientId, setLinkedClientId] = useState('');
  const [form, setForm] = useState(INIT_FORM);
  const [refiningField, setRefiningField] = useState<string | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) { 
      fetchClients(); 
      if (existingProposal) {
        loadExistingProposal();
      } else {
        reset(); 
      }
    }
  }, [isOpen, existingProposal]);

  async function loadExistingProposal() {
    setMode('manual'); setStep('chat'); setShowPreviewModal(false); setError(''); setInput('');
    setProposal({
       title: existingProposal.title,
       clientName: '',
       clientContact: '',
       date: '',
       area: '',
       investmentAmount: existingProposal.budget_usd?.toString() || '',
       executionTime: '',
       fullProposalText: existingProposal.description || ''
    } as any);
    setEditableText(existingProposal.description || '');
    setLinkedClientId(existingProposal.client_id || '');
    setMessages([{ role: 'model', text: '¡Hola! He cargado la propuesta existente. Puedes editarla en el formulario o pedirme cambios.' }]);
    
    if (existingProposal.description) {
      setLoading(true);
      const res = await parseProposalTextToForm(existingProposal.description);
      if (res.success && res.form) {
        setForm({ ...INIT_FORM, ...res.form, clientId: existingProposal.client_id || '', title: existingProposal.title || res.form.title, amount: existingProposal.budget_usd?.toString() || res.form.amount });
        setSelectedModality(detectModalityType(res.form.investmentModality || ''));
      } else {
        setForm({ ...INIT_FORM, title: existingProposal.title, clientId: existingProposal.client_id || '' });
        setSelectedModality('todo-costo');
      }
      setLoading(false);
    } else {
      setForm({ ...INIT_FORM, title: existingProposal.title, clientId: existingProposal.client_id || '' });
      setSelectedModality('todo-costo');
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function reset() {
    setMode('manual'); setStep('chat'); setShowPreviewModal(false); setError(''); setInput('');
    setProposal(null); setEditableText(''); 
    setLinkedClientId(initialClientId || '');
    setMessages([INITIAL_FORM_CHAT_MSG]); 
    setSelectedModality('todo-costo');
    
    const initialClient = clients.find(c => c.id === initialClientId);
    setForm({ ...INIT_FORM, clientId: initialClientId || '', clientName: initialClient?.name || '' });
  }

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name, company_name').order('name');
    setClients(data || []);
  }

  const handleChatFormSubmit = async () => {
    if (!input.trim() || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text: input.trim() }];
    setMessages(next); setInput(''); setLoading(true); setError('');
    try {
      const res = await chatAndUpdateForm(next, form, clients);
      if (res.success && res.reply && res.form) {
        setMessages(p => [...p, { role: 'model', text: res.reply! }]);
        const changedFields: Record<string, boolean> = {};
        Object.keys(res.form).forEach(key => {
          if (res.form[key] !== (form as any)[key]) changedFields[key] = true;
        });
        setForm(prev => ({ ...prev, ...res.form }));
        if (Object.keys(changedFields).length > 0) {
          setHighlightedFields(changedFields);
          setTimeout(() => setHighlightedFields({}), 2500);
        }
      } else setError(res.error || 'Error al procesar el chat');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  async function handleSave() {
    if (!proposal) return;
    if (isSales && existingProposal && existingProposal.status !== 'proposal') {
      return alert('Ventas no puede modificar proyectos aprobados.');
    }
    setLoading(true); setError('');
    try {
      const amountStr = String(proposal.investmentAmount ?? '');
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

      if (existingProposal) {
        const { error: err } = await supabase.from('projects').update({ client_id: linkedClientId || null, title: proposal.title, description: editableText, budget_usd: amount }).eq('id', existingProposal.id);
        if (err) throw new Error(err.message);
      } else {
        let proposalNumber = 1;
        const { data: maxRow } = await supabase
          .from('projects')
          .select('proposal_number')
          .not('proposal_number', 'is', null)
          .order('proposal_number', { ascending: false })
          .limit(1);
        if (maxRow && maxRow.length > 0) {
          proposalNumber = (maxRow[0].proposal_number || 0) + 1;
        }

        const { error: err } = await supabase.from('projects').insert([{ client_id: linkedClientId || null, title: proposal.title, description: editableText, status: 'proposal', budget_usd: amount, proposal_number: proposalNumber }]);
        if (err) throw new Error(err.message);
      }
      setStep('done'); onSaved?.();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleSaveManual() {
    setLoading(true); setError('');
    try {
      let modalityHeader = 'Presupuesto de Inversión (A Todo Costo)';
      if (selectedModality === 'mano-obra') modalityHeader = 'Presupuesto de Inversión (Solo Mano de Obra)';
      else if (selectedModality === 'materiales') modalityHeader = 'Presupuesto de Inversión (Materiales)';
      else if (selectedModality === 'personalizado') modalityHeader = 'Presupuesto de Inversión';

      const fullText = `Proyecto: ${form.title}\nFecha: ${new Date().toLocaleDateString()}\nPara: ${form.clientName}\nÁrea de Ejecución: ${form.area}\n\nObjetivo del Proyecto\n${form.objective}\n\nFases del Trabajo (Alcance Técnico)\n${form.phases}\n\nTiempo de Ejecución y Entrega\n${form.time}\n\n${modalityHeader}\n${form.investmentModality}\n\nINVERSIÓN TOTAL: $${form.amount}\n\nCondiciones y Métodos de Pago\nEsquema de Pago: ${form.payment}\nMoneda de Pago: ${form.currency}\nFormas de Pago: ${form.paymentMethods}`;
      setProposal({
        title: form.title,
        clientName: form.clientName,
        clientContact: '',
        date: new Date().toLocaleDateString(),
        area: form.area,
        investmentAmount: form.amount,
        executionTime: form.time,
        fullProposalText: fullText
      });
      setEditableText(fullText);
      setStep('preview');
      setMode('ai');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleAiRefine() {
    if (!aiRefinement.trim() || refining) return;
    setRefining(true); setError('');
    try {
      const res = await modifyProposalText(editableText, aiRefinement);
      if (res.success && res.modifiedText) {
        setEditableText(res.modifiedText);
        setAiRefinement('');
      } else setError(res.error || 'Error al refinar el texto');
    } catch (e: any) { setError(e.message); }
    finally { setRefining(false); }
  }

  const handleRefineField = async (fieldName: keyof typeof form, label: string) => {
    if (!form[fieldName] || refiningField === fieldName) return;
    setRefiningField(fieldName); setError('');
    try {
      const context = `Proyecto: ${form.title}. Cliente: ${form.clientName}`;
      const res = await refineProposalField(label, String(form[fieldName]), context);
      if (res.success && res.text) {
        setForm(prev => ({ ...prev, [fieldName]: res.text }));
        setHighlightedFields(prev => ({ ...prev, [fieldName]: true }));
        setTimeout(() => setHighlightedFields(prev => ({ ...prev, [fieldName]: false })), 2500);
      } else setError(res.error || 'Error al refinar campo');
    } catch (e: any) { setError(e.message); }
    finally { setRefiningField(null); }
  };

  if (!isOpen) return null;

  const chip = { display: 'flex', alignItems: 'center', gap: '.4rem', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '.35rem .85rem', fontSize: '.8rem', color: 'var(--text-muted)' } as React.CSSProperties;
  const cardStyle = { background: 'rgba(255,255,255,.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem 1.25rem' };

  return (
    <div className="proposal-modal-wrapper" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0c0e12', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* ── HEADER ── */}
      <div className="hide-on-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 2rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,.2),rgba(56,189,248,.2))', padding: '.55rem', borderRadius: '10px' }}>
            <FileText size={18} style={{ color: 'var(--primary-color)' }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{existingProposal ? 'Editar Propuesta' : 'Nueva Propuesta'}</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: '.78rem' }}>
              {mode === 'manual' ? 'Completa los campos o conversa con Pepe para que lo haga por ti.'
                : mode === 'ai' && step === 'preview' ? 'Revisa y edita antes de formalizar' : ''}
            </p>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '.4rem' }}>
          <X size={22} />
        </button>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* DONE */}
        {step === 'done' && (
          <div className="hide-on-print" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem', textAlign: 'center' }}>
            <div style={{ background: 'rgba(16,185,129,.1)', width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={36} style={{ color: 'var(--success)' }} />
            </div>
            <h3 style={{ color: 'white' }}>{existingProposal ? '¡Propuesta Actualizada!' : '¡Propuesta Formalizada!'}</h3>
            <p className="text-muted">Guardada con estado <strong style={{ color: 'var(--primary-color)' }}>Propuesta Pendiente</strong>.<br />Puedes hacerle seguimiento desde Proyectos.</p>
            <button className="btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        )}

        {/* AI PREVIEW (FORMALIZAR) */}
        {step !== 'done' && mode === 'ai' && step === 'preview' && proposal && (
          <div className="hide-on-print" style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem' }}>
                {[{ icon: <FileText size={13} />, label: proposal.title }, { icon: <User size={13} />, label: proposal.clientName || 'Cliente' }, { icon: <DollarSign size={13} />, label: `$${proposal.investmentAmount}` }, { icon: <Clock size={13} />, label: proposal.executionTime || 'Tiempo por definir' }].map((c, i) => (
                  <div key={i} style={chip}><span style={{ color: 'var(--primary-color)' }}>{c.icon}</span>{c.label}</div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                  <label style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Texto de la Propuesta (editable)</label>
                  <span style={{ fontSize: '.73rem', color: 'var(--primary-color)' }}>✏️ Edita antes de formalizar</span>
                </div>
                <textarea className="input-field" style={{ minHeight: 320, resize: 'vertical', fontFamily: 'monospace', fontSize: '.84rem', lineHeight: 1.85 }} value={editableText} onChange={e => setEditableText(e.target.value)} />
              </div>
              <div style={{ ...cardStyle, borderStyle: 'dashed', borderColor: 'var(--primary-color)', background: 'rgba(245,158,11,0.03)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                  <Sparkles size={14} /> Pide un ajuste a Pepe (IA)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="input-field" 
                    placeholder="Ej: 'Agrega un año de garantía' o 'Reduce el tiempo a 2 semanas'..." 
                    style={{ flex: 1, fontSize: '0.85rem' }}
                    value={aiRefinement}
                    onChange={e => setAiRefinement(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAiRefine()}
                  />
                  <button 
                    className="btn-primary" 
                    style={{ padding: '0 1rem', minWidth: 'auto', background: 'var(--primary-color)', color: 'black' }}
                    onClick={handleAiRefine}
                    disabled={refining || !aiRefinement.trim()}
                  >
                    {refining ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar'}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Vincular con Cliente Registrado (opcional)</label>
                <select className="input-field" value={linkedClientId} onChange={e => setLinkedClientId(e.target.value)}>
                  <option value="">Sin vincular</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` — ${c.company_name}` : ''}</option>)}
                </select>
              </div>
              {error && <div style={{ ...cardStyle, background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.3)' }}><p style={{ margin: 0, fontSize: '.85rem', color: 'var(--danger)' }}>{error}</p></div>}
            </div>
          </div>
        )}

        {/* MANUAL / AI SPLIT PANE */}
        {step !== 'done' && mode === 'manual' && step === 'chat' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            
            {/* LEFT PANE: Form */}
            <div className="hide-on-print" style={{ flex: 1.2, overflowY: 'auto', padding: '2rem', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Sección 1: Información General */}
              <div>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--primary-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}><FileText size={16}/> Información del Cliente y Proyecto</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Título del Proyecto</label>
                    <input className="input-field" style={{ transition: 'all 0.3s', boxShadow: highlightedFields.title ? '0 0 0 2px var(--primary-color)' : 'none' }} placeholder="Ej: Saneamiento de Emergencia y Reparación de Base" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Cliente Registrado</label>
                    <select className="input-field" value={form.clientId} onChange={e => { const c = clients.find(x => x.id === e.target.value); setForm({ ...form, clientId: e.target.value, clientName: c?.name || '' }); }}>
                      <option value="">Seleccionar...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Nombre en Propuesta</label>
                    <input className="input-field" style={{ transition: 'all 0.3s', boxShadow: highlightedFields.clientName ? '0 0 0 2px var(--primary-color)' : 'none' }} placeholder="Ej: Familia Martínez" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Área de Ejecución</label>
                    <input className="input-field" style={{ transition: 'all 0.3s', boxShadow: highlightedFields.area ? '0 0 0 2px var(--primary-color)' : 'none' }} placeholder="Ej: 17 m²" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Sección 2: Detalles Técnicos */}
              <div>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--primary-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}><HardHat size={16} /> Detalles Técnicos y Alcance</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                      <label style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Objetivo del Proyecto</label>
                      <button onClick={() => handleRefineField('objective', 'Objetivo del Proyecto')} disabled={refiningField === 'objective'} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                        {refiningField === 'objective' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Redactar con IA
                      </button>
                    </div>
                    <textarea className="input-field" style={{ minHeight: 90, resize: 'vertical', transition: 'all 0.3s', boxShadow: highlightedFields.objective ? '0 0 0 2px var(--primary-color)' : 'none' }} placeholder="Descripción técnica del objetivo..." value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                      <label style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Fases del Trabajo</label>
                      <button onClick={() => handleRefineField('phases', 'Fases del Trabajo')} disabled={refiningField === 'phases'} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                        {refiningField === 'phases' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Estructurar con IA
                      </button>
                    </div>
                    <textarea className="input-field" style={{ minHeight: 110, resize: 'vertical', transition: 'all 0.3s', boxShadow: highlightedFields.phases ? '0 0 0 2px var(--primary-color)' : 'none' }} placeholder="1. Saneamiento Estructural: ...\n2. Corrección de Pendiente: ..." value={form.phases} onChange={e => setForm({ ...form, phases: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Sección 3: Económico y Tiempo */}
              <div>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--primary-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}><DollarSign size={16}/> Condiciones Económicas y Tiempo</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Tiempo de Ejecución</label>
                    <input className="input-field" style={{ transition: 'all 0.3s', boxShadow: highlightedFields.time ? '0 0 0 2px var(--primary-color)' : 'none' }} placeholder="Ej: 4 a 5 días hábiles" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Monto Total (USD)</label>
                    <input className="input-field" style={{ transition: 'all 0.3s', boxShadow: highlightedFields.amount ? '0 0 0 2px var(--success)' : 'none' }} type="text" placeholder="Ej: 1182,25" value={form.amount} onChange={e => setForm({ ...form, amount: handleMoneyInput(e.target.value) })} onBlur={e => setForm({ ...form, amount: formatOnBlur(e.target.value) })} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                      <label style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Condiciones de Pago</label>
                      <div style={{ display: 'flex', gap: '.5rem' }}>
                        {['60/40', '50/50', '100%'].map(preset => (
                          <button key={preset} onClick={() => setForm({ ...form, payment: preset === '60/40' ? '60% anticipo / 40% al finalizar' : preset === '50/50' ? '50% anticipo / 50% al finalizar' : '100% anticipo' })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '.7rem', padding: '.15rem .4rem', cursor: 'pointer' }}>{preset}</button>
                        ))}
                      </div>
                    </div>
                    <input className="input-field" style={{ transition: 'all 0.3s', boxShadow: highlightedFields.payment ? '0 0 0 2px var(--primary-color)' : 'none' }} value={form.payment} onChange={e => setForm({ ...form, payment: e.target.value })} />
                  </div>
                  
                  {/* Moneda y Formas de Pago */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Moneda de Pago</label>
                    <select 
                      className="input-field" 
                      value={form.currency} 
                      onChange={e => {
                        const type = e.target.value;
                        let methods = '';
                        if (type === 'Divisas') {
                          methods = 'Este presupuesto está expresado en divisas. Métodos de pago: Efectivo, Zelle y Binance.';
                        } else if (type === 'Bolívares') {
                          methods = 'Este presupuesto está expresado en Bolívares. Métodos de pago: Transferencia Bancaria, Pago Móvil aplicando siempre la tasa Euro oficial vigente.';
                        } else {
                          methods = form.paymentMethods;
                        }
                        setForm({ ...form, currency: type, paymentMethods: methods });
                      }}
                    >
                      <option value="Divisas">Divisas</option>
                      <option value="Bolívares">Bolívares</option>
                      <option value="Mixto / Otro">Mixto / Otro</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '.4rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>Formas de Pago</label>
                    <textarea 
                      className="input-field" 
                      style={{ minHeight: 60, resize: 'vertical' }} 
                      placeholder="Ej: Efectivo, Zelle, Transferencia..." 
                      value={form.paymentMethods} 
                      onChange={e => setForm({ ...form, paymentMethods: e.target.value })} 
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.6rem' }}>
                      <label style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Modalidad del Presupuesto</label>
                      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)', gap: '4px' }}>
                        {[
                          { id: 'todo-costo', label: 'Todo costo', template: TEMPLATE_TODO_COSTO },
                          { id: 'mano-obra', label: 'Mano de obra', template: TEMPLATE_MANO_OBRA },
                          { id: 'materiales', label: 'Materiales', template: TEMPLATE_MATERIALES },
                          { id: 'personalizado', label: 'Personalizado', template: null }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              setSelectedModality(tab.id as ModalityType);
                              if (tab.template !== null) {
                                setForm(prev => ({ ...prev, investmentModality: tab.template }));
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              border: 'none',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              background: selectedModality === tab.id ? 'var(--primary-color)' : 'transparent',
                              color: selectedModality === tab.id ? '#000' : 'var(--text-muted)',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea 
                      className="input-field" 
                      style={{ minHeight: 70, resize: 'vertical', transition: 'all 0.3s', boxShadow: highlightedFields.investmentModality ? '0 0 0 2px var(--primary-color)' : 'none' }} 
                      value={form.investmentModality} 
                      onChange={e => {
                        const val = e.target.value;
                        setForm({ ...form, investmentModality: val });
                        if (val !== TEMPLATE_TODO_COSTO && val !== TEMPLATE_MANO_OBRA && val !== TEMPLATE_MATERIALES) {
                          setSelectedModality('personalizado');
                        } else {
                          setSelectedModality(detectModalityType(val));
                        }
                      }} 
                    />
                  </div>
                  {error && <div style={{ gridColumn: 'span 2', ...cardStyle, background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.3)' }}><p style={{ margin: 0, fontSize: '.85rem', color: 'var(--danger)' }}>{error}</p></div>}
                </div>
              </div>
            </div>

            {/* RIGHT PANE: Chat */}
            <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
              
              <div className="hide-on-print" style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', textAlign: 'center', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <MessageSquare size={16} /> Chat con Pepe
              </div>

              {/* Tab Content: Chat */}
                <div className="hide-on-print" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {messages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {msg.role === 'model' && (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, marginRight: '.5rem', marginTop: '.15rem', border: '1px solid var(--primary-color)' }}>
                            <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ maxWidth: '85%', padding: '.75rem 1rem', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? 'linear-gradient(135deg,var(--primary-color),#d97706)' : 'rgba(255,255,255,.05)', border: msg.role === 'model' ? '1px solid rgba(255,255,255,.1)' : 'none', color: msg.role === 'user' ? '#000' : 'var(--text-primary)', fontSize: '.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--primary-color)' }}>
                          <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '16px 16px 16px 4px', padding: '.75rem 1rem', display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                          {[0, 1, 2].map(d => <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-color)', display: 'inline-block', animation: `bounce 1s infinite ${d * .2}s` }} />)}
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  
                  <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,.15)', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <textarea
                      className="input-field"
                      style={{ flex: 1, minHeight: 45, maxHeight: 120, resize: 'none', fontSize: '.9rem', padding: '0.6rem 1rem', borderRadius: '20px' }}
                      placeholder="Pídele a Pepe que rellene algo..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatFormSubmit(); } }}
                      disabled={loading}
                    />
                    <button onClick={handleChatFormSubmit} disabled={loading || !input.trim()} className="btn-primary" style={{ padding: '0.7rem', borderRadius: '50%', minWidth: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} style={{ marginLeft: '-2px' }} />}
                    </button>
                  </div>
                </div>

            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      {step !== 'done' && (
        <div className="hide-on-print" style={{ padding: '1rem 2rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem', justifyContent: 'flex-end', background: 'rgba(0,0,0,.2)', flexShrink: 0 }}>
          {mode === 'ai' && step === 'preview' ? (
            <>
              <button className="btn-secondary" onClick={() => { setMode('manual'); setStep('chat'); }}>← Seguir editando</button>
              <button className="btn-primary" onClick={handleSave} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 195, justifyContent: 'center' }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : <><Save size={15} /> {existingProposal ? 'Guardar Cambios' : 'Confirmar Guardado'}</>}
              </button>
            </>
          ) : mode === 'manual' && step === 'chat' && (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button className="btn-secondary" onClick={() => setShowPreviewModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 150, justifyContent: 'center' }}>
                <Eye size={15} /> Previsualización
              </button>
              <button className="btn-primary" onClick={handleSaveManual} disabled={loading || !form.title.trim()} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 195, justifyContent: 'center' }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Preparando...</> : <><FileText size={15} /> {existingProposal ? 'Guardar Cambios' : 'Formalizar Propuesta'}</>}
              </button>
            </>
          )}
        </div>
      )}

      {/* Estilos Globales para la Impresión */}
      {showPreviewModal && (
        <div className="modal-overlay print-modal" style={{ zIndex: 1100 }}>
          <div className="card modal-content print-content animate-fade" style={{ maxWidth: '850px', width: '95%', maxHeight: '95vh', overflowY: 'auto', padding: 0, background: '#e5e7eb' }}>
            
            <div className="hide-on-print" style={{ position: 'sticky', top: 0, background: 'var(--surface-color)', padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Eye size={20}/> Previsualización de Propuesta</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={() => window.print()} 
                  className="btn-primary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: 'white', color: 'black', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                >
                  🖨️ Imprimir
                </button>
                <button onClick={() => setShowPreviewModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            <div style={{ padding: '2rem' }}>
              {/* Contenedor del documento imprimible estilo A4 */}
              <div id="printable-draft" style={{ 
                background: 'white', 
                color: 'black', 
                padding: '3rem 4rem', 
                width: '100%',
                margin: '0 auto', 
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                fontFamily: 'Arial, sans-serif',
                fontSize: '11pt',
                lineHeight: '1.6'
              }}>
                {/* ENCABEZADO / MEMBRETE */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Se usa el logo del proyecto */}
                    <img src="/logo_3d.png" alt="P&P Construye" style={{ width: '160px', objectFit: 'contain' }} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <h2 style={{ margin: 0, fontSize: '18pt', color: '#000', fontWeight: 800, textTransform: 'uppercase' }}>Propuesta</h2>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '10pt', color: '#555' }}>Fecha: {new Date().toLocaleDateString('es-VE')}</p>
                  </div>
                </div>

                {/* DATOS PRINCIPALES */}
                <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div><strong style={{ color: '#000' }}>Para:</strong> {form.clientName || '_______________'}</div>
                  <div><strong style={{ color: '#000' }}>Proyecto:</strong> {form.title || '_______________'}</div>
                  {form.area && <div><strong style={{ color: '#000' }}>Área de Ejecución:</strong> {form.area}</div>}
                </div>

                {/* OBJETIVO */}
                {form.objective && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '11pt', color: '#000', borderBottom: '1px solid #ccc', paddingBottom: '0.25rem' }}>Objetivo del Proyecto</h3>
                    <p style={{ margin: 0, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{parseBoldText(form.objective)}</p>
                  </div>
                )}

                {/* ALCANCE / FASES */}
                {form.phases && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '11pt', color: '#000', borderBottom: '1px solid #ccc', paddingBottom: '0.25rem' }}>Fases del Trabajo (Alcance Técnico)</h3>
                    <p style={{ margin: 0, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{parseBoldText(form.phases)}</p>
                  </div>
                )}

                {/* INVERSION Y TIEMPO */}
                <div style={{ marginTop: '2rem', background: '#f9f9f9', padding: '1.5rem', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '12pt', color: '#000', textAlign: 'center' }}>Resumen Financiero y Ejecución</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 0.5rem 0' }}><strong style={{ color: '#000' }}>Inversión Total (USD):</strong> ${form.amount ? formatCurrency(form.amount) : '0,00'}</p>
                      <p style={{ margin: '0 0 0.5rem 0' }}><strong style={{ color: '#000' }}>Condiciones de Pago:</strong> {form.payment}</p>
                      <p style={{ margin: '0 0 0.5rem 0' }}><strong style={{ color: '#000' }}>Tiempo Estimado:</strong> {form.time || '_______________'}</p>
                      {form.currency && <p style={{ margin: '0 0 0.5rem 0' }}><strong style={{ color: '#000' }}>Moneda de Pago:</strong> {form.currency}</p>}
                    </div>
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '9pt', color: '#555', fontStyle: 'italic', textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{parseBoldText(form.investmentModality)}</p>
                  {form.paymentMethods && (
                    <p style={{ margin: '0.75rem 0 0 0', fontSize: '9pt', color: '#333', borderTop: '1px dotted #ccc', paddingTop: '0.75rem', textAlign: 'justify', fontStyle: 'italic' }}>
                      <strong>Formas de Pago:</strong> {parseBoldText(form.paymentMethods)}
                    </p>
                  )}
                </div>

                {/* FIRMAS */}
                <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'space-between', padding: '0 2rem' }}>
                  <div style={{ textAlign: 'center', width: '250px' }}>
                    <div style={{ borderBottom: '1px solid #000', height: '40px', marginBottom: '0.5rem' }}></div>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>P&P Construye</p>
                    <p style={{ margin: 0, fontSize: '9pt', color: '#666' }}>Firma Autorizada</p>
                  </div>
                  <div style={{ textAlign: 'center', width: '250px' }}>
                    <div style={{ borderBottom: '1px solid #000', height: '40px', marginBottom: '0.5rem' }}></div>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>Cliente / Representante</p>
                    <p style={{ margin: 0, fontSize: '9pt', color: '#666' }}>Firma de Aprobación</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Estilos Globales para la Impresión */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-draft, #printable-draft * {
            visibility: visible;
          }
          #printable-draft {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 2cm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
          .hide-on-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
