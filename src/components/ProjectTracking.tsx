'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { extractServicesFromProposalWithPepe } from '@/app/actions/ai-actions';
import { parseProposalTasks } from '@/lib/projectTaskHelper';
import { 
  Check, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  Calendar, 
  FileText, 
  AlertCircle, 
  Printer, 
  Search, 
  Edit3, 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  X, 
  HardHat, 
  TrendingUp,
  Sparkles,
  Bot
} from 'lucide-react';

export interface ProjectTrackingProps {
  projectId: string;
  projectTitle?: string;
  proposalNumber?: number;
  clientName?: string;
  clientData?: {
    company_name?: string | null;
    tax_id?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  projectDescription?: string;
  startDate?: string;
  area?: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  phase: string | null;
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  notes: string | null;
  sort_order: number;
  created_at?: string;
}

export default function ProjectTracking({ 
  projectId, 
  projectTitle = 'Proyecto', 
  proposalNumber, 
  clientName = 'Cliente', 
  clientData, 
  projectDescription, 
  startDate,
  area 
}: ProjectTrackingProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI states
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPhase, setNewTaskPhase] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [extractingWithPepe, setExtractingWithPepe] = useState(false);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'pending' | 'completed'>('all');

  // Task Edit / Bitacora Modal
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    phase: '',
    status: 'pending' as 'pending' | 'in_progress' | 'completed' | 'blocked',
    due_date: '',
    notes: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Print Report Modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchTasks();
  }, [projectId]);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      let taskList = data || [];

      // Si no hay tareas y existe la propuesta técnica, auto-poblar silenciosamente de inmediato
      if (taskList.length === 0 && projectDescription) {
        const extracted = parseProposalTasks(projectDescription);
        if (extracted.length > 0) {
          const toInsert = extracted.map((et, idx) => ({
            project_id: projectId,
            title: et.title,
            phase: et.phase,
            completed: false,
            sort_order: idx + 1
          }));

          const { data: inserted, error: insertErr } = await supabase
            .from('project_tasks')
            .insert(toInsert)
            .select();

          if (!insertErr && inserted && inserted.length > 0) {
            taskList = inserted;
          }
        }
      }

      const parsedTasks: Task[] = taskList.map((t: any) => ({
        ...t,
        status: t.completed ? 'completed' : 'pending'
      }));
      
      setTasks(parsedTasks);
      
      // Auto-expand all phases
      const phases = new Set(parsedTasks.map(t => t.phase || 'Fase General / Sin Asignar'));
      const initialExpanded: Record<string, boolean> = {};
      phases.forEach(p => initialExpanded[p] = true);
      setExpandedPhases(initialExpanded);
      
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      setError('Error al cargar las tareas del proyecto.');
    } finally {
      setLoading(false);
    }
  };

  const updateProjectProgress = async (currentTasks: Task[]) => {
    const total = currentTasks.length;
    const completed = currentTasks.filter(t => t.completed || t.status === 'completed').length;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    try {
      await supabase
        .from('projects')
        .update({ progress_pct: progressPct })
        .eq('id', projectId);
    } catch (err) {
      console.error('Error updating project progress:', err);
    }
  };

  // Toggle de un solo clic: puro tildar con el check
  const toggleTaskStatus = async (task: Task) => {
    const isCompleted = task.status === 'completed' || task.completed;
    const nextCompleted = !isCompleted;
    const nextStatus: 'completed' | 'pending' = nextCompleted ? 'completed' : 'pending';
    const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;

    // Optimistic update
    const updatedTasks = tasks.map(t => 
      t.id === task.id ? { 
        ...t, 
        completed: nextCompleted, 
        status: nextStatus,
        completed_at: nextCompletedAt 
      } : t
    );
    setTasks(updatedTasks);
    updateProjectProgress(updatedTasks);

    try {
      const { error } = await supabase
        .from('project_tasks')
        .update({ 
          completed: nextCompleted, 
          completed_at: nextCompletedAt 
        })
        .eq('id', task.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating task status:', err);
      fetchTasks();
    }
  };

  // Ciclo rápido de 3 estados al hacer clic en el badge: Pendiente -> En Ejecución -> Culminado -> Pendiente
  const cycleTaskStatus = async (task: Task) => {
    const current = task.status || (task.completed ? 'completed' : 'pending');
    let nextStatus: 'pending' | 'in_progress' | 'completed' = 'in_progress';
    let isCompleted = false;
    let completedAt: string | null = null;

    if (current === 'pending') {
      nextStatus = 'in_progress';
      isCompleted = false;
    } else if (current === 'in_progress') {
      nextStatus = 'completed';
      isCompleted = true;
      completedAt = new Date().toISOString();
    } else {
      nextStatus = 'pending';
      isCompleted = false;
    }

    const updatedTasks = tasks.map(t => 
      t.id === task.id ? { 
        ...t, 
        status: nextStatus,
        completed: isCompleted,
        completed_at: completedAt 
      } : t
    );
    setTasks(updatedTasks);
    updateProjectProgress(updatedTasks);

    try {
      const { error } = await supabase
        .from('project_tasks')
        .update({ 
          completed: isCompleted,
          completed_at: completedAt
        })
        .eq('id', task.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error cycling task status:', err);
      fetchTasks();
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      phase: task.phase || '',
      status: task.status || (task.completed ? 'completed' : 'pending'),
      due_date: task.due_date || '',
      notes: task.notes || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editForm.title.trim()) return;

    setSavingEdit(true);
    const isCompleted = editForm.status === 'completed';
    const completedAt = isCompleted ? (editingTask.completed_at || new Date().toISOString()) : null;

    try {
      const { error } = await supabase
        .from('project_tasks')
        .update({
          title: editForm.title.trim(),
          phase: editForm.phase.trim() || null,
          completed: isCompleted,
          completed_at: completedAt,
          due_date: editForm.due_date || null,
          notes: editForm.notes.trim() || null
        })
        .eq('id', editingTask.id);

      if (error) throw error;

      const updatedTasks = tasks.map(t => 
        t.id === editingTask.id ? {
          ...t,
          title: editForm.title.trim(),
          phase: editForm.phase.trim() || null,
          status: editForm.status,
          completed: isCompleted,
          completed_at: completedAt,
          due_date: editForm.due_date || null,
          notes: editForm.notes.trim() || null
        } : t
      );

      setTasks(updatedTasks);
      updateProjectProgress(updatedTasks);
      setEditingTask(null);

    } catch (err: any) {
      console.error('Error saving task edit:', err);
      alert('Error al guardar cambios de la tarea: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const addTask = async (e?: React.FormEvent, targetPhase?: string) => {
    if (e) e.preventDefault();
    
    const titleToUse = e && (e.target as any).elements?.title ? (e.target as any).elements.title.value : newTaskTitle;
    if (!titleToUse || !titleToUse.trim()) return;

    setAddingTask(true);
    const phaseToUse = targetPhase !== undefined ? targetPhase : newTaskPhase;
    
    try {
      const newTask = {
        project_id: projectId,
        title: titleToUse.trim(),
        phase: phaseToUse || null,
        completed: false,
        sort_order: tasks.length
      };

      const { data, error } = await supabase
        .from('project_tasks')
        .insert(newTask)
        .select()
        .single();

      if (error) throw error;

      const parsed: Task = { ...data, status: 'pending' };
      const newTasks = [...tasks, parsed];
      setTasks(newTasks);
      updateProjectProgress(newTasks);
      
      setNewTaskTitle('');
      if (!targetPhase) {
        setShowAddForm(false);
      }
      
      const phaseKey = data.phase || 'Fase General / Sin Asignar';
      setExpandedPhases(prev => ({ ...prev, [phaseKey]: true }));
      
    } catch (err: any) {
      console.error('Error adding task:', err);
      setError('Error al agregar la tarea.');
    } finally {
      setAddingTask(false);
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta partida de seguimiento?')) return;

    try {
      const { error } = await supabase
        .from('project_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const newTasks = tasks.filter(t => t.id !== id);
      setTasks(newTasks);
      updateProjectProgress(newTasks);
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Error al eliminar la tarea.');
    }
  };

  const handleExtractWithPepe = async () => {
    if (!projectDescription) return;
    setExtractingWithPepe(true);
    try {
      const res = await extractServicesFromProposalWithPepe(projectDescription);
      if (res.success && res.phases) {
        const existingTitles = new Set(tasks.map(t => t.title.toLowerCase().trim()));
        const tasksToInsert: any[] = [];
        let sortCounter = tasks.length;

        res.phases.forEach(phaseItem => {
          phaseItem.tasks.forEach(taskTitle => {
            if (!existingTitles.has(taskTitle.toLowerCase().trim())) {
              tasksToInsert.push({
                project_id: projectId,
                title: taskTitle,
                phase: phaseItem.phase,
                completed: false,
                sort_order: sortCounter++
              });
            }
          });
        });

        if (tasksToInsert.length > 0) {
          await supabase.from('project_tasks').insert(tasksToInsert);
          await fetchTasks();
        }
      }
    } catch (err: any) {
      console.error('Error re-extracting with Pepe:', err);
    } finally {
      setExtractingWithPepe(false);
    }
  };

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => ({
      ...prev,
      [phase]: !prev[phase]
    }));
  };

  // Métricas y Cálculos de los 3 estados
  const stats = useMemo(() => {
    const total = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    
    tasks.forEach(t => {
      const isComp = t.status === 'completed' || t.completed;
      if (isComp) {
        completed++;
      } else if (t.status === 'in_progress') {
        inProgress++;
      } else {
        pending++;
      }
    });

    const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
    const pendingPct = total > 0 ? Math.max(0, 100 - completedPct - inProgressPct) : 0;

    return { total, completed, inProgress, pending, completedPct, inProgressPct, pendingPct };
  }, [tasks]);

  // Tareas agrupadas por Fase
  const phasesData = useMemo(() => {
    const grouped: Record<string, { tasks: Task[]; completed: number; total: number; pct: number }> = {};
    
    tasks.forEach(t => {
      const p = t.phase || 'Fase General / Sin Asignar';
      if (!grouped[p]) {
        grouped[p] = { tasks: [], completed: 0, total: 0, pct: 0 };
      }
      grouped[p].tasks.push(t);
      grouped[p].total++;
      if (t.status === 'completed' || t.completed) {
        grouped[p].completed++;
      }
    });

    Object.keys(grouped).forEach(k => {
      const item = grouped[k];
      item.pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
    });

    return grouped;
  }, [tasks]);

  // Filtro de tareas
  const filteredPhasesData = useMemo(() => {
    const result: Record<string, { tasks: Task[]; completed: number; total: number; pct: number }> = {};

    Object.entries(phasesData).forEach(([phaseName, data]) => {
      const matchingTasks = data.tasks.filter(t => {
        if (searchTerm) {
          const matchTitle = t.title.toLowerCase().includes(searchTerm.toLowerCase());
          const matchNotes = (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
          const matchPhase = (t.phase || '').toLowerCase().includes(searchTerm.toLowerCase());
          if (!matchTitle && !matchNotes && !matchPhase) return false;
        }

        const isComp = t.status === 'completed' || t.completed;
        if (statusFilter === 'completed') return isComp;
        if (statusFilter === 'in_progress') return t.status === 'in_progress';
        if (statusFilter === 'pending') return !isComp && t.status !== 'in_progress';

        return true;
      });

      if (matchingTasks.length > 0) {
        result[phaseName] = {
          ...data,
          tasks: matchingTasks
        };
      }
    });

    return result;
  }, [phasesData, searchTerm, statusFilter]);

  if (loading && tasks.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--primary-color)' }} />
        <div>Cargando actividades de la obra...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {error && (
        <div style={{ 
          padding: '0.8rem 1rem', 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem'
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ── HEADER PRINCIPAL (LIMPIO Y ELEGANTE) ── */}
      <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HardHat size={20} color="var(--primary-color)" />
            Seguimiento de Obra
          </h2>
          <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {projectTitle} — {clientName}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {projectDescription && tasks.length === 0 && (
            <button 
              className="btn-secondary"
              onClick={handleExtractWithPepe} 
              disabled={extractingWithPepe}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.45rem 0.8rem' }}
            >
              <Bot size={15} color="var(--primary-color)" />
              {extractingWithPepe ? 'Sincronizando...' : 'Cargar Propuesta'}
            </button>
          )}

          <button 
            className="btn-secondary"
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            <Plus size={15} /> Nueva Partida
          </button>

          <button 
            className="btn-primary"
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.82rem', padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'black', fontWeight: 700
            }}
          >
            <Printer size={15} />
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* ── GRÁFICO VISUAL DE ESTADOS DE LA OBRA (CULMINADO / EN EJECUCIÓN / PENDIENTE) ── */}
      <div className="hide-on-print" style={{ 
        backgroundColor: 'rgba(255,255,255,0.02)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '12px',
        padding: '1.1rem 1.3rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem'
      }}>
        {/* Cabecera del gráfico */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Estado Global de Ejecución
          </span>
          <span style={{ fontWeight: 800, fontSize: '1.15rem', color: stats.completedPct === 100 ? '#10b981' : 'var(--primary-color)' }}>
            {stats.completedPct}% Culminado
          </span>
        </div>

        {/* Barra Segmentada Tricolor (Verde / Azul / Gris) */}
        <div style={{ 
          width: '100%', 
          height: '14px', 
          backgroundColor: 'rgba(255,255,255,0.06)', 
          borderRadius: '999px',
          overflow: 'hidden',
          display: 'flex',
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          {stats.completedPct > 0 && (
            <div 
              style={{ width: `${stats.completedPct}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.4s ease' }} 
              title={`Culminado: ${stats.completedPct}%`} 
            />
          )}
          {stats.inProgressPct > 0 && (
            <div 
              style={{ width: `${stats.inProgressPct}%`, height: '100%', backgroundColor: '#38bdf8', transition: 'width 0.4s ease' }} 
              title={`En Ejecución: ${stats.inProgressPct}%`} 
            />
          )}
          {stats.pendingPct > 0 && (
            <div 
              style={{ width: `${stats.pendingPct}%`, height: '100%', backgroundColor: 'rgba(255,255,255,0.12)', transition: 'width 0.4s ease' }} 
              title={`Pendiente: ${stats.pendingPct}%`} 
            />
          )}
        </div>

        {/* 3 Indicadores de Estado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', textAlign: 'center' }}>
          {/* Culminadas */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
            style={{ 
              backgroundColor: statusFilter === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.05)', 
              border: statusFilter === 'completed' ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.15)',
              borderRadius: '8px', 
              padding: '0.55rem', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#86efac', fontWeight: 600 }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              Culminadas
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', marginTop: '0.15rem' }}>
              {stats.completed} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>({stats.completedPct}%)</span>
            </div>
          </div>

          {/* En Ejecución */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
            style={{ 
              backgroundColor: statusFilter === 'in_progress' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.05)', 
              border: statusFilter === 'in_progress' ? '1px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.15)',
              borderRadius: '8px', 
              padding: '0.55rem', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#7dd3fc', fontWeight: 600 }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
              En Ejecución
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.15rem' }}>
              {stats.inProgress} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>({stats.inProgressPct}%)</span>
            </div>
          </div>

          {/* Pendientes */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            style={{ 
              backgroundColor: statusFilter === 'pending' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)', 
              border: statusFilter === 'pending' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px', 
              padding: '0.55rem', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
              Pendientes
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', marginTop: '0.15rem' }}>
              {stats.pending} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>({stats.pendingPct}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE BÚSQUEDA Y FILTROS RÁPIDOS ── */}
      <div className="hide-on-print" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '0.6rem'
      }}>
        {/* Pills de Estado */}
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `Todas (${stats.total})` },
            { id: 'completed', label: `Culminadas (${stats.completed})` },
            { id: 'in_progress', label: `En Curso (${stats.inProgress})` },
            { id: 'pending', label: `Pendientes (${stats.pending})` }
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setStatusFilter(btn.id as any)}
              style={{
                padding: '0.3rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: statusFilter === btn.id ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                color: statusFilter === btn.id ? 'black' : 'var(--text-muted)'
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text"
            placeholder="Buscar partida..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.35rem 0.65rem 0.35rem 1.9rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: 'white',
              fontSize: '0.8rem'
            }}
          />
        </div>
      </div>

      {/* FORMULARIO PARA AGREGAR NUEVA TAREA */}
      {showAddForm && (
        <form onSubmit={addTask} className="hide-on-print animate-fade" style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem' }}>
            <input
              type="text"
              placeholder="Descripción del servicio / partida (ej. Levantamiento de paredes en bloque)"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.82rem'
              }}
              autoFocus
            />
            <input
              type="text"
              placeholder="Fase (ej. Fase 1: Albañilería)"
              value={newTaskPhase}
              onChange={(e) => setNewTaskPhase(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.82rem'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={addingTask || !newTaskTitle.trim()} style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem' }}>
              {addingTask ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* ── LISTA DE FASES Y ACTIVIDADES ("PURO TILDAR CON EL CHECK") ── */}
      <div className="hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {Object.keys(filteredPhasesData).length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '2.5rem 1rem', 
            backgroundColor: 'rgba(255,255,255,0.01)', 
            borderRadius: '10px', 
            border: '1px dashed var(--border-color)',
            color: 'var(--text-muted)'
          }}>
            <HardHat size={32} style={{ margin: '0 auto 0.6rem auto', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay partidas para mostrar con los filtros actuales.</p>
          </div>
        ) : (
          Object.entries(filteredPhasesData).map(([phaseName, phaseInfo]) => {
            const isExpanded = expandedPhases[phaseName] !== false;

            return (
              <div key={phaseName} style={{
                backgroundColor: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '10px',
                overflow: 'hidden'
              }}>
                {/* Cabecera de la Fase */}
                <div 
                  onClick={() => togglePhase(phaseName)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', 
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', 
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                    <div style={{ color: 'var(--primary-color)' }}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <span style={{ fontWeight: 700, color: 'white', fontSize: '0.88rem' }}>{phaseName}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ width: '80px', height: '5px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${phaseInfo.pct}%`, 
                        backgroundColor: phaseInfo.pct === 100 ? '#10b981' : 'var(--primary-color)' 
                      }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: phaseInfo.pct === 100 ? '#10b981' : 'var(--text-muted)' }}>
                      {phaseInfo.completed}/{phaseInfo.total} ({phaseInfo.pct}%)
                    </span>
                  </div>
                </div>

                {/* Lista de Partidas dentro de la Fase */}
                {isExpanded && (
                  <div>
                    {phaseInfo.tasks.map(task => {
                      const isCompleted = task.status === 'completed' || task.completed;
                      const isInProgress = task.status === 'in_progress';

                      return (
                        <div 
                          key={task.id} 
                          style={{
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            backgroundColor: isCompleted ? 'rgba(16, 185, 129, 0.02)' : isInProgress ? 'rgba(56, 189, 248, 0.02)' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {/* CHECKBOX GRANDE Y DIRECTO (1 CLIC PARA TILDAR) */}
                          <button
                            type="button"
                            onClick={() => toggleTaskStatus(task)}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              border: isCompleted ? 'none' : isInProgress ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.3)',
                              backgroundColor: isCompleted ? '#10b981' : isInProgress ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                              padding: 0,
                              transition: 'all 0.15s ease'
                            }}
                            title={isCompleted ? 'Desmarcar (volver a pendiente)' : 'Marcar como completada'}
                          >
                            {isCompleted && <Check size={16} strokeWidth={3} />}
                            {isInProgress && <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />}
                          </button>
                          
                          {/* TÍTULO Y NOTAS */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div 
                              onClick={() => toggleTaskStatus(task)}
                              style={{ 
                                color: isCompleted ? 'var(--text-muted)' : 'white',
                                fontSize: '0.85rem',
                                fontWeight: isCompleted ? 400 : 500,
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                cursor: 'pointer'
                              }}
                            >
                              {task.title}
                            </div>

                            {/* Sub-info sutil */}
                            {(task.notes || task.completed_at) && (
                              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {task.notes && (
                                  <span style={{ color: '#94a3b8' }}>
                                    📝 {task.notes}
                                  </span>
                                )}
                                {task.completed_at && (
                                  <span style={{ color: '#10b981' }}>
                                    ✓ Culminado: {new Date(task.completed_at).toLocaleDateString('es-VE')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* BADGE CLICABLE PARA ALTERNAR ESTADO (Pendiente / En Ejecución / Culminado) */}
                          <button
                            type="button"
                            onClick={() => cycleTaskStatus(task)}
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              border: 'none',
                              cursor: 'pointer',
                              backgroundColor: isCompleted 
                                ? 'rgba(16, 185, 129, 0.15)' 
                                : isInProgress 
                                  ? 'rgba(56, 189, 248, 0.15)' 
                                  : 'rgba(255,255,255,0.05)',
                              color: isCompleted 
                                ? '#86efac' 
                                : isInProgress 
                                  ? '#7dd3fc' 
                                  : 'var(--text-muted)',
                              flexShrink: 0
                            }}
                            title="Haz clic para alternar entre Pendiente, En Ejecución y Culminado"
                          >
                            {isCompleted ? '✓ Culminado' : isInProgress ? '⏳ En Curso' : '⚪ Pendiente'}
                          </button>

                          {/* BOTONES ACCIÓN RÁPIDA (EDITAR NOTAS / ELIMINAR) */}
                          <button 
                            type="button"
                            onClick={() => openEditModal(task)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                            title="Añadir nota de campo o fecha"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => deleteTask(task.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                            title="Eliminar partida"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── MODAL DE EDICIÓN DE NOTAS / BITÁCORA ── */}
      {editingTask && (
        <div className="modal-overlay hide-on-print" style={{ zIndex: 2000 }}>
          <div className="card modal-content animate-fade" style={{ maxWidth: '500px', width: '95%', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                <Edit3 size={16} color="var(--primary-color)" />
                Detalle y Notas de la Partida
              </h3>
              <button onClick={() => setEditingTask(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Descripción de la Partida</label>
                <textarea
                  required
                  rows={2}
                  value={editForm.title}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'white', fontSize: '0.82rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Fase Asignada</label>
                  <input
                    type="text"
                    value={editForm.phase}
                    onChange={e => setEditForm({...editForm, phase: e.target.value})}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'white', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Estado Actual</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm({...editForm, status: e.target.value as any})}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'white', fontSize: '0.82rem' }}
                  >
                    <option value="pending">⚪ Pendiente</option>
                    <option value="in_progress">⏳ En Ejecución</option>
                    <option value="completed">✅ Culminada</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Notas de Obra / Bitácora</label>
                <textarea
                  rows={3}
                  placeholder="Detalles sobre avance, observaciones climáticas, materiales..."
                  value={editForm.notes}
                  onChange={e => setEditForm({...editForm, notes: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'white', fontSize: '0.82rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.4rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingTask(null)} style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={savingEdit} style={{ padding: '0.45rem 1.1rem', fontSize: '0.8rem' }}>
                  {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DOCUMENTO OFICIAL DIRECTO PARA IMPRESIÓN ── */}
      <div id="printable-tracking-report-root" style={{ color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ backgroundColor: '#ffffff', color: '#0f172a', width: '100%', padding: '0' }}>
          {/* Membrete Oficial */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2.5px solid #0f172a', paddingBottom: '1rem', marginBottom: '1.4rem' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#000', letterSpacing: '-0.02em' }}>P&P CONSTRUYE</h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#475569', fontWeight: 600 }}>Ingeniería, Arquitectura y Construcción</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>INFORME DE AVANCE DE OBRA</h2>
              <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                Fecha: <strong>{new Date(reportDate).toLocaleDateString('es-VE')}</strong>
                {proposalNumber && ` | Obra Nº: #${proposalNumber}`}
              </p>
            </div>
          </div>

          {/* Ficha de Información de Obra */}
          <div style={{ marginBottom: '1.4rem', padding: '0.8rem 1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', lineHeight: '1.5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.6rem' }}>
              <div>
                <div><strong>PROYECTO:</strong> {projectTitle}</div>
                <div><strong>CLIENTE:</strong> {clientName}</div>
                {clientData?.company_name && <div><strong>EMPRESA:</strong> {clientData.company_name}</div>}
              </div>
              <div>
                {startDate && <div><strong>INICIO:</strong> {new Date(startDate).toLocaleDateString('es-VE')}</div>}
                {area && <div><strong>ÁREA:</strong> {area}</div>}
                {clientData?.address && <div><strong>UBICACIÓN:</strong> {clientData.address}</div>}
              </div>
            </div>
          </div>

          {/* Resumen de Estados */}
          <div style={{ marginBottom: '1.4rem', padding: '0.9rem', background: '#f1f5f9', border: '1.5px solid #94a3b8', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
                AVANCE GENERAL DE LA OBRA:
              </span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: stats.completedPct === 100 ? '#166534' : '#0369a1' }}>
                {stats.completedPct}% CULMINADO
              </span>
            </div>

            {/* Barra Tricolor en Papel */}
            <div style={{ width: '100%', height: '10px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', display: 'flex', marginBottom: '0.6rem', border: '1px solid #cbd5e1' }}>
              <div style={{ width: `${stats.completedPct}%`, height: '100%', backgroundColor: '#16a34a' }} />
              <div style={{ width: `${stats.inProgressPct}%`, height: '100%', backgroundColor: '#0284c7' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '10.5px' }}>
              <div style={{ background: '#fff', padding: '0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <div style={{ color: '#64748b' }}>Total</div>
                <div style={{ fontWeight: 800, fontSize: '13px' }}>{stats.total}</div>
              </div>
              <div style={{ background: '#f0fdf4', padding: '0.35rem', borderRadius: '4px', border: '1px solid #86efac' }}>
                <div style={{ color: '#166534' }}>Culminadas</div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#166534' }}>{stats.completed} ({stats.completedPct}%)</div>
              </div>
              <div style={{ background: '#f0f9ff', padding: '0.35rem', borderRadius: '4px', border: '1px solid #7dd3fc' }}>
                <div style={{ color: '#0369a1' }}>En Ejecución</div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0369a1' }}>{stats.inProgress} ({stats.inProgressPct}%)</div>
              </div>
              <div style={{ background: '#fffbeb', padding: '0.35rem', borderRadius: '4px', border: '1px solid #fde68a' }}>
                <div style={{ color: '#b45309' }}>Pendientes</div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#b45309' }}>{stats.pending} ({stats.pendingPct}%)</div>
              </div>
            </div>
          </div>

          {/* Desglose de Fases */}
          <h3 style={{ fontSize: '12px', fontWeight: 800, borderBottom: '1.5px solid #0f172a', paddingBottom: '0.3rem', marginBottom: '0.8rem', textTransform: 'uppercase' }}>
            DESGLOSE DE PARTIDAS Y ESTADO DE EJECUCIÓN
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.5rem' }}>
            {Object.entries(phasesData).map(([phaseName, phaseInfo]) => (
              <div key={phaseName} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '0.45rem 0.8rem', borderBottom: '1px solid #cbd5e1' }}>
                  <span style={{ fontWeight: 800, fontSize: '11px', color: '#1e293b' }}>
                    {phaseName}
                  </span>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: phaseInfo.pct === 100 ? '#166534' : '#0369a1' }}>
                    {phaseInfo.completed}/{phaseInfo.total} ({phaseInfo.pct}%)
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.35rem 0.6rem', textAlign: 'left', width: '52%' }}>PARTIDA / ALCANCE TÉCNICO</th>
                      <th style={{ padding: '0.35rem 0.6rem', textAlign: 'center', width: '23%' }}>ESTADO</th>
                      <th style={{ padding: '0.35rem 0.6rem', textAlign: 'left', width: '25%' }}>OBSERVACIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseInfo.tasks.map((task, idx) => {
                      const isComp = task.status === 'completed' || task.completed;
                      const isInProg = task.status === 'in_progress';

                      return (
                        <tr key={task.id} style={{ borderBottom: idx < phaseInfo.tasks.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#1e293b', fontWeight: 500 }}>
                            {task.title}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                            {isComp ? (
                              <span style={{ color: '#166534', fontWeight: 700, background: '#dcfce7', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                ✓ Culminado
                              </span>
                            ) : isInProg ? (
                              <span style={{ color: '#0369a1', fontWeight: 700, background: '#e0f2fe', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                ⏳ En Ejecución
                              </span>
                            ) : (
                              <span style={{ color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                ⚪ Pendiente
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#475569', fontSize: '10px' }}>
                            {task.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Observaciones generales si existen */}
          {reportNotes && (
            <div style={{ marginBottom: '1.4rem', padding: '0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '10.5px' }}>
              <strong>OBSERVACIONES DE SUPERVISIÓN:</strong> {reportNotes}
            </div>
          )}

          {/* Firmas Oficiales */}
          <div style={{ marginTop: '2.5rem', paddingTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', fontSize: '10.5px', textAlign: 'center' }}>
            <div>
              <div style={{ borderTop: '1px solid #0f172a', width: '70%', margin: '0 auto 0.3rem auto' }}></div>
              <div style={{ fontWeight: 700 }}>Ing. Supervisor de Obra</div>
              <div style={{ color: '#64748b', fontSize: '9.5px' }}>P&P Construye C.A.</div>
            </div>
            <div>
              <div style={{ borderTop: '1px solid #0f172a', width: '70%', margin: '0 auto 0.3rem auto' }}></div>
              <div style={{ fontWeight: 700 }}>Conformidad del Cliente</div>
              <div style={{ color: '#64748b', fontSize: '9.5px' }}>{clientName}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ESTILOS DE IMPRESIÓN OFICIALES INFALIBLES */}
      <style>{`
        @media screen {
          #printable-tracking-report-root {
            display: none !important;
          }
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-tracking-report-root, #printable-tracking-report-root * {
            visibility: visible !important;
          }
          #printable-tracking-report-root {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 1.5cm 2cm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            z-index: 9999999 !important;
          }
          .hide-on-print, nav, header, aside, .sidebar, .top-bar, .modal-overlay {
            display: none !important;
          }
          @page {
            margin: 0;
            size: auto;
          }
        }
      `}</style>
    </div>
  );
}
