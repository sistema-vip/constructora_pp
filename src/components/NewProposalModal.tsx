'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Edit3, Send, Loader2, CheckCircle, Save, AlertCircle, FileText, User, DollarSign, Clock, ChevronRight } from 'lucide-react';
import { sendChatMessage, generateFinalProposal, modifyProposalText, ChatMessage, ProposalData } from '@/app/actions/ai-actions';
import { supabase } from '@/lib/supabase';
import { handleMoneyInput, parseCurrency, formatOnBlur } from '@/lib/formatters';

interface Client { id: string; name: string; company_name?: string; }
interface Props { isOpen: boolean; onClose: () => void; onSaved?: () => void; onOpenAI?: () => void; initialClientId?: string; }
type Mode = 'selector' | 'manual' | 'ai';
type Step = 'chat' | 'preview' | 'done';

const INITIAL_MSG: ChatMessage = { role: 'model', text: '¡Hola! Soy el asistente técnico de P&P CONSTRUYE. 👷\n\nCuéntame el proyecto: ¿qué vamos a construir, para quién y cuánto es el área o las medidas?' };
const INIT_FORM = { title: '', clientId: '', clientName: '', objective: '', phases: '', time: '', amount: '', payment: '60% anticipo / 40% al finalizar', notes: '' };

