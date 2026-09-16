'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HardHat, X, Minus, Send, Loader2, FileText, RefreshCw, ChevronDown, Sparkles, MessageSquare, ArrowLeft } from 'lucide-react';
import { sendChatMessage, generateFinalProposal, ChatMessage, ProposalData } from '@/app/actions/ai-actions';
import { supabase } from '@/lib/supabase';
import { parseCurrency } from '@/lib/formatters';
import { useIsMobile } from '@/hooks/useIsMobile';

type AssistantMode = 'support' | 'proposal';
type ProposalStep = 'chat' | 'preview';

interface Client { id: string; name: string; company_name?: string; }

const SUPPORT_GREETING: ChatMessage = {
  role: 'model',
  text: '¡Hola! Soy Pepe, tu copiloto técnico de P&P CONSTRUYE. 👷\n\nPuedo ayudarte con:\n• Calcular rendimientos de materiales y costos\n• Consultar o actualizar precios de inventario\n• Responder dudas técnicas de obra\n• Redactar y estructurar propuestas de trabajo\n\n¿En qué obra o cálculo te ayudo hoy?'
};

const PROPOSAL_GREETING: ChatMessage = {
  role: 'model',
  text: '¡Perfecto! Entrando en modo cotización. 📋\n\nCuéntame de la obra: ¿qué vamos a construir o remodelar, para qué cliente y cuáles son las medidas o alcances aproximados?'
};

const QUICK_SUGGESTIONS_SUPPORT = [
  '📐 ¿Cuánto material para 50m² de piso?',
  '🧱 ¿Cuántos bloques rinde el cemento?',
  '💰 Precios estimados de albañilería',
  '📊 ¿Cómo consultar saldos de una obra?'
];

const QUICK_SUGGESTIONS_PROPOSAL = [
  '🏠 Remodelación integral de townhouse',
  '🧱 Construcción de muro perimetral de 20m',
  '⚡ Acometida eléctrica e iluminación',
  '🚿 Remodelación y tuberías de baño principal'
];

