'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ClipboardList, Plus, Search, Copy, Trash2, Edit3, Calendar, X, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AnteproyectosPage() {
  const router = useRouter();
  const [preProjects, setPreProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', client_id: '' });
  const [filter, setFilter] = useState<'all' | 'draft' | 'ready' | 'converted'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para creación rápida de cliente
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    company_name: '',
    tax_id: '',
    phone: '',
    email: '',
    address: ''
  });
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name.trim()) return;

    setSavingClient(true);
    try {
      const insertPayload: any = {
        name: newClient.name.trim(),
        company_name: newClient.company_name.trim() || null,
        tax_id: newClient.tax_id.trim() || null,
        phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null,
        address: newClient.address.trim() || null,
        status: 'active'
      };

      const { data, error } = await supabase
        .from('clients')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setClients(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
        setNewForm(prev => ({ ...prev, client_id: data.id }));
        setShowNewClientModal(false);
        setNewClient({ name: '', company_name: '', tax_id: '', phone: '', email: '', address: '' });
      }
    } catch (err: any) {
      console.error('Error creating client:', err);
      alert(`Error al crear cliente: ${err.message}`);
    } finally {
      setSavingClient(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [preProjectsResponse, clientsResponse] = await Promise.all([
        supabase
          .from('pre_projects')
          .select('*, clients(name)')
          .order('updated_at', { ascending: false }),
        supabase
          .from('clients')
          .select('id, name')
          .eq('status', 'active')
          .order('name')
      ]);

      if (preProjectsResponse.error) throw preProjectsResponse.error;
      if (clientsResponse.error) throw clientsResponse.error;

      setPreProjects(preProjectsResponse.data || []);
      setClients(clientsResponse.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.title.trim()) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('pre_projects')
        .insert([{
          title: newForm.title,
          client_id: newForm.client_id || null,
          status: 'draft',
        }])
        .select()
        .single();

      if (error) throw error;

      setShowNewModal(false);
      router.push(`/anteproyecto/${data.id}`);
    } catch (error) {
      console.error('Error creating pre-project:', error);
      alert('Error al crear el anteproyecto');
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Está seguro de que desea eliminar este anteproyecto? Esta acción no se puede deshacer.')) return;

    try {
      const { error } = await supabase
        .from('pre_projects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setPreProjects(preProjects.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting pre-project:', error);
      alert('Error al eliminar el anteproyecto');
    }
  };

  const handleDuplicate = async (project: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newProject = {
        title: `${project.title} (copia)`,
        client_id: project.client_id,
        status: 'draft',
        technical_analysis: project.technical_analysis,
        daily_plan: project.daily_plan,
        logistics: project.logistics,
        cost_structure: project.cost_structure,
        material_calculations: project.material_calculations,
        notes: project.notes
      };

      const { data, error } = await supabase
        .from('pre_projects')
        .insert([newProject])
        .select('*, clients(name)')
        .single();

      if (error) throw error;
      setPreProjects([data, ...preProjects]);
    } catch (error) {
      console.error('Error duplicating pre-project:', error);
      alert('Error al duplicar el anteproyecto');
    }
  };

  const filteredProjects = preProjects.filter(p => {
    const matchesFilter = filter === 'all' || p.status === filter;
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (p.clients?.name && p.clients.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getStatusConfig = (status: string) => {
    switch(status) {
      case 'draft': return { label: 'Borrador', color: 'var(--primary-color)', bg: 'rgba(217, 119, 6, 0.1)' };
      case 'ready': return { label: 'Listo', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)' };
      case 'converted': return { label: 'Convertido', color: 'var(--accent-blue)', bg: 'rgba(59, 130, 246, 0.1)' };
      default: return { label: status, color: 'var(--text-muted)', bg: 'var(--bg-secondary)' };
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    }).format(date);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh' }} className="animate-fade">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0 0 0.5rem 0' }}>
            <ClipboardList size={32} style={{ color: 'var(--primary-color)' }} />
            Anteproyectos
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1.1rem' }}>
            Planificación técnica y preparación de propuestas
          </p>
        </div>
        <button 
          onClick={() => setShowNewModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: 'var(--primary-color)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'opacity 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
        >
          <Plus size={20} />
          Nuevo Anteproyecto
        </button>
      </div>

      {/* Filters and Search */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'draft', label: 'Borradores' },
            { id: 'ready', label: 'Listos' },
            { id: 'converted', label: 'Convertidos' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                border: filter === f.id ? `1px solid var(--primary-color)` : '1px solid var(--border-color)',
                backgroundColor: filter === f.id ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                color: filter === f.id ? 'var(--primary-color)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar anteproyectos..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              backgroundColor: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-main)',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : preProjects.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '4rem 2rem', 
          backgroundColor: 'var(--surface-elevated)', 
          borderRadius: '16px',
          border: '1px dashed var(--border-color)'
        }}>
          <ClipboardList size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto', opacity: 0.5 }} />
          <h3 style={{ color: 'var(--text-main)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>No hay anteproyectos</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Comienza creando tu primer anteproyecto para planificar un nuevo proyecto.</p>
          <button 
            onClick={() => setShowNewModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'transparent',
              color: 'var(--primary-color)',
              border: '1px solid var(--primary-color)',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Crear primer anteproyecto
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No se encontraron resultados para los filtros actuales.
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
          gap: '1.5rem' 
        }}>
          {filteredProjects.map(project => {
            const statusCfg = getStatusConfig(project.status);
            return (
              <div 
                key={project.id}
                onClick={() => router.push(`/anteproyecto/${project.id}`)}
                className="card"
                style={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.25rem', fontWeight: 'bold', paddingRight: '1rem' }}>
                    {project.title}
                  </h3>
                  <span style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem', 
                    fontWeight: '600',
                    backgroundColor: statusCfg.bg,
                    color: statusCfg.color,
                    whiteSpace: 'nowrap'
                  }}>
                    {statusCfg.label}
                  </span>
                </div>

                {/* Card Body */}
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: '500' }}>Cliente:</span> {project.clients?.name || 'Sin asignar'}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Calendar size={14} />
                    Actualizado: {formatDate(project.updated_at || project.created_at)}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: '0.5rem',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '1rem',
                  marginTop: 'auto'
                }}>
                  <button 
                    onClick={(e) => handleDuplicate(project, e)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                    title="Duplicar"
                  >
                    <Copy size={18} />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(project.id, e)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/anteproyecto/${project.id}`);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                    title="Editar"
                  >
                    <Edit3 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showNewModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '2rem',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem' }}>Nuevo Anteproyecto</h2>
              <button 
                onClick={() => setShowNewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  Título del anteproyecto *
                </label>
                <input
                  type="text"
                  required
                  value={newForm.title}
                  onChange={(e) => setNewForm({...newForm, title: e.target.value})}
                  placeholder="Ej. Remodelación Oficina Principal"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Cliente (Opcional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewClientModal(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-color)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontWeight: '600'
                    }}
                  >
                    <UserPlus size={15} /> + Nuevo Cliente
                  </button>
                </div>
                <select
                  value={newForm.client_id}
                  onChange={(e) => setNewForm({...newForm, client_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    appearance: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">-- Seleccionar cliente --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newForm.title.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: (isSubmitting || !newForm.title.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (isSubmitting || !newForm.title.trim()) ? 0.7 : 1
                  }}
                >
                  {isSubmitting ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar Nuevo Cliente */}
      {showNewClientModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '2rem',
            width: '100%',
            maxWidth: '550px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={22} style={{ color: 'var(--primary-color)' }} />
                Registrar Nuevo Cliente
              </h2>
              <button 
                type="button" 
                onClick={() => setShowNewClientModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleCreateClient} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                  Nombre Completo *
                </label>
                <input 
                  required
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. Juan Pérez"
                  value={newClient.name} 
                  onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                  Empresa
                </label>
                <input 
                  type="text" 
                  placeholder="Ej. Inversiones JP C.A."
                  value={newClient.company_name} 
                  onChange={(e) => setNewClient({...newClient, company_name: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                  RIF / CI
                </label>
                <input 
                  type="text" 
                  placeholder="Ej. J-12345678-9 o V-12345678"
                  value={newClient.tax_id} 
                  onChange={(e) => setNewClient({...newClient, tax_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                  Teléfono
                </label>
                <input 
                  type="text" 
                  placeholder="Ej. +58 412-1234567"
                  value={newClient.phone} 
                  onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                  Email
                </label>
                <input 
                  type="email" 
                  placeholder="cliente@ejemplo.com"
                  value={newClient.email} 
                  onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                  Dirección
                </label>
                <textarea 
                  style={{ 
                    width: '100%',
                    minHeight: '70px', 
                    resize: 'vertical',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Dirección fiscal o residencial..."
                  value={newClient.address} 
                  onChange={(e) => setNewClient({...newClient, address: e.target.value})}
                ></textarea>
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  style={{ 
                    flex: 1, 
                    padding: '0.75rem 1rem',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowNewClientModal(false)}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={savingClient || !newClient.name.trim()}
                  style={{ 
                    flex: 1, 
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: (savingClient || !newClient.name.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (savingClient || !newClient.name.trim()) ? 0.7 : 1
                  }}
                >
                  {savingClient ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
