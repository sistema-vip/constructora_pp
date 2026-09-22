'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  FileText, 
  BarChart3, 
  X, 
  CheckCircle2, 
  Loader2, 
  Share2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';

export interface PrintProjectSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  /** Lista opcional de proyectos pre-cargados por el padre */
  projects?: any[];
  /** Modo inicial al abrir la subventana */
  initialMode?: 'client-statement' | 'partner-report';
  /** ID de proyecto a preseleccionar si se abre desde una obra puntual */
  initialSelectedProjectId?: string;
  /** Callback para abrir ReportShareModal con la configuración generada */
  onShareModalTrigger: (config: {
    isOpen: boolean;
    title: string;
    subtitle?: string;
    fileName: string;
    pdfUrl: string;
    clientPhone?: string;
    clientEmail?: string;
  }) => void;
  /** Callback opcional si el padre desea manejar la impresión directa en navegador */
  onDirectPrint?: (mode: 'client-statement' | 'partner-report', selectedIds: Set<string>) => void;
}

export default function PrintProjectSelectionModal({
  isOpen,
  onClose,
  clientId,
  clientName = 'Cliente',
  clientPhone,
  clientEmail,
  projects: parentProjects,
  initialMode = 'client-statement',
  initialSelectedProjectId,
  onShareModalTrigger,
  onDirectPrint
}: PrintProjectSelectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [printMode, setPrintMode] = useState<'client-statement' | 'partner-report'>(initialMode);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [fetchedProjects, setFetchedProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sincronizar modo inicial cuando se abra
  useEffect(() => {
    if (isOpen) {
      setPrintMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Si no se pasaron proyectos pre-cargados, consultarlos desde Supabase
  useEffect(() => {
    if (!isOpen || !clientId) return;

    if (parentProjects && parentProjects.length > 0) {
      setFetchedProjects(parentProjects);
      initSelection(parentProjects);
    } else {
      loadProjectsFromDb();
    }
  }, [isOpen, clientId, parentProjects]);

  async function loadProjectsFromDb() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, project_payments(*), project_costs(*), project_extras(*)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = data || [];
      setFetchedProjects(list);
      initSelection(list);
    } catch (err) {
      console.error('Error cargando proyectos del cliente para imprimir:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filtrado estricto: SÓLO proyectos aprobados (en ejecución o concluidos, o con pagos/adicionales aprobados)
  const approvedProjects = useMemo(() => {
    return fetchedProjects.filter((p: any) => {
      // Excluir borradores / propuestas pendientes y cancelados
      if (p.status === 'proposal' && (!p.project_payments || p.project_payments.length === 0)) {
        return false;
      }
      if (p.status === 'cancelled') {
        return false;
      }
      return (
        p.status === 'in_progress' ||
        p.status === 'completed' ||
        (p.project_payments && p.project_payments.length > 0) ||
        (p.project_extras && p.project_extras.length > 0)
      );
    });
  }, [fetchedProjects]);

  // Lógica de preselección inteligente
  function initSelection(list: any[]) {
    const approved = list.filter((p: any) => {
      if (p.status === 'proposal' && (!p.project_payments || p.project_payments.length === 0)) return false;
      if (p.status === 'cancelled') return false;
      return (
        p.status === 'in_progress' ||
        p.status === 'completed' ||
        (p.project_payments && p.project_payments.length > 0) ||
        (p.project_extras && p.project_extras.length > 0)
      );
    });

    if (initialSelectedProjectId && approved.some((p: any) => p.id === initialSelectedProjectId)) {
      setSelectedProjectIds(new Set([initialSelectedProjectId]));
      return;
    }

    const inProgress = approved.filter((p: any) => p.status === 'in_progress');
    if (inProgress.length > 0) {
      setSelectedProjectIds(new Set(inProgress.map((p: any) => p.id)));
    } else if (approved.length > 0) {
      setSelectedProjectIds(new Set(approved.map((p: any) => p.id)));
    } else {
      setSelectedProjectIds(new Set());
    }
  }

  // Cálculos en vivo de vista previa
  const previewData = useMemo(() => {
    const selected = approvedProjects.filter((p: any) => selectedProjectIds.has(p.id));
    const extras = selected.flatMap((p: any) => p.project_extras || []);
    const baseBudget = selected.reduce((sum: number, p: any) => sum + Number(p.budget_usd || 0), 0);
    const extrasBudget = extras.reduce((sum: number, e: any) => sum + Number(e.amount_usd || 0), 0);
    const totalContracted = baseBudget + extrasBudget;

    const payments = selected.flatMap((p: any) => p.project_payments || []);
    const totalPaid = payments.reduce((sum: number, pm: any) => sum + Number(pm.amount_usd || 0), 0);
    const balance = totalContracted - totalPaid;

    const costs = selected.flatMap((p: any) => p.project_costs || []);
    const totalCosts = costs.reduce((sum: number, c: any) => sum + (Number(c.quantity || 1) * Number(c.unit_price_usd || 0)), 0);
    const profit = totalContracted - totalCosts;

    return {
      count: selected.length,
      totalContracted,
      totalPaid,
      balance,
      totalCosts,
      profit
    };
  }, [approvedProjects, selectedProjectIds]);

  if (!isOpen || !mounted) return null;

  const handleGeneratePdf = () => {
    if (selectedProjectIds.size === 0) return;
    const pIdsParam = Array.from(selectedProjectIds).join(',');
    const safeClientName = (clientName || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');

    if (printMode === 'client-statement') {
      onShareModalTrigger({
        isOpen: true,
        title: `Estado de Cuenta - ${clientName}`,
        subtitle: `${selectedProjectIds.size} presupuesto${selectedProjectIds.size !== 1 ? 's' : ''} aprobado${selectedProjectIds.size !== 1 ? 's' : ''} incluido${selectedProjectIds.size !== 1 ? 's' : ''}`,
        fileName: `Estado_de_Cuenta_${safeClientName}.pdf`,
        pdfUrl: `/api/clientes/${clientId}/estado-cuenta-pdf?projects=${pIdsParam}`,
        clientPhone,
        clientEmail
      });
    } else {
      onShareModalTrigger({
        isOpen: true,
        title: `Reporte de Socios - ${clientName}`,
        subtitle: `Uso interno de socios • ${selectedProjectIds.size} obra${selectedProjectIds.size !== 1 ? 's' : ''} aprobada${selectedProjectIds.size !== 1 ? 's' : ''}`,
        fileName: `Reporte_Socios_${safeClientName}.pdf`,
        pdfUrl: `/api/clientes/${clientId}/reporte-socios-pdf?projects=${pIdsParam}`,
        clientPhone,
        clientEmail
      });
    }

    onClose();
  };

  const handlePrintScreen = () => {
    if (selectedProjectIds.size === 0) return;
    if (onDirectPrint) {
      onDirectPrint(printMode, selectedProjectIds);
    } else {
      setTimeout(() => window.print(), 100);
    }
    onClose();
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <div 
        className="card modal-content animate-fade" 
        style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', fontWeight: 700 }}>
            <Printer size={20} color="var(--primary-color)" /> 
            {printMode === 'client-statement' ? 'Imprimir Estado de Cuenta' : 'Imprimir Reporte de Socios'}
          </h2>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
            title="Cerrar ventana"
          >
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
              padding: '0.65rem 0.8rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
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
              padding: '0.65rem 0.8rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              backgroundColor: printMode === 'partner-report' ? '#8b5cf6' : 'transparent',
              color: printMode === 'partner-report' ? 'white' : 'var(--text-muted)',
              transition: 'all 0.2s ease'
            }}
          >
            <BarChart3 size={15} /> Reporte de Socios (Interno)
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.2rem', marginTop: 0, lineHeight: 1.4 }}>
          {printMode === 'client-statement' 
            ? '📄 Documento oficial para el cliente: muestra presupuestos aprobados, trabajos adicionales y abonos recibidos (sin costos internos ni utilidades).' 
            : '🔒 Reporte confidencial interno de socios: incluye desglose de gastos, cuentas por pagar a proveedores, utilidades y balance de ganancia.'}
        </p>

        {/* Sección de Selección de Proyectos Aprobados */}
        <div style={{ marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Proyectos Aprobados ({approvedProjects.length})
            </span>
            
            {/* Botones de Selección Rápida */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)', fontWeight: 600 }}
                title="Seleccionar solo las obras actualmente en ejecución"
                onClick={() => {
                  const inProg = approvedProjects.filter((p: any) => p.status === 'in_progress').map((p: any) => p.id);
                  setSelectedProjectIds(new Set(inProg));
                }}
              >
                ⚡ Solo en Ejecución
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', fontWeight: 600 }}
                title="Seleccionar todas las obras aprobadas (en ejecución y concluidas)"
                onClick={() => {
                  setSelectedProjectIds(new Set(approvedProjects.map((p: any) => p.id)));
                }}
              >
                📁 Todos Aprobados
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                title="Desmarcar todos"
                onClick={() => setSelectedProjectIds(new Set())}
              >
                ⬜ Limpiar
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Loader2 size={18} className="animate-spin" /> Cargando proyectos del cliente...
            </div>
          ) : approvedProjects.length === 0 ? (
            <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
              <AlertCircle size={28} color="#f59e0b" style={{ margin: '0 auto 0.5rem auto' }} />
              <p style={{ margin: 0, color: 'white', fontWeight: 600, fontSize: '0.88rem' }}>No hay proyectos aprobados para este cliente</p>
              <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Solo se pueden emitir reportes financieros de obras aprobadas (en ejecución o concluidas).
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '290px', overflowY: 'auto', paddingRight: '0.2rem' }}>
              {approvedProjects.map((p: any) => {
                const isChecked = selectedProjectIds.has(p.id);
                const pExtras = p.project_extras?.reduce((s: number, e: any) => s + Number(e.amount_usd || 0), 0) || 0;
                const pTotal = Number(p.budget_usd || 0) + pExtras;
                const pPaid = p.project_payments?.reduce((s: number, pm: any) => s + Number(pm.amount_usd || 0), 0) || 0;
                const isPaid100 = pTotal > 0 && pPaid >= pTotal - 0.01;
                
                const statusLabel = p.status === 'in_progress' 
                  ? 'En Curso' 
                  : p.status === 'completed' 
                    ? (isPaid100 ? 'Concluido (100% Pagado)' : 'Concluido') 
                    : 'Aprobado';
                
                const statusClass = p.status === 'completed' 
                  ? (isPaid100 ? 'badge-success' : 'badge-info') 
                  : 'badge-warning';

                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.7rem 0.9rem',
                      borderRadius: '9px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: `1px solid ${isChecked ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.07)'}`,
                      background: isChecked ? 'rgba(56,189,248,0.07)' : 'rgba(255,255,255,0.02)',
                      opacity: !isChecked && p.status === 'completed' ? 0.75 : 1
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedProjectIds(prev => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          return next;
                        });
                      }}
                      style={{ width: '17px', height: '17px', accentColor: 'var(--accent-blue)', flexShrink: 0, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'white', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.proposal_number ? `#${p.proposal_number} – ` : ''}{p.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {new Date(p.created_at).toLocaleDateString('es-VE')} · {p.project_payments?.length || 0} abonos · {p.project_costs?.length || 0} gastos
                        {pPaid > 0 && ` · Pagado: $${formatCurrency(pPaid)}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: 'white', fontSize: '0.88rem' }}>${formatCurrency(pTotal)}</div>
                      <span className={`badge ${statusClass}`} style={{ fontSize: '0.67rem', marginTop: '0.2rem', display: 'inline-block' }}>{statusLabel}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Vista previa de totales en vivo */}
        {approvedProjects.length > 0 && (
          <div style={{ padding: '0.8rem 1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '1.2rem', fontSize: '0.83rem' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
              <span>Vista previa en vivo — {previewData.count} obra{previewData.count !== 1 ? 's' : ''} seleccionada{previewData.count !== 1 ? 's' : ''}</span>
              {previewData.count === 0 && <span style={{ color: '#ef4444' }}>Selecciona al menos 1 obra</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Contratado:</span>
              <span style={{ color: 'white', fontWeight: 600, textAlign: 'right' }}>${formatCurrency(previewData.totalContracted)}</span>
              
              <span style={{ color: 'var(--text-muted)' }}>Total Abonado:</span>
              <span style={{ color: 'var(--success)', fontWeight: 600, textAlign: 'right' }}>${formatCurrency(previewData.totalPaid)}</span>
              
              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Saldo por Cobrar:</span>
              <span style={{ color: previewData.balance > 0 ? '#f59e0b' : 'var(--success)', fontWeight: 700, textAlign: 'right' }}>
                ${formatCurrency(previewData.balance)}
              </span>

              {printMode === 'partner-report' && (
                <>
                  <span style={{ color: 'var(--text-muted)', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.3rem' }}>Gastos Ejecutados:</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 600, textAlign: 'right', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.3rem' }}>
                    ${formatCurrency(previewData.totalCosts)}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Margen Estimado:</span>
                  <span style={{ color: previewData.profit >= 0 ? '#10b981' : 'var(--danger)', fontWeight: 700, textAlign: 'right' }}>
                    ${formatCurrency(previewData.profit)}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Botones de Acción */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ flex: 1 }} 
            onClick={onClose}
          >
            Cancelar
          </button>

          {onDirectPrint && (
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', border: '1px solid rgba(255,255,255,0.2)' }}
              disabled={selectedProjectIds.size === 0}
              onClick={handlePrintScreen}
              title="Imprimir directamente desde el navegador"
            >
              <Printer size={16} /> Imprimir Pantalla
            </button>
          )}

          <button
            type="button"
            className="btn-primary"
            style={{
              flex: 2,
              justifyContent: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: selectedProjectIds.size === 0 ? 0.5 : 1,
              cursor: selectedProjectIds.size === 0 ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              border: 'none',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)',
              fontWeight: 700
            }}
            disabled={selectedProjectIds.size === 0}
            onClick={handleGeneratePdf}
          >
            <Share2 size={16} /> Generar / Compartir PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
