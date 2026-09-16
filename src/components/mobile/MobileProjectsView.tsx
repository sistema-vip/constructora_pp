'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  HardHat, 
  Search, 
  ChevronRight, 
  DollarSign, 
  Calendar, 
  User, 
  Plus, 
  Filter,
  CheckCircle2,
  Clock,
  Archive
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface MobileProjectsViewProps {
  projects: any[];
  loading: boolean;
  onNewProject?: () => void;
  canCreate?: boolean;
}

export default function MobileProjectsView({
  projects,
  loading,
  onNewProject,
  canCreate = true
}: MobileProjectsViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'proposal' | 'completed'>('all');

  const filtered = projects.filter(p => {
    const matchesSearch = 
      p.title?.toLowerCase().includes(search.toLowerCase()) ||
      p.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      String(p.proposal_number || '').includes(search);

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return !p.archived_at;
    if (statusFilter === 'in_progress') return p.status === 'in_progress' && !p.archived_at;
    if (statusFilter === 'proposal') return (p.status === 'proposal' || p.status === 'quoted') && !p.archived_at;
    if (statusFilter === 'completed') return p.status === 'completed' && !p.archived_at;
    return true;
  });

  return (
    <div className="mobile-view-root" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.35rem 0' }}>
          Obras & Proyectos 🏗️
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
          {filtered.length} proyectos encontrados
        </p>
      </div>

      {/* Buscador táctil */}
      <div style={{
        position: 'relative',
        marginBottom: '0.85rem'
      }}>
        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder="Buscar por obra, cliente o #..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{
            paddingLeft: '2.75rem',
            height: '46px',
            fontSize: '0.92rem',
            borderRadius: '14px'
          }}
        />
      </div>

      {/* Filtros rápidos (Chips deslizables) */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        marginBottom: '1rem',
        WebkitOverflowScrolling: 'touch'
      }}>
        {[
          { key: 'all', label: 'Todas' },
          { key: 'in_progress', label: 'En Marcha' },
          { key: 'proposal', label: 'Cotizaciones' },
          { key: 'completed', label: 'Completadas' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key as any)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '999px',
              fontSize: '0.78rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: statusFilter === tab.key ? '1px solid var(--primary-color)' : '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: statusFilter === tab.key ? 'rgba(245, 158, 11, 0.15)' : '#161a22',
              color: statusFilter === tab.key ? 'var(--primary-color)' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lista de Tarjetas Táctiles */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
          Cargando obras...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          backgroundColor: '#161a22',
          borderRadius: '16px',
          padding: '2.5rem 1rem',
          textAlign: 'center',
          border: '1px dashed rgba(255, 255, 255, 0.15)'
        }}>
          <HardHat size={36} color="#94a3b8" style={{ margin: '0 auto 0.6rem auto' }} />
          <p style={{ margin: 0, color: '#f8fafc', fontWeight: 600 }}>No se encontraron obras</p>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Prueba con otro término de búsqueda</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map(p => {
            const isCompleted = p.status === 'completed';
            const isInProgress = p.status === 'in_progress';
            const isProposal = p.status === 'proposal' || p.status === 'quoted';

            return (
              <Link
                key={p.id}
                href={`/proyectos/${p.id}`}
                style={{
                  backgroundColor: '#161a22',
                  borderRadius: '16px',
                  padding: '1.1rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                }}
              >
                {/* Header de tarjeta */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--primary-color)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}>
                    #{p.proposal_number || 'S/N'}
                  </span>

                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: isInProgress ? 'rgba(16, 185, 129, 0.15)' : isCompleted ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: isInProgress ? '#10b981' : isCompleted ? '#38bdf8' : 'var(--primary-color)'
                  }}>
                    {isInProgress ? 'En Marcha' : isCompleted ? 'Completada' : 'Cotización'}
                  </span>
                </div>

                {/* Título de la obra */}
                <h3 style={{
                  margin: '0 0 0.4rem 0',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                  lineHeight: 1.3
                }}>
                  {p.title}
                </h3>

                {/* Cliente */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                  <User size={14} color="#94a3b8" />
                  <span>{p.clients?.name || 'Cliente sin asignar'}</span>
                </div>

                {/* Footer de tarjeta con presupuesto */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '0.65rem',
                  marginTop: '0.25rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>Presupuesto Estimado</span>
                    <strong style={{ fontSize: '1.05rem', color: '#f8fafc', fontWeight: 800 }}>
                      ${p.budget_usd ? Number(p.budget_usd).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                    </strong>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.8rem',
                    color: 'var(--primary-color)',
                    fontWeight: 600
                  }}>
                    <span>Ver detalle</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Floating Action Button para nueva propuesta */}
      {canCreate && onNewProject && (
        <button
          onClick={onNewProject}
          style={{
            position: 'fixed',
            right: '1.25rem',
            bottom: 'calc(76px + env(safe-area-inset-bottom))',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-color)',
            color: '#000',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 25px rgba(245, 158, 11, 0.45)',
            cursor: 'pointer',
            zIndex: 100
          }}
        >
          <Plus size={28} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
