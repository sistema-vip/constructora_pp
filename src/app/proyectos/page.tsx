'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  Printer,
  Edit3,
  DollarSign,
  Trash2,
  Ban,
  Check,
  Save,
  X,
  Sparkles,
  Lock,
  Archive,
  HardHat,
  RotateCcw,
  GitMerge
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleMoneyInput, parseCurrency, formatCurrency, formatOnBlur } from '@/lib/formatters';
import { modifyProposalText } from '@/app/actions/ai-actions';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAdminAction } from '@/lib/useAdminAction';
import NewProposalModal from '@/components/NewProposalModal';

interface Project {
  id: string;
  title: string;
  description: string;
  status: string;
  budget_usd: number;
  created_at: string;
  proposal_number?: number;
  clients?: { name: string };
  archived_at: string | null;
}

export default function ProyectosPage() {
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

  const renderStructuredProposal = (text: string | null | undefined) => {
    if (!text) return null;

    const lines = text.split('\n');
    const renderedElements: React.ReactNode[] = [];

    const headers = [
      'objetivo del proyecto',
      'fases del trabajo (alcance técnico)',
      'fases del trabajo',
      'fases de trabajo',
      'alcance técnico',
      'tiempo de ejecución y entrega',
      'presupuesto de inversión (a todo costo)',
      'presupuesto de inversión (solo mano de obra)',
      'presupuesto de inversión (mano de obra)',
      'presupuesto de inversión (materiales)',
      'presupuesto de inversión (solo materiales)',
      'presupuesto de inversión',
      'condiciones y métodos de pago',
      'resumen financiero y ejecución'
    ];

    const labels = [
      'proyecto',
      'fecha',
      'para',
      'área de ejecución',
      'área',
      'inversión total',
      'inversión total (usd)',
      'esquema de pago',
      'moneda de pago',
      'formas de pago',
      'métodos de pago',
      'tiempo estimado'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        // Empty line, add a spacing div (compacted)
        renderedElements.push(<div key={`empty-${i}`} style={{ height: '0.2rem' }} />);
        continue;
      }

      const lowerLine = line.toLowerCase();

      // Check if it's a section header
      if (headers.includes(lowerLine)) {
        renderedElements.push(
          <h3 key={`header-${i}`} style={{ 
            margin: '0.75rem 0 0.3rem 0', 
            fontSize: '11.5pt', 
            color: '#000', 
            borderBottom: '1px solid #ccc', 
            paddingBottom: '0.15rem', 
            fontWeight: 'bold',
            textTransform: 'none'
          }}>
            {line}
          </h3>
        );
        continue;
      }

      // Check if it starts with a label and a colon
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const possibleLabel = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        const lowerLabel = possibleLabel.toLowerCase();

        if (labels.includes(lowerLabel) || lowerLabel.includes('inversión total') || lowerLabel.includes('proyecto') || lowerLabel.includes('para') || lowerLabel.includes('fecha')) {
          // Render as styled key-value
          renderedElements.push(
            <div key={`kv-${i}`} style={{ marginBottom: '0.2rem', fontSize: '11pt', color: '#333' }}>
              <strong style={{ color: '#000', fontWeight: 'bold' }}>{possibleLabel}:</strong> {parseBoldText(value)}
            </div>
          );
          continue;
        }
      }

      // Check if it's a numbered or bullet list item
      const isListItem = /^[-\*•\d]+[\s\.-]/.test(line);
      if (isListItem) {
        // Extract number/bullet and content
        const match = line.match(/^([-\*•\d]+[\s\.-]*)(.*)/);
        const bullet = match ? match[1] : '';
        const content = match ? match[2] : line;

        renderedElements.push(
          <div key={`li-${i}`} style={{ 
            paddingLeft: '1.5rem', 
            textIndent: '-1.5rem', 
            margin: '0.2rem 0', 
            textAlign: 'justify', 
            lineHeight: '1.45', 
            fontSize: '11pt',
            color: '#333'
          }}>
            <strong style={{ color: '#000' }}>{bullet}</strong> {parseBoldText(content)}
          </div>
        );
        continue;
      }

      // Regular paragraph
      renderedElements.push(
        <p key={`p-${i}`} style={{ 
          margin: '0.2rem 0', 
          textAlign: 'justify', 
          lineHeight: '1.45', 
          fontSize: '11pt',
          color: '#333',
          whiteSpace: 'pre-wrap'
        }}>
          {parseBoldText(line)}
        </p>
      );
    }

    return <div style={{ display: 'flex', flexDirection: 'column' }}>{renderedElements}</div>;
  };

  const router = useRouter();
  const { isAdmin, isSales, isObserver, isClient } = useAdminAction();
  const isCreatorRole = isAdmin || isSales || isClient;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'proposals' | 'execution' | 'archived'>('proposals');

  const [aiInstruction, setAiInstruction] = useState('');
  const [isModifyingAi, setIsModifyingAi] = useState(false);

  // Merge states
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [targetMergeId, setTargetMergeId] = useState<string>('');
  const [merging, setMerging] = useState(false);

  // Reopen states
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<Project | null>(null);
  const [reopenPassword, setReopenPassword] = useState('');
  const [reopenError, setReopenError] = useState('');

  // Auth Modal state for non-admins
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function executeWithAuth(action: () => void) {
    if (isAdmin) {
      action();
    } else {
      setPendingAction(() => action);
      setAuthPassword('');
      setAuthError('');
      setShowAuthModal(true);
    }
  }

  function handleAuthSubmit() {
    if (authPassword !== '080911') {
      setAuthError('Contraseña incorrecta. Se requiere acceso de administrador.');
      return;
    }
    setShowAuthModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }

  useEffect(() => {
    fetchProjects();

    const urlParams = new URLSearchParams(window.location.search);
    const clientSearch = urlParams.get('client');
    if (clientSearch) setSearchTerm(clientSearch);
    if (urlParams.get('view') === 'archived') setView('archived');
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setProjects(data);

        const urlParams = new URLSearchParams(window.location.search);
        const printId = urlParams.get('print');
        if (printId) {
          const proj = data.find(p => p.id === printId);
          if (proj) {
            setSelectedProject(proj);
            setTimeout(() => window.print(), 500);
            window.history.replaceState({}, '', '/proyectos');
          }
        }
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  }



  async function handleStatusUpdate(id: string, newStatus: string) {
    executeWithAuth(async () => {
      const statusText = newStatus === 'in_progress' ? 'aprobar' : 'rechazar';
    if (!confirm(`¿Estás seguro de que deseas ${statusText} esta propuesta?`)) return;

    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      setProjects(projects.map(p => p.id === id ? { ...p, status: newStatus } : p));
      if (selectedProject?.id === id) {
        setSelectedProject({ ...selectedProject, status: newStatus });
      }
    }
    });
  }

  async function handleDelete(id: string) {
    executeWithAuth(async () => {
      if (!confirm('¿ESTÁS SEGURO? Esta acción eliminará la propuesta de forma PERMANENTE y no se puede deshacer.')) return;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      alert(`Error al eliminar: ${error.message}`);
    } else {
      setProjects(projects.filter(p => p.id !== id));
      if (selectedProject?.id === id) {
        setSelectedProject(null);
      }
    }
    });
  }

  const handlePrint = () => {
    window.print();
  };

  function toggleMergeSelect(id: string) {
    setSelectedForMerge(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleMerge() {
    executeWithAuth(async () => {
      if (!targetMergeId || selectedForMerge.length < 2) return;
    setMerging(true);
    try {
      const sourcesIds = selectedForMerge.filter(id => id !== targetMergeId);
      const totalBudget = selectedForMerge.reduce(
        (sum, id) => sum + (projects.find(p => p.id === id)?.budget_usd ?? 0), 0
      );

      for (const sourceId of sourcesIds) {
        await supabase.from('project_payments').update({ project_id: targetMergeId }).eq('project_id', sourceId);
        await supabase.from('project_costs').update({ project_id: targetMergeId }).eq('project_id', sourceId);
        await supabase.from('project_extras').update({ project_id: targetMergeId }).eq('project_id', sourceId);
        await supabase.from('project_commitments').update({ project_id: targetMergeId }).eq('project_id', sourceId);
        await supabase.from('partner_advances').update({ project_id: targetMergeId }).eq('project_id', sourceId);
      }

      await supabase.from('projects').update({ budget_usd: totalBudget }).eq('id', targetMergeId);
      await supabase.from('projects')
        .update({ status: 'cancelled', archived_at: new Date().toISOString() })
        .in('id', sourcesIds);

      setShowMergeModal(false);
      setSelectedForMerge([]);
      setTargetMergeId('');
      fetchProjects();
    } catch (err: any) {
      alert('Error al unificar: ' + err.message);
      } finally {
        setMerging(false);
      }
    });
  }

  async function handleReopen() {
    if (reopenPassword !== '080911') {
      setReopenError('Contraseña incorrecta. Solo administradores autorizados.');
      return;
    }
    try {
      const isRevert = reopenTarget!.status === 'in_progress';
      const updateData = isRevert 
        ? { status: 'proposal' } 
        : { archived_at: null, status: 'in_progress' };

      const { error } = await supabase.from('projects')
        .update(updateData)
        .eq('id', reopenTarget!.id);
      if (error) throw error;
      setShowReopenModal(false);
      setReopenTarget(null);
      setReopenPassword('');
      setReopenError('');
      fetchProjects();
    } catch (err: any) {
      alert('Error al procesar la acción: ' + err.message);
    }
  }

  const proposals = projects.filter(p => !p.archived_at && p.status === 'proposal');
  const execution = projects.filter(p => !p.archived_at && p.status === 'in_progress');
  const archived = projects.filter(p => !!p.archived_at || p.status === 'completed' || p.status === 'cancelled');

  const filteredProjects = (
    view === 'proposals' ? proposals :
    view === 'execution' ? execution :
    archived
  ).filter(p =>
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="animate-fade">
        <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ position: 'relative', width: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Buscar por proyecto o cliente..." 
              className="input-field"
              style={{ paddingLeft: '3rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Tab switcher: Propuestas / Ejecución / Historial */}
        <div className="hide-on-print" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '0', background: 'var(--surface-color)', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
          <button
            onClick={() => setView('proposals')}
            style={{ padding: '0.9rem 1.5rem', background: 'none', border: 'none', borderBottom: view === 'proposals' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'proposals' ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
          >
            <FileText size={16} /> Propuestas Pendientes
            <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{proposals.length}</span>
          </button>
          <button
            onClick={() => setView('execution')}
            style={{ padding: '0.9rem 1.5rem', background: 'none', border: 'none', borderBottom: view === 'execution' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'execution' ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
          >
            <HardHat size={16} /> En Ejecución
            <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{execution.length}</span>
          </button>
          <button
            onClick={() => setView('archived')}
            style={{ padding: '0.9rem 1.5rem', background: 'none', border: 'none', borderBottom: view === 'archived' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'archived' ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
          >
            <Archive size={16} /> Historial
            {archived.length > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{archived.length}</span>
            )}
          </button>
        </div>

        {/* Barra de acción de unificación */}
        {!isObserver && selectedForMerge.length >= 2 && view !== 'archived' && (
          <div style={{ background: 'rgba(184,115,51,0.12)', border: '1px solid rgba(184,115,51,0.4)', borderRadius: '10px', padding: '0.75rem 1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <GitMerge size={18} style={{ color: '#b87333' }} />
            <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
              <strong style={{ color: 'white' }}>{selectedForMerge.length} propuestas</strong> seleccionadas para unificar
            </span>
            <button
              className="btn-primary"
              style={{ padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => {
                setTargetMergeId(selectedForMerge[0]);
                setShowMergeModal(true);
              }}
            >
              <GitMerge size={15} /> Unificar Propuestas
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '0.5rem 1rem' }}
              onClick={() => setSelectedForMerge([])}
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="card hide-on-print" style={{ padding: 0, overflow: 'hidden', borderRadius: '0 0 16px 16px', marginTop: 0, borderTop: 'none' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
              {view !== 'archived' && (
                <th style={{ textAlign: 'left', padding: '1.25rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', width: '40px' }}></th>
              )}
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>PROYECTO</th>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>CLIENTE</th>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>PRESUPUESTO</th>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>ESTADO</th>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center' }}>Cargando proyectos...</td></tr>
            ) : filteredProjects.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron proyectos o propuestas.</td></tr>
            ) : (
              filteredProjects.map((project) => (
                <tr key={project.id} className="table-row">
                  {view !== 'archived' && (
                    <td style={{ padding: '1.25rem 1rem', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedForMerge.includes(project.id)}
                        onChange={() => toggleMergeSelect(project.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#b87333' }}
                        title="Seleccionar para unificar"
                      />
                    </td>
                  )}
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontWeight: '600', color: 'white', marginBottom: '0.2rem' }}>
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
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-secondary)' }}>
                    {project.clients?.name || 'Cliente por definir'}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontWeight: '600', color: 'var(--success)' }}>
                      ${Number(project.budget_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <span className={`badge ${
                      project.status === 'proposal' ? 'badge-warning' : 
                      project.status === 'in_progress' ? 'badge-success' : 
                      project.status === 'cancelled' ? 'badge-danger' : ''
                    }`}>
                      {project.status === 'proposal' ? 'Propuesta Pendiente' : 
                       project.status === 'in_progress' ? 'En Ejecución' : 
                       project.status === 'cancelled' ? 'Cancelado' : 
                       project.status}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {view === 'archived' ? (
                        <>
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            title="Ver detalles"
                            onClick={() => { router.push(`/proyectos/${project.id}`); }}
                          >
                            <FileText size={14} /> Ver
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            title="Imprimir Propuesta"
                            onClick={() => {
                              setSelectedProject(project);
                              setTimeout(() => window.print(), 300);
                            }}
                          >
                            <Printer size={14} />
                          </button>
                          {!isObserver && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}
                              title="Reabrir proyecto (requiere clave admin)"
                              onClick={() => {
                                setReopenTarget(project);
                                setReopenPassword('');
                                setReopenError('');
                                setShowReopenModal(true);
                              }}
                            >
                              <RotateCcw size={14} /> Reabrir
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {project.status === 'in_progress' || project.status === 'completed' ? (
                            <>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                title="Ver detalles del proyecto"
                                onClick={() => router.push(`/proyectos/${project.id}`)}
                              >
                                <FileText size={14} /> Ver
                              </button>
                              <button
                                className="btn-primary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                title="Imprimir Propuesta"
                                onClick={() => {
                                  setSelectedProject(project);
                                  setTimeout(() => window.print(), 300);
                                }}
                              >
                                <Printer size={14} /> Imprimir
                              </button>
                              {!isObserver && project.status === 'in_progress' && (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ffcc00' }}
                                  title="Retornar a Propuesta (requiere clave admin)"
                                  onClick={() => {
                                    setReopenTarget(project);
                                    setReopenPassword('');
                                    setReopenError('');
                                    setShowReopenModal(true);
                                  }}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                title="Ver página de la propuesta"
                                onClick={() => router.push(`/proyectos/${project.id}`)}
                              >
                                <FileText size={14} /> Ver
                              </button>
                              {!isObserver && !(isSales && project.status !== 'proposal') && (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--primary-color)' }}
                                  title="Editar Presupuesto y Texto"
                                  onClick={() => {
                                    if (isSales && project.status === 'proposal') {
                                      setSelectedProject(project);
                                      setShowProposalModal(true);
                                    } else {
                                      executeWithAuth(() => {
                                        setSelectedProject(project);
                                        setShowProposalModal(true);
                                      });
                                    }
                                  }}
                                >
                                  <Edit3 size={14} /> Editar
                                </button>
                              )}
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem' }}
                                title="Ver detalles"
                                onClick={() => {
                                  setSelectedProject(project);
                                }}
                              >
                                <FileText size={14} />
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem' }}
                                title="Imprimir Propuesta"
                                onClick={() => {
                                  setSelectedProject(project);
                                  setTimeout(() => window.print(), 300);
                                }}
                              >
                                <Printer size={14} />
                              </button>
                            </div>
                          )}

                          {!isObserver && project.status === 'proposal' && (
                            <>
                              <button
                                className="btn-primary"
                                style={{ padding: '0.5rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                                title="Aprobar Propuesta"
                                onClick={() => handleStatusUpdate(project.id, 'in_progress')}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', color: '#ffcc00' }}
                                title="Rechazar Propuesta"
                                onClick={() => handleStatusUpdate(project.id, 'cancelled')}
                              >
                                <Ban size={14} />
                              </button>
                            </>
                          )}

                          {!isObserver && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.5rem', color: '#ff4444' }}
                              title="Eliminar Permanente"
                              onClick={() => handleDelete(project.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

      {/* Modal de Propuesta */}
      {selectedProject && (
        <div className="modal-overlay print-modal">
          <div className="card modal-content print-content animate-fade" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            
            {/* Cabecera del Modal (Oculta al imprimir) */}
            <div className="hide-on-print" style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'white' }}>{selectedProject.title}</h2>
                <span className={`badge ${
                  selectedProject.status === 'proposal' ? 'badge-warning' : 
                  selectedProject.status === 'in_progress' ? 'badge-success' : 
                  selectedProject.status === 'cancelled' ? 'badge-danger' : ''
                }`}>
                  {selectedProject.status === 'proposal' ? 'Propuesta Pendiente' : 
                   selectedProject.status === 'in_progress' ? 'En Ejecución' : 
                   selectedProject.status === 'cancelled' ? 'Cancelado' : 
                   selectedProject.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {selectedProject.status === 'proposal' && isCreatorRole && (
                      <>
                        <button className="btn-primary" style={{ background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => handleStatusUpdate(selectedProject.id, 'in_progress')}>
                          <Check size={16} /> Aprobar
                        </button>
                        <button className="btn-secondary" style={{ color: '#ffcc00' }} onClick={() => handleStatusUpdate(selectedProject.id, 'cancelled')}>
                          <Ban size={16} /> Rechazar
                        </button>
                      </>
                    )}
                    {isCreatorRole && !(isSales && selectedProject.status !== 'proposal') && (
                      <button className="btn-secondary" onClick={() => {
                        if (isSales && selectedProject.status === 'proposal') {
                          setShowProposalModal(true);
                        } else {
                          executeWithAuth(() => setShowProposalModal(true));
                        }
                      }}>
                        <Edit3 size={16} /> Editar Propuesta
                      </button>
                    )}
                    <button className="btn-primary" onClick={handlePrint}>
                      <Printer size={16} /> Imprimir / PDF
                    </button>
                    {isCreatorRole && (
                      <button className="btn-secondary" style={{ color: '#ff4444' }} onClick={() => handleDelete(selectedProject.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                    {isObserver && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem' }}>
                        <Lock size={14} /> Modo lectura
                      </div>
                    )}
                <button className="btn-secondary" style={{ padding: '0.5rem' }} onClick={() => setSelectedProject(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Contenido (Visible al imprimir) */}
            <div className="print-area" style={{ padding: '2rem', overflowY: 'auto', flex: 1, background: '#ffffff' }}>
              
              {/* Header de la Propuesta (Solo se ve bien en blanco o al imprimir si no estamos editando) */}
                <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #b87333', paddingBottom: '0.5rem' }}>
                  <Image src="/logo_3d.png" alt="P&P CONSTRUYE" width={160} height={80} style={{ objectFit: 'contain' }} priority />
                  <div style={{ textAlign: 'right', color: '#333' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#b87333' }}>
                      PROPUESTA {selectedProject.proposal_number ? `N° ${selectedProject.proposal_number}` : ''}
                    </h3>
                    <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.85rem' }}>Fecha: {new Date(selectedProject.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div style={{ lineHeight: 1.6, color: '#000', fontSize: '14px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {renderStructuredProposal(selectedProject.description)}
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unificar Propuestas */}
      {showMergeModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card animate-fade" style={{ maxWidth: '560px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <GitMerge size={22} style={{ color: '#b87333' }} /> Unificar Propuestas
              </h2>
              <button className="btn-secondary" style={{ padding: '0.4rem' }} onClick={() => setShowMergeModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              Las propuestas seleccionadas se fusionarán en una sola. Los datos financieros de las propuestas secundarias se transferirán a la propuesta principal y los presupuestos se sumarán.
            </p>

            {/* Lista de propuestas seleccionadas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>PROPUESTAS A UNIFICAR</label>
              {selectedForMerge.map(id => {
                const p = projects.find(x => x.id === id);
                if (!p) return null;
                return (
                  <div key={id} style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>#{p.proposal_number} </span>
                      <span style={{ color: 'white' }}>{p.title}</span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{p.clients?.name}</div>
                    </div>
                    <div style={{ color: 'var(--success)', fontWeight: 600 }}>
                      ${Number(p.budget_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Presupuesto combinado */}
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(184,115,51,0.08)', borderRadius: '8px', border: '1px solid rgba(184,115,51,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Presupuesto total combinado:</span>
              <span style={{ color: '#b87333', fontWeight: 700, fontSize: '1.1rem' }}>
                ${selectedForMerge.reduce((sum, id) => sum + (projects.find(p => p.id === id)?.budget_usd ?? 0), 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Selección de propuesta target */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                PROPUESTA QUE SE CONSERVA (número de proyecto)
              </label>
              <select
                className="input-field"
                value={targetMergeId}
                onChange={e => setTargetMergeId(e.target.value)}
                style={{ width: '100%' }}
              >
                {selectedForMerge.map(id => {
                  const p = projects.find(x => x.id === id);
                  if (!p) return null;
                  return (
                    <option key={id} value={id}>
                      #{p.proposal_number} — {p.title}
                    </option>
                  );
                })}
              </select>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Las otras propuestas se marcarán como canceladas y pasarán al historial.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowMergeModal(false)}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={handleMerge}
                disabled={merging || !targetMergeId}
              >
                <GitMerge size={16} /> {merging ? 'Unificando...' : 'Confirmar Unificación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reabrir Proyecto del Historial */}
      {showReopenModal && reopenTarget && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card animate-fade" style={{ maxWidth: '440px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <RotateCcw size={20} style={{ color: reopenTarget.status === 'in_progress' ? '#ffcc00' : '#38bdf8' }} /> 
                {reopenTarget.status === 'in_progress' ? 'Retornar a Propuesta' : 'Reabrir Proyecto'}
              </h2>
              <button className="btn-secondary" style={{ padding: '0.4rem' }} onClick={() => setShowReopenModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '0.75rem 1rem', background: 'rgba(56,189,248,0.06)', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.2)' }}>
              <div style={{ fontWeight: 600, color: 'white' }}>
                {reopenTarget.proposal_number ? <span style={{ color: 'var(--primary-color)' }}>#{reopenTarget.proposal_number} — </span> : ''}
                {reopenTarget.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {reopenTarget.clients?.name}
              </div>
            </div>

            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
              {reopenTarget.status === 'in_progress'
                ? <>Este proyecto regresará a <strong style={{ color: 'white' }}>Propuesta Pendiente</strong>.</>
                : <>Este proyecto regresará a <strong style={{ color: 'white' }}>En Ejecución</strong>.</>
              } Ingresa la contraseña de administrador para continuar.
            </p>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                CONTRASEÑA DE ADMINISTRADOR
              </label>
              <input
                type="password"
                className="input-field"
                style={{ width: '100%' }}
                placeholder="••••••••"
                value={reopenPassword}
                onChange={e => { setReopenPassword(e.target.value); setReopenError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleReopen(); }}
                autoFocus
              />
              {reopenError && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem', color: '#ff4444' }}>{reopenError}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowReopenModal(false)}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: reopenTarget.status === 'in_progress' ? '#ffcc00' : '#38bdf8', borderColor: reopenTarget.status === 'in_progress' ? '#ffcc00' : '#38bdf8', color: reopenTarget.status === 'in_progress' ? '#000' : '#fff' }}
                onClick={handleReopen}
              >
                <RotateCcw size={15} /> {reopenTarget.status === 'in_progress' ? 'Confirmar Retorno' : 'Confirmar Reapertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Solicitar Contraseña para Sales */}
      {showAuthModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card animate-fade" style={{ maxWidth: '440px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Lock size={20} style={{ color: 'var(--primary-color)' }} /> Autorización Requerida
              </h2>
              <button className="btn-secondary" style={{ padding: '0.4rem' }} onClick={() => { setShowAuthModal(false); setPendingAction(null); }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
              Esta acción requiere privilegios de administrador para modificar propuestas. Por favor ingresa la clave maestra.
            </p>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                CLAVE DE ADMINISTRADOR
              </label>
              <input
                type="password"
                className="input-field"
                style={{ width: '100%' }}
                placeholder="••••••••"
                value={authPassword}
                onChange={e => { setAuthPassword(e.target.value); setAuthError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleAuthSubmit(); }}
                autoFocus
              />
              {authError && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem', color: '#ff4444' }}>{authError}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setShowAuthModal(false); setPendingAction(null); }}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={handleAuthSubmit}
              >
                <Check size={15} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <NewProposalModal 
        isOpen={showProposalModal}
        existingProposal={selectedProject}
        onClose={() => { setShowProposalModal(false); setSelectedProject(null); }}
        onSaved={() => { setShowProposalModal(false); setSelectedProject(null); fetchProjects(); }}
      />

      {/* Estilos específicos para impresión */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { 
            background: white !important; 
            color: #111 !important; 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
          }
          .hide-on-print, aside, nav, button, header { display: none !important; }
          .app-container, .main-content { 
            padding: 0 !important; 
            margin: 0 !important; 
            max-width: 100% !important;
            width: 100% !important;
          }
          .print-modal { 
            position: static !important; 
            background: transparent !important; 
            display: block !important;
          }
          .print-content { 
            box-shadow: none !important; 
            border: none !important; 
            width: 100% !important; 
            max-width: none !important; 
            max-height: none !important; 
            padding: 0 !important; 
            margin: 0 !important;
          }
          .print-area { 
            overflow: visible !important; 
            background: white !important; 
            padding: 0 !important; 
          }
          @page {
            margin: 2cm;
          }
        }
      `}} />
    </>
  );
}
