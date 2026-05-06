'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { HardHat, X, Minus, Send, Loader2, FileText, Maximize2, RefreshCw } from 'lucide-react';
import { sendChatMessage, generateFinalProposal, ChatMessage, ProposalData } from '@/app/actions/ai-actions';
import { supabase } from '@/lib/supabase';

type AssistantMode = 'support' | 'proposal';
type ProposalStep = 'chat' | 'preview';

interface Client { id: string; name: string; company_name?: string; }

const SUPPORT_GREETING: ChatMessage = {
  role: 'model',
  text: '¡Hola! Soy el Asistente de P&P CONSTRUYE. 👷\n\nPuedo ayudarte con:\n- Calcular materiales y costos\n- Actualizar precios en tu inventario\n- Responder dudas técnicas de construcción\n- Generar propuestas\n\n¿En qué te ayudo?'
};

const PROPOSAL_GREETING: ChatMessage = {
  role: 'model',
  text: '¡Perfecto! Entrando en modo cotización. 📋\n\nCuéntame el proyecto: ¿qué vamos a construir, para quién y cuánto es el área o las medidas?'
};

export default function FloatingAssistant({ onProposalSaved }: { onProposalSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [mode, setMode] = useState<AssistantMode>('support');
  const [proposalStep, setProposalStep] = useState<ProposalStep>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([SUPPORT_GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [readyHint, setReadyHint] = useState(false);
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [editableText, setEditableText] = useState('');
  const [linkedClientId, setLinkedClientId] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [saved, setSaved] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) fetchClients(); }, [open]);

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name, company_name').order('name');
    setClients(data || []);
  }

  // Exposed globally so the "Nueva Propuesta" button can trigger it
  useEffect(() => {
    (window as any).__openProposalAssistant = () => {
      setMode('proposal');
      setMessages([PROPOSAL_GREETING]);
      setProposalStep('chat');
      setReadyHint(false);
      setProposal(null);
      setEditableText('');
      setSaved(false);
      setOpen(true);
      setMinimized(false);
    };
    return () => { delete (window as any).__openProposalAssistant; };
  }, []);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text: input.trim() }];
    setMessages(next); setInput(''); setLoading(true); setError('');
    try {
      const res = await sendChatMessage(next);
      if (res.success && res.reply) {
        setMessages(p => [...p, { role: 'model', text: res.reply! }]);
        if (res.readyToGenerate) setReadyHint(true);
      } else setError(res.error || 'Error al contactar el asistente.');
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
        setProposalStep('preview');
      } else setError(res.error || 'Error al generar propuesta.');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleSaveProposal() {
    if (!proposal) return;
    setLoading(true); setError('');
    try {
      const amountStr = String(proposal.investmentAmount ?? '');
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
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
      setSaved(true); onProposalSaved?.();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function resetChat() {
    setMessages([mode === 'proposal' ? PROPOSAL_GREETING : SUPPORT_GREETING]);
    setInput(''); setError(''); setReadyHint(false);
    setProposal(null); setEditableText(''); setProposalStep('chat'); setSaved(false);
  }

  const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '.85rem 1rem' };

  // Minimized bubble
  if (!open || minimized) return (
    <button className="hide-on-print" onClick={() => { setOpen(true); setMinimized(false); }}
      style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 999, width: 58, height: 58, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(245,158,11,.4)', transition: 'transform .2s' }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', border: '2px solid transparent' }}>
        <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      {messages.length > 1 && (
        <span style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--success)', border: '2px solid #0c0e12' }} />
      )}
    </button>
  );

  return (
    <div className="hide-on-print" style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 999, width: 440, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: '#161a22', border: '1px solid rgba(255,255,255,.1)', borderRadius: '20px', boxShadow: '0 24px 64px rgba(0,0,0,.6)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg,rgba(245,158,11,.15),rgba(56,189,248,.08))', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--primary-color)' }}>
            <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '.92rem', color: 'white' }}>Pepe</p>
            <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--primary-color)' }}>
              {mode === 'proposal' ? '📋 Modo Cotización' : '🏗️ Soporte General'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {mode === 'proposal' && proposalStep === 'chat' && messages.length > 1 && (
            <button onClick={handleGenerateProposal} disabled={loading} title="Generar propuesta ahora"
              style={{ background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '8px', padding: '.4rem .7rem', cursor: 'pointer', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem', fontWeight: 600 }}>
              <FileText size={13} /> Generar
            </button>
          )}
          <button onClick={resetChat} title="Nueva conversación" style={{ background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: '8px', padding: '.4rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><RefreshCw size={14} /></button>
          <button onClick={() => setMinimized(true)} style={{ background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: '8px', padding: '.4rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><Minus size={14} /></button>
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(239,68,68,.1)', border: 'none', borderRadius: '8px', padding: '.4rem', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
        </div>
      </div>

      {/* SAVED STATE */}
      {saved && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16,185,129,.12)', width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={28} style={{ color: 'var(--success)' }} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, color: 'white' }}>¡Propuesta Formalizada!</p>
          <p className="text-muted" style={{ margin: 0, fontSize: '.85rem' }}>Guardada como <strong style={{ color: 'var(--primary-color)' }}>Propuesta Pendiente</strong> en tu dashboard.</p>
          <button className="btn-primary" style={{ fontSize: '.85rem' }} onClick={resetChat}>Nueva Propuesta</button>
        </div>
      )}

      {/* CHAT VIEW */}
      {!saved && proposalStep === 'chat' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.85rem', minHeight: 0 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'model' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, marginRight: '.5rem', marginTop: '.15rem', border: '1px solid var(--primary-color)' }}>
                    <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ maxWidth: '78%', padding: '.65rem .9rem', borderRadius: msg.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px', background: msg.role === 'user' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,.05)', border: msg.role === 'model' ? '1px solid rgba(255,255,255,.08)' : 'none', color: msg.role === 'user' ? '#000' : 'var(--text-primary)', fontSize: '.84rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--primary-color)' }}>
                  <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '14px 14px 14px 3px', padding: '.65rem .9rem', display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                  {[0,1,2].map(d => <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-color)', display: 'inline-block', animation: `bounce 1s infinite ${d*.2}s` }} />)}
                </div>
              </div>
            )}
            {error && <div style={{ ...cardStyle, background: 'rgba(239,68,68,.07)', borderColor: 'rgba(239,68,68,.25)' }}><p style={{ margin: 0, fontSize: '.8rem', color: 'var(--danger)' }}>{error}</p></div>}
            {readyHint && !loading && (
              <div style={{ ...cardStyle, background: 'rgba(16,185,129,.06)', borderColor: 'rgba(16,185,129,.25)', textAlign: 'center' }}>
                <p style={{ margin: '0 0 .6rem', fontSize: '.82rem', color: 'var(--success)' }}>✅ Información lista para formalizar la propuesta.</p>
                <button className="btn-primary" style={{ fontSize: '.82rem', margin: '0 auto' }} onClick={handleGenerateProposal} disabled={loading}><FileText size={13} /> Generar Propuesta</button>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: '.85rem', borderTop: '1px solid rgba(255,255,255,.07)', flexShrink: 0, display: 'flex', gap: '.6rem', alignItems: 'flex-end' }}>
            <textarea className="input-field" style={{ flex: 1, minHeight: 40, maxHeight: 100, resize: 'none', fontSize: '.87rem', lineHeight: 1.5, padding: '.55rem .85rem' }}
              placeholder="Escríbeme... (Enter para enviar)"
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={loading} />
            <button className="btn-primary" style={{ padding: '.55rem .8rem', minWidth: 'auto' }} onClick={handleSend} disabled={loading || !input.trim()}>
              {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
            </button>
          </div>
        </>
      )}

      {/* PROPOSAL PREVIEW */}
      {!saved && proposalStep === 'preview' && proposal && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '.88rem', color: 'var(--primary-color)' }}>Vista Previa — Editable</p>
          <textarea className="input-field" style={{ minHeight: 260, resize: 'vertical', fontSize: '.8rem', lineHeight: 1.8, fontFamily: 'monospace' }} value={editableText} onChange={e => setEditableText(e.target.value)} />
          <div>
            <label style={{ display: 'block', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.35rem' }}>Vincular cliente (opcional)</label>
            <select className="input-field" style={{ fontSize: '.85rem' }} value={linkedClientId} onChange={e => setLinkedClientId(e.target.value)}>
              <option value="">Sin vincular</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {error && <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--danger)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '.6rem' }}>
            <button className="btn-secondary" style={{ flex: 1, fontSize: '.83rem' }} onClick={() => setProposalStep('chat')}>← Editar</button>
            <button className="btn-primary" style={{ flex: 2, fontSize: '.83rem' }} onClick={handleSaveProposal} disabled={loading}>
              {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : 'Formalizar Propuesta'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
