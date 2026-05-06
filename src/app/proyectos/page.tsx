'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  Clock,
  CheckCircle,
  Printer,
  Edit3,
  ChevronRight,
  DollarSign,
  Trash2,
  Ban,
  Check,
  LayoutDashboard,
  Save,
  X,
  Sparkles,
  Lock,
  Archive,
  HardHat
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleMoneyInput, parseCurrency, formatCurrency, formatOnBlur } from '@/lib/formatters';
import { modifyProposalText } from '@/app/actions/ai-actions';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAdminAction } from '@/lib/useAdminAction';

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
  const router = useRouter();
  const { canEdit, canDelete, isObserver } = useAdminAction();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editBudget, setEditBudget] = useState<string>('0');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'active' | 'archived'>('active');

  const [aiInstruction, setAiInstruction] = useState('');
  const [isModifyingAi, setIsModifyingAi] = useState(false);

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
            setIsEditing(false);
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

  async function handleSave() {
    if (!selectedProject) return;
    setSaving(true);
    const budgetAmount = parseCurrency(editBudget);
    const { error } = await supabase
      .from('projects')
      .update({ 
        description: editContent,
        budget_usd: budgetAmount
      })
      .eq('id', selectedProject.id);

    if (!error) {
      setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, description: editContent, budget_usd: budgetAmount } : p));
      setSelectedProject({ ...selectedProject, description: editContent, budget_usd: budgetAmount });
      setIsEditing(false);
    } else {
      alert(`Error al guardar: ${error.message}`);
    }
    setSaving(false);
  }

  async function handleAiModify() {
    if (!aiInstruction.trim() || !editContent) return;
    setIsModifyingAi(true);
    const result = await modifyProposalText(editContent, aiInstruction);
    if (result.success && result.modifiedText) {
      setEditContent(result.modifiedText);
      setAiInstruction('');
    } else {
      alert(result.error || 'Hubo un error al modificar el texto con IA.');
    }
    setIsModifyingAi(false);
  }

  async function handleStatusUpdate(id: string, newStatus: string) {
    if (!canEdit) {
      alert('❌ Solo administradores pueden cambiar el estado de las propuestas');
      return;
    }

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
  }

  async function handleDelete(id: string) {
    if (!canDelete) {
      alert('❌ Solo administradores pueden eliminar propuestas');
      return;
    }

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
  }

  const handlePrint = () => {
    window.print();
  };

  const activeProjects = projects.filter(p => p.archived_at === null || p.archived_at === undefined);
  const archivedProjects = projects.filter(p => p.archived_at !== null && p.archived_at !== undefined);
  const filteredProjects = (view === 'active' ? activeProjects : archivedProjects).filter(p =>
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

        {/* Tab switcher: Activos / Historial */}
        <div className="hide-on-print" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '0', background: 'var(--surface-color)', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
          <button
            onClick={() => setView('active')}
            style={{ padding: '0.9rem 1.5rem', background: 'none', border: 'none', borderBottom: view === 'active' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'active' ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
          >
            <HardHat size={16} /> Activos
            <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{activeProjects.length}</span>
          </button>
          <button
            onClick={() => setView('archived')}
            style={{ padding: '0.9rem 1.5rem', background: 'none', border: 'none', borderBottom: view === 'archived' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'archived' ? 'var(--primary-color)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
          >
            <Archive size={16} /> Historial
            {archivedProjects.length > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{archivedProjects.length}</span>
            )}
          </button>
        </div>

        <div className="card hide-on-print" style={{ padding: 0, overflow: 'hidden', borderRadius: '0 0 16px 16px', marginTop: 0, borderTop: 'none' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
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
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontWeight: '600', color: 'white' }}>
                      {project.proposal_number ? <span style={{ color: 'var(--primary-color)', marginRight: '0.5rem' }}>#{project.proposal_number}</span> : null}
                      {project.title}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(project.created_at).toLocaleDateString()}</div>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-secondary)' }}>
                    {project.clients?.name || 'Cliente por definir'}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontWeight: '600', color: 'var(--success)' }}>
                      ${Number(project.budget_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
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
                              setIsEditing(false);
                              setTimeout(() => window.print(), 300);
                            }}
                          >
                            <Printer size={14} />
                          </button>
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
                                  setIsEditing(false);
                                  setTimeout(() => window.print(), 300);
                                }}
                              >
                                <Printer size={14} /> Imprimir
                              </button>
                            </>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--primary-color)' }}
                                title="Editar Presupuesto y Texto"
                                onClick={() => {
                                  setSelectedProject(project);
                                  setEditContent(project.description);
                                  setEditBudget(formatCurrency(project.budget_usd));
                                  setIsEditing(true);
                                }}
                              >
                                <Edit3 size={14} /> Editar
                              </button>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.5rem', fontSize: '0.8rem' }}
                                title="Ver detalles"
                                onClick={() => {
                                  setSelectedProject(project);
                                  setEditContent(project.description);
                                  setEditBudget(String(project.budget_usd));
                                  setIsEditing(false);
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
                                  setEditContent(project.description);
                                  setIsEditing(false);
                                  setTimeout(() => window.print(), 300);
                                }}
                              >
                                <Printer size={14} />
                              </button>
                            </div>
                          )}

                          {project.status === 'proposal' && (
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

                          <button
                            className="btn-secondary"
                            style={{ padding: '0.5rem', color: '#ff4444' }}
                            title="Eliminar Permanente"
                            onClick={() => handleDelete(project.id)}
                          >
                            <Trash2 size={14} />
                          </button>
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
                {!isEditing ? (
                  <>
                    {selectedProject.status === 'proposal' && canEdit && (
                      <>
                        <button className="btn-primary" style={{ background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => handleStatusUpdate(selectedProject.id, 'in_progress')}>
                          <Check size={16} /> Aprobar
                        </button>
                        <button className="btn-secondary" style={{ color: '#ffcc00' }} onClick={() => handleStatusUpdate(selectedProject.id, 'cancelled')}>
                          <Ban size={16} /> Rechazar
                        </button>
                      </>
                    )}
                    {canEdit && (
                      <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                        <Edit3 size={16} /> Editar Texto
                      </button>
                    )}
                    <button className="btn-primary" onClick={handlePrint}>
                      <Printer size={16} /> Imprimir / PDF
                    </button>
                    {canDelete && (
                      <button className="btn-secondary" style={{ color: '#ff4444' }} onClick={() => handleDelete(selectedProject.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                    {isObserver && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem' }}>
                        <Lock size={14} /> Modo lectura
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </button>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>
                      <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </>
                )}
                <button className="btn-secondary" style={{ padding: '0.5rem' }} onClick={() => setSelectedProject(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Contenido (Visible al imprimir) */}
            <div className="print-area" style={{ padding: '2rem', overflowY: 'auto', flex: 1, background: isEditing ? '#0c0e12' : '#ffffff' }}>
              
              {/* Header de la Propuesta (Solo se ve bien en blanco o al imprimir si no estamos editando) */}
              {!isEditing && (
                <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #b87333', paddingBottom: '1rem' }}>
                  <Image src="/logo_3d.png" alt="P&P CONSTRUYE" width={200} height={100} style={{ objectFit: 'contain' }} priority />
                  <div style={{ textAlign: 'right', color: '#333' }}>
                    <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#b87333' }}>
                      PROPUESTA {selectedProject.proposal_number ? `N° ${selectedProject.proposal_number}` : ''}
                    </h3>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>Fecha: {new Date(selectedProject.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              )}

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ background: 'rgba(245,158,11,0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                      MONTO TOTAL DEL PRESUPUESTO (USD)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <DollarSign size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }} />
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ paddingLeft: '3rem', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}
                        value={editBudget}
                        onChange={(e) => setEditBudget(handleMoneyInput(e.target.value))}
                        onBlur={(e) => setEditBudget(formatOnBlur(e.target.value))}
                        placeholder="0,00"
                      />
                    </div>
                    <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Este monto es el que se usará para calcular los pagos y la rentabilidad una vez aprobada la propuesta.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      TEXTO DESCRIPTIVO DE LA PROPUESTA
                    </label>
                    
                    {/* Panel de Asistencia IA */}
                    <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ flex: 1, padding: '0.6rem 1rem', fontSize: '0.85rem' }}
                        placeholder="Ej: Haz el texto más formal, añade que la garantía es de 1 año..."
                        value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAiModify(); }}
                      />
                      <button 
                        className="btn-primary" 
                        style={{ padding: '0.6rem 1rem', background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', fontSize: '0.85rem' }}
                        onClick={handleAiModify}
                        disabled={isModifyingAi || !aiInstruction.trim()}
                      >
                        <Sparkles size={16} /> {isModifyingAi ? 'Modificando...' : 'Aplicar con IA'}
                      </button>
                    </div>

                    <textarea 
                      className="input-field" 
                      style={{ width: '100%', minHeight: '40vh', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.6 }}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#000', fontSize: '14px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {selectedProject.description}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