function renderFormattedMessage(text: string, isUser: boolean) {
  if (!text) return '';
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong 
          key={index} 
          style={{ 
            fontWeight: 700, 
            color: isUser ? '#000' : '#fbbf24' 
          }}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default function FloatingAssistant({ onProposalSaved }: { onProposalSaved?: () => void }) {
  const isMobile = useIsMobile();
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, loading]);

  useEffect(() => { 
    if (open) fetchClients(); 
  }, [open]);

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name, company_name').order('name');
    setClients(data || []);
  }

  // Exposed globally so any component can open Pepe
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

    (window as any).__openPepeChat = () => {
      setOpen(true);
      setMinimized(false);
    };

    return () => { 
      delete (window as any).__openProposalAssistant; 
      delete (window as any).__openPepeChat;
    };
  }, []);

  async function handleSend(customText?: string) {
    const textToSend = customText || input.trim();
    if (!textToSend || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text: textToSend }];
    setMessages(next); 
    setInput(''); 
    setLoading(true); 
    setError('');
    
    try {
      const res = await sendChatMessage(next);
      if (res.success && res.reply) {
        setMessages(p => [...p, { role: 'model', text: res.reply! }]);
        if (res.readyToGenerate) setReadyHint(true);
        if (res.actionTaken && res.actionTaken !== 'chat' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pepe-data-mutated', {
            detail: { action: res.actionTaken, recordId: res.recordId }
          }));
        }
      } else {
        setError(res.error || 'Error al contactar al asistente.');
      }
    } catch (e: any) { 
      setError(e.message || 'Error de conexión'); 
    } finally { 
      setLoading(false); 
    }
  }

  async function handleGenerateProposal() {
    setLoading(true); 
    setError('');
    try {
      const res = await generateFinalProposal(messages);
      if (res.success && res.data) {
        setProposal(res.data); 
        setEditableText(res.data.fullProposalText);
        const match = clients.find(c => c.name.toLowerCase().includes((res.data!.clientName || '').toLowerCase()));
        if (match) setLinkedClientId(match.id);
        setProposalStep('preview');
      } else {
        setError(res.error || 'Error al generar propuesta.');
      }
    } catch (e: any) { 
      setError(e.message); 
    } finally { 
      setLoading(false); 
    }
  }

  async function handleSaveProposal() {
    if (!proposal) return;
    setLoading(true); 
    setError('');
    try {
      const amountStr = String(proposal.investmentAmount ?? '');
      const amount = parseCurrency(amountStr);
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
      const { error: err } = await supabase.from('projects').insert([{ 
        client_id: linkedClientId || null, 
        title: proposal.title, 
        description: editableText, 
        status: 'proposal', 
        budget_usd: amount, 
        proposal_number: proposalNumber 
      }]);
      if (err) throw new Error(err.message);
      setSaved(true); 
      onProposalSaved?.();
    } catch (e: any) { 
      setError(e.message); 
    } finally { 
      setLoading(false); 
    }
  }

  function resetChat() {
    setMessages([mode === 'proposal' ? PROPOSAL_GREETING : SUPPORT_GREETING]);
    setInput(''); 
    setError(''); 
    setReadyHint(false);
    setProposal(null); 
    setEditableText(''); 
    setProposalStep('chat'); 
    setSaved(false);
  }

  function switchMode(newMode: AssistantMode) {
    setMode(newMode);
    setMessages([newMode === 'proposal' ? PROPOSAL_GREETING : SUPPORT_GREETING]);
    setReadyHint(false);
    setProposal(null);
    setProposalStep('chat');
  }

  const quickSuggestions = mode === 'proposal' ? QUICK_SUGGESTIONS_PROPOSAL : QUICK_SUGGESTIONS_SUPPORT;

  // ── 1. MINIMIZED / CLOSED FLOATING BUBBLE ──
  if (!open || minimized) {
    return (
      <button 
        className="hide-on-print" 
        onClick={() => { setOpen(true); setMinimized(false); }}
        aria-label="Abrir Pepe Asistente IA"
        style={isMobile ? {
          position: 'fixed',
          bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
          left: '1.25rem',
          zIndex: 1400,
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          border: '2px solid rgba(255, 255, 255, 0.25)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(245, 158, 11, 0.5)',
          padding: 0
        } : {
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          zIndex: 999,
          width: '58px',
          height: '58px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(245,158,11,.4)',
          transition: 'transform .2s'
        }}
        onMouseEnter={e => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <div style={{ width: isMobile ? '46px' : '52px', height: isMobile ? '46px' : '52px', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.4)' }}>
          <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        {/* Pulse online green indicator */}
        <span style={{ 
          position: 'absolute', 
          top: 2, 
          right: 2, 
          width: 13, 
          height: 13, 
          borderRadius: '50%', 
          background: '#10b981', 
          border: '2px solid #0c0e12' 
        }} />
      </button>
    );
  }

  // ── 2. OPEN CHAT MODAL (ADAPTIVE MOBILE / DESKTOP) ──
  const modalContainerStyle: React.CSSProperties = isMobile ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100dvh',
    maxHeight: '100dvh',
    zIndex: 2500,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0c0e12',
    overflow: 'hidden'
  } : {
    position: 'fixed',
    bottom: '2rem',
    right: '2rem',
    zIndex: 999,
    width: '440px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#161a22',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: '20px',
    boxShadow: '0 24px 64px rgba(0,0,0,.6)',
    overflow: 'hidden'
  };

  return (
    <div className="hide-on-print" style={modalContainerStyle}>

      {/* ── HEADER ── */}
      <div style={{
        paddingTop: isMobile ? 'max(14px, env(safe-area-inset-top, 14px))' : '1rem',
        paddingBottom: '0.85rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(56,189,248,0.08))',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          {isMobile && (
            <button 
              onClick={() => setOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                color: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
              title="Volver"
            >
              <ArrowLeft size={19} />
            </button>
          )}

          <div style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid #f59e0b', flexShrink: 0 }}>
            <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: '#10b981', border: '1.5px solid #000' }} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.96rem', color: '#f8fafc' }}>Pepe IA</p>
              <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '12px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', fontWeight: 600 }}>
                {mode === 'proposal' ? 'Cotizador' : 'Soporte'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Asistente de Obra • En línea
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {/* Mode Switch Toggle Button */}
          <button 
            onClick={() => switchMode(mode === 'support' ? 'proposal' : 'support')}
            title={mode === 'support' ? 'Cambiar a Modo Cotización' : 'Cambiar a Modo Soporte'}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '20px',
              padding: '0.35rem 0.65rem',
              color: '#f8fafc',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            {mode === 'support' ? '📋 Cotizar' : '🏗️ Soporte'}
          </button>

          {mode === 'proposal' && proposalStep === 'chat' && messages.length > 1 && (
            <button 
              onClick={handleGenerateProposal} 
              disabled={loading} 
              title="Generar propuesta formal"
              style={{
                background: 'rgba(16,185,129,0.2)',
                border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: '8px',
                padding: '0.35rem 0.6rem',
                cursor: 'pointer',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              <FileText size={13} /> Generar
            </button>
          )}

          <button 
            onClick={resetChat} 
            title="Reiniciar conversación" 
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={15} />
          </button>

          {!isMobile && (
            <button 
              onClick={() => setMinimized(true)} 
              title="Minimizar"
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
            >
              <Minus size={15} />
            </button>
          )}

          <button 
            onClick={() => setOpen(false)} 
            title="Cerrar"
            style={{ background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', color: '#f87171', display: 'flex', alignItems: 'center' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── SAVED STATE ── */}
      {saved && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', gap: '1.25rem' }}>
          <div style={{ background: 'rgba(16,185,129,0.15)', width: 68, height: 68, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16,185,129,0.3)' }}>
            <FileText size={32} style={{ color: '#10b981' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, color: '#f8fafc', fontSize: '1.15rem' }}>¡Propuesta Formalizada!</h3>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.86rem', color: '#94a3b8', maxWidth: '320px' }}>
              Guardada con éxito como <strong style={{ color: '#f59e0b' }}>Propuesta Pendiente</strong>. Puedes gestionarla desde la sección Obras.
            </p>
          </div>
          <button 
            className="btn-primary" 
            style={{ fontSize: '0.9rem', padding: '0.75rem 1.5rem', borderRadius: '25px' }} 
            onClick={resetChat}
          >
            Iniciar Nueva Consulta
          </button>
        </div>
      )}

      {/* ── CHAT VIEW ── */}
      {!saved && proposalStep === 'chat' && (
        <>
          {/* Scrollable Message History */}
          <div 
            style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: isMobile ? '1rem 0.85rem' : '1.1rem', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.9rem', 
              minHeight: 0,
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {messages.map((msg, i) => (
              <div 
                key={i} 
                style={{ 
                  display: 'flex', 
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  width: '100%'
                }}
              >
                {msg.role === 'model' && (
                  <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, marginRight: '0.6rem', marginTop: '0.15rem', border: '1.5px solid #f59e0b' }}>
                    <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div 
                  style={{ 
                    maxWidth: isMobile ? '86%' : '80%', 
                    padding: isMobile ? '0.75rem 1rem' : '0.65rem 0.9rem', 
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', 
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.06)', 
                    border: msg.role === 'model' ? '1px solid rgba(255,255,255,0.09)' : 'none', 
                    color: msg.role === 'user' ? '#000' : '#f1f5f9', 
                    fontSize: isMobile ? '0.91rem' : '0.85rem', 
                    fontWeight: msg.role === 'user' ? 500 : 400,
                    lineHeight: 1.6, 
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}
                >
                  {renderFormattedMessage(msg.text, msg.role === 'user')}
                </div>
              </div>
            ))}

            {/* Typing Loader Indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1.5px solid #f59e0b' }}>
                  <img src="/pepe_avatar.png" alt="Pepe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '18px 18px 18px 4px', padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginRight: '0.3rem' }}>Pepe está calculando</span>
                  {[0, 1, 2].map(d => (
                    <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', animation: `bounce 1s infinite ${d * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '0.75rem 1rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#f87171' }}>{error}</p>
              </div>
            )}

            {/* Proposal Ready Callout */}
            {readyHint && !loading && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '14px', padding: '1rem', textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>
                  ✅ Información lista para formalizar la propuesta.
                </p>
                <button 
                  className="btn-primary" 
                  style={{ fontSize: '0.85rem', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', borderRadius: '20px' }} 
                  onClick={handleGenerateProposal} 
                  disabled={loading}
                >
                  <FileText size={14} /> Generar Propuesta Formal
                </button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Quick Suggestions Pills (Shown if conversation is early) */}
          {messages.length <= 3 && !loading && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              overflowX: 'auto',
              padding: '0.4rem 0.85rem',
              background: 'rgba(0,0,0,0.2)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              scrollbarWidth: 'none',
              flexShrink: 0
            }}>
              {quickSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sug)}
                  style={{
                    whiteSpace: 'nowrap',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '16px',
                    padding: '0.35rem 0.75rem',
                    color: '#cbd5e1',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    flexShrink: 0
                  }}
                >
                  <Sparkles size={11} style={{ color: '#f59e0b' }} /> {sug}
                </button>
              ))}
            </div>
          )}

          {/* Bottom Chat Input Bar */}
          <div style={{ 
            paddingTop: '0.75rem',
            paddingLeft: '0.85rem',
            paddingRight: '0.85rem',
            paddingBottom: isMobile ? 'max(10px, env(safe-area-inset-bottom, 10px))' : '0.85rem',
            borderTop: '1px solid rgba(255,255,255,0.08)', 
            background: isMobile ? '#12161f' : 'rgba(0,0,0,0.25)', 
            flexShrink: 0, 
            display: 'flex', 
            gap: '0.65rem', 
            alignItems: 'flex-end' 
          }}>
            <textarea 
              ref={textareaRef}
              className="input-field" 
              style={{ 
                flex: 1, 
                minHeight: 44, 
                maxHeight: 110, 
                resize: 'none', 
                fontSize: isMobile ? '0.94rem' : '0.88rem', 
                lineHeight: 1.45, 
                padding: '0.65rem 1rem',
                borderRadius: '22px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#fff'
              }}
              placeholder="Pregúntale a Pepe..."
              value={input} 
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                  e.preventDefault(); 
                  handleSend(); 
                } 
              }}
              disabled={loading} 
            />
            <button 
              className="btn-primary" 
              style={{ 
                width: 44, 
                height: 44, 
                borderRadius: '50%', 
                minWidth: 'auto', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: 0,
                flexShrink: 0
              }} 
              onClick={() => handleSend()} 
              disabled={loading || !input.trim()}
            >
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} style={{ marginLeft: '-2px' }} />}
            </button>
          </div>
        </>
      )}

      {/* ── PROPOSAL PREVIEW STEP (EDITABLE & FULLY ADAPTED) ── */}
      {!saved && proposalStep === 'preview' && proposal && (
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: isMobile ? '1rem 0.85rem' : '1.25rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem', 
          minHeight: 0,
          WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#f59e0b' }}>
              Vista Previa de la Propuesta
            </p>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Editable</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.6rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>Monto Estimado</span>
              <strong style={{ fontSize: '0.95rem', color: '#10b981' }}>${proposal.investmentAmount || '0'}</strong>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.6rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>Tiempo Estimado</span>
              <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>{proposal.executionTime || 'Por definir'}</strong>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Texto Completo de la Cotización
            </label>
            <textarea 
              className="input-field" 
              style={{ 
                minHeight: isMobile ? 220 : 260, 
                resize: 'vertical', 
                fontSize: '0.82rem', 
                lineHeight: 1.75, 
                fontFamily: 'monospace',
                padding: '0.85rem' 
              }} 
              value={editableText} 
              onChange={e => setEditableText(e.target.value)} 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
              Vincular con Cliente (opcional)
            </label>
            <select 
              className="input-field" 
              style={{ fontSize: '0.88rem', height: '44px' }} 
              value={linkedClientId} 
              onChange={e => setLinkedClientId(e.target.value)}
            >
              <option value="">Sin vincular...</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` (${c.company_name})` : ''}</option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.65rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#f87171' }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button 
              className="btn-secondary" 
              style={{ flex: 1, fontSize: '0.86rem', height: '44px', borderRadius: '12px' }} 
              onClick={() => setProposalStep('chat')}
            >
              ← Volver al Chat
            </button>
            <button 
              className="btn-primary" 
              style={{ flex: 2, fontSize: '0.86rem', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }} 
              onClick={handleSaveProposal} 
              disabled={loading}
            >
              {loading ? (
                <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</>
              ) : (
                'Formalizar Propuesta'
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