export default function NewProposalModal({ isOpen, onClose, onSaved, onOpenAI, initialClientId }: Props) {
  const [mode, setMode] = useState<Mode>('selector');
  const [step, setStep] = useState<Step>('chat');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MSG]);
  const [input, setInput] = useState('');
  const [readyHint, setReadyHint] = useState(false);
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [editableText, setEditableText] = useState('');
  const [aiRefinement, setAiRefinement] = useState('');
  const [refining, setRefining] = useState(false);
  const [linkedClientId, setLinkedClientId] = useState('');
  const [form, setForm] = useState(INIT_FORM);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) { fetchClients(); reset(); }
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function reset() {
    setMode('selector'); setStep('chat'); setError(''); setInput('');
    setReadyHint(false); setProposal(null); setEditableText(''); 
    setLinkedClientId(initialClientId || '');
    setMessages([INITIAL_MSG]); 
    
    // Si hay un ID inicial, buscar el nombre para el formulario manual
    const initialClient = clients.find(c => c.id === initialClientId);
    setForm({ ...INIT_FORM, clientId: initialClientId || '', clientName: initialClient?.name || '' });
  }

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name, company_name').order('name');
    setClients(data || []);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text: input.trim() }];
    setMessages(next); setInput(''); setLoading(true); setError('');
    try {
      const res = await sendChatMessage(next);
      if (res.success && res.reply) {
        setMessages(p => [...p, { role: 'model', text: res.reply! }]);
        if (res.readyToGenerate) setReadyHint(true);
      } else setError(res.error || 'Error al contactar al asistente');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleGenerateProposal() {
    setLoading(true); setError('');
    try {
      const res = await generateFinalProposal(messages);
      if (res.success && res.data) {
        setProposal(res.data); setEditableText(res.data.fullProposalText);
        const match = clients.find(c => c.name.toLowerCase().includes((res.data!.clientName || '').toLowerCase()));
        if (match) setLinkedClientId(match.id);
        setStep('preview');
      } else setError(res.error || 'Error al generar propuesta');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!proposal) return;
    setLoading(true); setError('');
    try {
      const amountStr = String(proposal.investmentAmount ?? '');
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

      // Número secuencial global: máximo entre TODOS los proyectos (cualquier status)
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
      setStep('done'); onSaved?.();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleSaveManual() {
    setLoading(true); setError('');
    try {
      const fullText = `Proyecto: ${form.title}\nPara: ${form.clientName}\n\nObjetivo del Proyecto\n${form.objective}\n\nFases del Trabajo\n${form.phases}\n\nTiempo de Ejecución\n${form.time}\n\nINVERSIÓN TOTAL: $${form.amount}\n\nCondiciones de Pago\n${form.payment}\nTasa de Cambio: Se aplicará la tasa Binance vigente para el día del pago.${form.notes ? `\n\nNotas:\n${form.notes}` : ''}`;
      // En lugar de guardar directo, vamos a pasar por el preview para permitir refinamiento con IA
      setProposal({
        title: form.title,
        clientName: form.clientName,
        clientContact: '',
        date: new Date().toLocaleDateString(),
        area: '',
        investmentAmount: form.amount,
        executionTime: form.time,
        fullProposalText: fullText
      });
      setEditableText(fullText);
      setStep('preview');
      setMode('ai'); // Cambiamos a modo AI para habilitar el preview con refinamiento
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

  if (!isOpen) return null;

  const chip = { display: 'flex', alignItems: 'center', gap: '.4rem', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '.35rem .85rem', fontSize: '.8rem', color: 'var(--text-muted)' } as React.CSSProperties;
  const cardStyle = { background: 'rgba(255,255,255,.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem 1.25rem' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0c0e12', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 2rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,.2),rgba(56,189,248,.2))', padding: '.55rem', borderRadius: '10px' }}>
            <FileText size={18} style={{ color: 'var(--primary-color)' }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Nueva Propuesta</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: '.78rem' }}>
              {mode === 'selector' ? 'Elige el modo de creación'
                : mode === 'ai' ? (step === 'chat' ? 'Chat con el asistente — calcula, ajusta y genera'
                  : step === 'preview' ? 'Revisa y edita antes de formalizar' : '')
                : 'Modo manual'}
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem', textAlign: 'center' }}>
            <div style={{ background: 'rgba(16,185,129,.1)', width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={36} style={{ color: 'var(--success)' }} />
            </div>
            <h3 style={{ color: 'white' }}>¡Propuesta Formalizada!</h3>
            <p className="text-muted">Guardada con estado <strong style={{ color: 'var(--primary-color)' }}>Propuesta Pendiente</strong>.<br />Puedes hacerle seguimiento desde Proyectos.</p>
            <button className="btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        )}

        {/* SELECTOR */}
        {step !== 'done' && mode === 'selector' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
            <div style={{ width: '100%', maxWidth: '960px' }}>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '2rem' }}>¿Cómo quieres crear la propuesta?</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {[
                  { m: 'ai' as Mode, icon: <Sparkles size={42} style={{ color: 'var(--primary-color)' }} />, title: '✨ Asistente con IA', desc: 'Conversa con la IA: calcula materiales, ajusta medidas y genera la propuesta cuando estés listo.', accent: 'rgba(245,158,11,0.3)', hover: 'rgba(245,158,11,0.7)', bg: 'rgba(245,158,11,0.05)', cta: 'Iniciar Chat con IA', ctaColor: 'var(--primary-color)' },
                  { m: 'manual' as Mode, icon: <Edit3 size={42} style={{ color: 'var(--accent-blue)' }} />, title: '📝 Modo Manual', desc: 'Completa cada sección con control total sobre el contenido. Ideal para proyectos ya definidos.', accent: 'rgba(56,189,248,0.3)', hover: 'rgba(56,189,248,0.7)', bg: 'rgba(56,189,248,0.05)', cta: 'Rellenar Formulario', ctaColor: 'var(--accent-blue)' },
                ].map(opt => (
                  <button key={opt.m}
                    onClick={() => {
                      if (opt.m === 'ai') { onClose(); onOpenAI?.(); }
                      else setMode(opt.m);
                    }}
                    style={{ background: opt.bg, border: `1px solid ${opt.accent}`, borderRadius: '20px', padding: '3rem 2.5rem', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.5rem', transition: 'all .2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = opt.hover; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 16px 48px ${opt.accent}`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = opt.accent; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div style={{ background: 'rgba(255,255,255,.07)', width: 76, height: 76, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {opt.icon}
                    </div>
                    <div>
                      <h2 style={{ color: 'white', marginBottom: '.6rem', fontSize: '1.4rem' }}>{opt.title}</h2>
                      <p className="text-muted" style={{ fontSize: '1rem', lineHeight: 1.65 }}>{opt.desc}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: opt.ctaColor, fontSize: '1rem', fontWeight: 700, marginTop: 'auto' }}>
                      {opt.cta} <ChevronRight size={18} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI CHAT */}
        {step !== 'done' && mode === 'ai' && step === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Messages scroll area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
              <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'model' && (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 'bold', fontSize: '.75rem', flexShrink: 0, marginRight: '.75rem', marginTop: '.2rem' }}>PP</div>
                    )}
                    <div style={{ maxWidth: '72%', padding: '.85rem 1.1rem', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: msg.role === 'user' ? 'linear-gradient(135deg,var(--primary-color),#d97706)' : 'rgba(255,255,255,.06)', border: msg.role === 'model' ? '1px solid var(--border-color)' : 'none', color: msg.role === 'user' ? '#000' : 'var(--text-primary)', fontSize: '.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 'bold', fontSize: '.75rem' }}>PP</div>
                    <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-color)', borderRadius: '18px 18px 18px 4px', padding: '.85rem 1.1rem', display: 'flex', gap: '.45rem', alignItems: 'center' }}>
                      {[0, 1, 2].map(d => <span key={d} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-color)', display: 'inline-block', animation: `bounce 1s infinite ${d * .2}s` }} />)}
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{ ...cardStyle, background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.3)', display: 'flex', gap: '.6rem' }}>
                    <AlertCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--danger)' }}>{error}</p>
                  </div>
                )}

                {readyHint && !loading && (
                  <div style={{ ...cardStyle, background: 'rgba(16,185,129,.06)', borderColor: 'rgba(16,185,129,.3)', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 .75rem', fontSize: '.88rem', color: 'var(--success)' }}>✅ El asistente tiene todo lo necesario para generar la propuesta formal.</p>
                    <button className="btn-primary" onClick={handleGenerateProposal} disabled={loading} style={{ margin: '0 auto' }}>
                      <FileText size={15} /> Generar Propuesta Formal
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Input bar */}
            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,.15)', flexShrink: 0 }}>
              <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', display: 'flex', gap: '.75rem', alignItems: 'flex-end' }}>
                <textarea
                  className="input-field"
                  style={{ flex: 1, minHeight: 48, maxHeight: 130, resize: 'vertical', fontSize: '.95rem', lineHeight: 1.55, padding: '.7rem 1rem' }}
                  placeholder="Escribe aquí... (Enter para enviar, Shift+Enter para nueva línea)"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={loading}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  <button onClick={handleSend} disabled={loading || !input.trim()} className="btn-primary" style={{ padding: '.7rem 1rem', minWidth: 'auto' }}>
                    {loading ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={17} />}
                  </button>
                  <button onClick={handleGenerateProposal} disabled={loading} title="Generar propuesta formal ahora" style={{ background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.4)', borderRadius: '8px', padding: '.65rem 1rem', cursor: 'pointer', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={17} />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-muted" style={{ textAlign: 'center', fontSize: '.73rem', padding: '.5rem', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
              💡 Cuando estés listo, presiona <FileText size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> para generar la propuesta formal
            </p>
          </div>
        )}

        {/* AI PREVIEW */}
        {step !== 'done' && mode === 'ai' && step === 'preview' && proposal && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

        {/* MANUAL */}
        {step !== 'done' && mode === 'manual' && step === 'chat' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Título del Proyecto</label>
                <input className="input-field" placeholder="Ej: Cierre Estructural de Tragaluz" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label>Cliente Registrado</label>
                <select className="input-field" value={form.clientId} onChange={e => { const c = clients.find(x => x.id === e.target.value); setForm({ ...form, clientId: e.target.value, clientName: c?.name || '' }); }}>
                  <option value="">Seleccionar...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label>Nombre en Propuesta</label>
                <input className="input-field" placeholder="Ej: Familia Martínez" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Objetivo del Proyecto</label>
                <textarea className="input-field" style={{ minHeight: 90, resize: 'vertical' }} placeholder="Descripción técnica del objetivo..." value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Fases del Trabajo</label>
                <textarea className="input-field" style={{ minHeight: 110, resize: 'vertical' }} placeholder="1. Anclaje estructural: ...\n2. Marco metálico: ..." value={form.phases} onChange={e => setForm({ ...form, phases: e.target.value })} />
              </div>
              <div>
                <label>Tiempo de Ejecución</label>
                <input className="input-field" placeholder="Ej: 2 a 3 días hábiles" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              </div>
              <div>
                <label>Monto Total (USD)</label>
                <input 
                  className="input-field" 
                  type="text" 
                  placeholder="Ej: 850,00" 
                  value={form.amount} 
                  onChange={e => setForm({ ...form, amount: handleMoneyInput(e.target.value) })} 
                  onBlur={e => setForm({ ...form, amount: formatOnBlur(e.target.value) })}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Condiciones de Pago</label>
                <input className="input-field" value={form.payment} onChange={e => setForm({ ...form, payment: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Notas Adicionales (opcional)</label>
                <textarea className="input-field" style={{ minHeight: 70, resize: 'vertical' }} placeholder="Condiciones especiales..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              {error && <div style={{ gridColumn: 'span 2', ...cardStyle, background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.3)' }}><p style={{ margin: 0, fontSize: '.85rem', color: 'var(--danger)' }}>{error}</p></div>}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      {step !== 'done' && (
        <div style={{ padding: '1rem 2rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem', justifyContent: 'flex-end', background: 'rgba(0,0,0,.2)', flexShrink: 0 }}>
          {mode !== 'selector' && (
            <button className="btn-secondary" onClick={() => { setMode('selector'); setStep('chat'); setError(''); }}>← Volver</button>
          )}
          {mode === 'ai' && step === 'preview' && (
            <>
              <button className="btn-secondary" onClick={() => setStep('chat')}>← Seguir editando</button>
              <button className="btn-primary" onClick={handleSave} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 195, justifyContent: 'center' }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : <><Save size={15} /> Formalizar Propuesta</>}
              </button>
            </>
          )}
          {mode === 'manual' && step === 'chat' && (
            <button className="btn-primary" onClick={handleSaveManual} disabled={loading || !form.title.trim()} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 195, justifyContent: 'center' }}>
              {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : <><Save size={15} /> Formalizar Propuesta</>}
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}
