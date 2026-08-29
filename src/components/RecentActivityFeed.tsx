'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Edit, Trash2, Activity, ArrowRight, Filter } from 'lucide-react';
import Link from 'next/link';

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string;
  action: string;
  entity: string;
  entity_id: string;
  old_data: any;
  new_data: any;
  profiles: {
    name: string;
  } | null;
}

interface RecentActivityFeedProps {
  maxItems?: number;
}

export default function RecentActivityFeed({ maxItems = 15 }: RecentActivityFeedProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('Todos');

  useEffect(() => {
    fetchLogs();
  }, [maxItems]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, profiles(name)')
        .order('created_at', { ascending: false })
        .limit(maxItems);

      if (error) throw error;
      setLogs(data as AuditLog[]);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionDetails = (entity: string, action: string) => {
    const key = `${entity}_${action}`;
    switch (key) {
      case 'project_costs_INSERT': return 'registró un gasto';
      case 'project_costs_UPDATE': return 'modificó un gasto';
      case 'project_costs_DELETE': return 'eliminó un gasto';
      case 'project_payments_INSERT': return 'registró un pago';
      case 'project_payments_UPDATE': return 'modificó un pago';
      case 'project_payments_DELETE': return 'eliminó un pago';
      case 'projects_INSERT': return 'creó un proyecto/propuesta';
      case 'projects_UPDATE': return 'modificó un proyecto';
      case 'projects_DELETE': return 'eliminó un proyecto';
      case 'clients_INSERT': return 'registró un cliente';
      case 'clients_UPDATE': return 'modificó un cliente';
      case 'project_commitments_INSERT': return 'registró un compromiso';
      case 'partner_advances_INSERT': return 'registró un retiro de socio';
      case 'project_extras_INSERT': return 'registró un adicional';
      default: return `${action} en ${entity}`;
    }
  };

  const getIcon = (action: string) => {
    switch (action) {
      case 'INSERT':
        return (
          <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16} />
          </div>
        );
      case 'UPDATE':
        return (
          <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Edit size={16} />
          </div>
        );
      case 'DELETE':
        return (
          <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={16} />
          </div>
        );
      default:
        return (
          <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'rgba(156, 163, 175, 0.1)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={16} />
          </div>
        );
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    const date = new Date(dateString);
    const now = new Date();
    
    const diffInMilliseconds = date.getTime() - now.getTime();
    const diffInSeconds = Math.round(diffInMilliseconds / 1000);
    const MathAbsSeconds = Math.abs(diffInSeconds);

    if (MathAbsSeconds < 60) {
      return rtf.format(diffInSeconds, 'second');
    }
    
    const diffInMinutes = Math.round(diffInSeconds / 60);
    const MathAbsMinutes = Math.abs(diffInMinutes);
    if (MathAbsMinutes < 60) {
      return rtf.format(diffInMinutes, 'minute');
    }

    const diffInHours = Math.round(diffInMinutes / 60);
    const MathAbsHours = Math.abs(diffInHours);
    if (MathAbsHours < 24) {
      return rtf.format(diffInHours, 'hour');
    }

    const diffInDays = Math.round(diffInHours / 24);
    return rtf.format(diffInDays, 'day');
  };

  const extractDetailText = (log: AuditLog) => {
    const data = log.new_data || log.old_data || {};
    let textParts = [];

    if (data.description) textParts.push(data.description);
    else if (data.title) textParts.push(data.title);
    else if (data.name) textParts.push(data.name);
    
    if (data.project_title) textParts.push(`(Proyecto: ${data.project_title})`);
    else if (data.proposal_number) textParts.push(`(Propuesta: ${data.proposal_number})`);
    
    return textParts.join(' ');
  };

  const filters = [
    { label: 'Todos', entity: null },
    { label: 'Gastos', entity: 'project_costs' },
    { label: 'Pagos', entity: 'project_payments' },
    { label: 'Proyectos', entity: 'projects' },
    { label: 'Clientes', entity: 'clients' },
  ];

  const activeFilterEntity = filters.find(f => f.label === activeFilter)?.entity;
  
  const filteredLogs = activeFilterEntity 
    ? logs.filter(log => log.entity === activeFilterEntity)
    : logs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade">
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <Filter size={16} style={{ color: 'var(--text-muted)', alignSelf: 'center', marginRight: '0.25rem' }} />
        {filters.map(filter => (
          <button
            key={filter.label}
            onClick={() => setActiveFilter(filter.label)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 500,
              backgroundColor: activeFilter === filter.label ? 'var(--accent-blue)' : 'transparent',
              color: activeFilter === filter.label ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${activeFilter === filter.label ? 'var(--accent-blue)' : 'var(--border-color)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Cargando actividad...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No hay actividad reciente para mostrar.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div 
              key={log.id} 
              style={{ 
                display: 'flex', 
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: '0.75rem 0',
                borderBottom: '1px solid var(--border-color)',
                gap: '1rem'
              }}
            >
              <div style={{ flexShrink: 0 }}>
                {getIcon(log.action)}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                  <span style={{ fontWeight: 600 }}>{log.profiles?.name || 'Sistema'}</span>
                  {' '}
                  <span style={{ color: 'var(--text-muted)' }}>{getActionDetails(log.entity, log.action)}</span>
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {extractDetailText(log)}
                </p>
              </div>
              
              <div style={{ flexShrink: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {formatRelativeTime(log.created_at)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Link */}
      <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <Link href="/auditoria" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          fontSize: '0.9rem', 
          color: 'var(--accent-blue)', 
          textDecoration: 'none',
          fontWeight: 500
        }}>
          Ver auditoría completa <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
