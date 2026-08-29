'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  UserPlus,
  Phone,
  Mail,
  Briefcase,
  ChevronRight,
  Lock,
  Edit3,
  Trash2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Building,
  MapPin,
  X,
  Loader2,
  FileText
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useAdminAction } from '@/lib/useAdminAction';

export default function ClientesPage() {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = useAdminAction();
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Estado para creación de cliente
  const [newClient, setNewClient] = useState({
    name: '',
    company_name: '',
    tax_id: '',
    phone: '',
    email: '',
    address: ''
  });

  // Estado para edición de cliente
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState<{
    id: string;
    name: string;
    company_name: string;
    tax_id: string;
    phone: string;
    email: string;
    address: string;
    status: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Estado para eliminación de cliente con validación de pendientes
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any | null>(null);
  const [checkingPending, setCheckingPending] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<{
    hasPending: boolean;
    proposalsCount: number;
    activeProjectsCount: number;
    historyProjectsCount: number;
    paymentsCount: number;
    costsCount: number;
    commitmentsCount: number;
    pendingTelegramCount: number;
    projectTitles: string[];
  } | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching clients:', error.message);
      alert(`Error al cargar clientes: ${error.message}`);
    } else if (data) {
      setClients(data);
    }
    setLoading(false);
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();

    if (!canCreate) {
      alert('❌ Solo administradores pueden crear clientes');
      return;
    }

    const { data, error } = await supabase
      .from('clients')
      .insert([{ id: uuidv4(), ...newClient }])
      .select();

    if (!error && data) {
      setClients([data[0], ...clients]);
      setShowModal(false);
      setNewClient({ name: '', company_name: '', tax_id: '', phone: '', email: '', address: '' });
    } else {
      console.error('Error saving client:', error);
      alert(`Error al guardar el cliente: ${error?.message || 'Error desconocido'}`);
    }
  }

  // Iniciar edición de cliente
  function handleOpenEdit(client: any) {
    if (!canEdit) {
      alert('❌ Solo administradores pueden editar clientes.');
      return;
    }
    setEditingClient({
      id: client.id,
      name: client.name || '',
      company_name: client.company_name || '',
      tax_id: client.tax_id || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      status: client.status || 'active'
    });
    setShowEditModal(true);
  }

  // Guardar edición de cliente
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingClient || !canEdit) return;

    setSavingEdit(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .update({
          name: editingClient.name.trim(),
          company_name: editingClient.company_name.trim() || null,
          tax_id: editingClient.tax_id.trim() || null,
          phone: editingClient.phone.trim() || null,
          email: editingClient.email.trim() || null,
          address: editingClient.address.trim() || null,
          status: editingClient.status || 'active'
        })
        .eq('id', editingClient.id)
        .select()
        .single();

      if (error) throw error;

      setClients(clients.map(c => c.id === editingClient.id ? data : c));
      setShowEditModal(false);
      setEditingClient(null);
    } catch (err: any) {
      console.error('Error updating client:', err);
      alert(`Error al actualizar el cliente: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  // Iniciar proceso de eliminación con verificación de pendientes
  async function handleInitiateDelete(client: any) {
    if (!canDelete) {
      alert('❌ Solo administradores pueden eliminar clientes.');
      return;
    }

    setClientToDelete(client);
    setShowDeleteModal(true);
    setCheckingPending(true);
    setPendingSummary(null);

    try {
      // 1. Consultar todos los proyectos vinculados al cliente y sus registros hijos
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select(`
          id,
          title,
          status,
          proposal_number,
          project_payments(id),
          project_costs(id),
          project_commitments(id)
        `)
        .eq('client_id', client.id);

      if (projErr) throw projErr;

      const projects = projectsData || [];
      const projectIds = projects.map(p => p.id);

      // 2. Consultar registros de Telegram pendientes
      let pendingTelegramCount = 0;
      if (projectIds.length > 0) {
        const { count } = await supabase
          .from('telegram_pending_entries')
          .select('*', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .eq('status', 'pending');
        pendingTelegramCount = count || 0;
      }

      // 3. Categorizar y totalizar asuntos pendientes
      const proposals = projects.filter(p => p.status === 'proposal');
      const activeProjects = projects.filter(p => p.status === 'in_progress');
      const historyProjects = projects.filter(p => p.status === 'completed' || p.status === 'cancelled');
      
      const paymentsCount = projects.reduce((acc, p) => acc + (p.project_payments?.length || 0), 0);
      const costsCount = projects.reduce((acc, p) => acc + (p.project_costs?.length || 0), 0);
      const commitmentsCount = projects.reduce((acc, p) => acc + (p.project_commitments?.length || 0), 0);

      const hasPending = projects.length > 0 || pendingTelegramCount > 0;

      setPendingSummary({
        hasPending,
        proposalsCount: proposals.length,
        activeProjectsCount: activeProjects.length,
        historyProjectsCount: historyProjects.length,
        paymentsCount,
        costsCount,
        commitmentsCount,
        pendingTelegramCount,
        projectTitles: projects.map(p => p.title)
      });
    } catch (err: any) {
      console.error('Error checking client pending matters:', err);
      alert(`Error al verificar registros asociados: ${err.message}`);
      setShowDeleteModal(false);
      setClientToDelete(null);
    } finally {
      setCheckingPending(false);
    }
  }

  // Confirmar eliminación (solo si no tiene pendientes)
  async function handleConfirmDelete() {
    if (!clientToDelete || !canDelete || pendingSummary?.hasPending) return;

    setDeletingClient(true);
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete.id);

      if (error) throw error;

      setClients(clients.filter(c => c.id !== clientToDelete.id));
      setShowDeleteModal(false);
      setClientToDelete(null);
    } catch (err: any) {
      console.error('Error deleting client:', err);
      alert(`Error al eliminar cliente: ${err.message}`);
    } finally {
      setDeletingClient(false);
    }
  }

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.tax_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ position: 'relative', width: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, empresa, RIF o teléfono..."
            className="input-field"
            style={{ paddingLeft: '3rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {canCreate ? (
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <UserPlus size={20} /> Nuevo Cliente
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <Lock size={16} /> Solo administrador puede crear
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>CLIENTE / EMPRESA</th>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>CONTACTO / DIRECCIÓN</th>
              <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>ESTADO</th>
              <th style={{ textAlign: 'center', padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', width: '380px' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center' }}>Cargando clientes...</td></tr>
            ) : filteredClients.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron clientes.</td></tr>
            ) : (
              filteredClients.map((client) => (
                <tr key={client.id} className="table-row">
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontWeight: '600', color: 'white', fontSize: '1rem' }}>{client.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <Briefcase size={12} /> {client.company_name || 'Particular'}
                      {client.tax_id && <span style={{ marginLeft: '0.5rem', color: 'var(--accent-blue)' }}>• {client.tax_id}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <Phone size={13} className="text-muted" /> {client.phone || '---'}
                    </div>
                    <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <Mail size={13} className="text-muted" /> {client.email || '---'}
                    </div>
                    {client.address && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <MapPin size={12} /> {client.address.length > 45 ? `${client.address.substring(0, 45)}...` : client.address}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <span className={`badge ${client.status === 'active' ? 'badge-active' : 'badge-danger'}`}>
                      {client.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button 
                        className="btn-secondary"
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary-color)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                        onClick={() => router.push(`/clientes/${client.id}`)}
                        title="Ver Estado de Cuenta y Proyectos"
                      >
                        <Briefcase size={13} /> Estado de Cuenta <ChevronRight size={13} />
                      </button>

                      {canEdit && (
                        <button 
                          className="btn-secondary"
                          style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent-blue)', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                          onClick={() => handleOpenEdit(client)}
                          title="Editar Datos del Cliente"
                        >
                          <Edit3 size={13} /> Editar
                        </button>
                      )}

                      {canDelete && (
                        <button 
                          className="btn-secondary"
                          style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          onClick={() => handleInitiateDelete(client)}
                          title="Eliminar Cliente"
                        >
                          <Trash2 size={13} /> Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nuevo Cliente */}
      {showModal && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Registrar Nuevo Cliente</h2>
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddClient} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Nombre Completo *</label>
                <input 
                  required
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. Juan Pérez"
                  value={newClient.name} 
                  onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Empresa</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. Inversiones JP C.A."
                  value={newClient.company_name} 
                  onChange={(e) => setNewClient({...newClient, company_name: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>RIF / CI</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. J-12345678-9 o V-12345678"
                  value={newClient.tax_id} 
                  onChange={(e) => setNewClient({...newClient, tax_id: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Teléfono</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. +58 412-1234567"
                  value={newClient.phone} 
                  onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Email</label>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="cliente@ejemplo.com"
                  value={newClient.email} 
                  onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Dirección</label>
                <textarea 
                  className="input-field" 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Dirección fiscal o residencial..."
                  value={newClient.address} 
                  onChange={(e) => setNewClient({...newClient, address: e.target.value})}
                ></textarea>
              </div>
              
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Guardar Cliente</button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Cliente */}
      {showEditModal && editingClient && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} color="var(--accent-blue)" /> Editar Cliente
              </h2>
              <button 
                type="button" 
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Nombre Completo *</label>
                <input 
                  required
                  type="text" 
                  className="input-field" 
                  value={editingClient.name} 
                  onChange={(e) => setEditingClient({...editingClient, name: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Empresa</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editingClient.company_name} 
                  onChange={(e) => setEditingClient({...editingClient, company_name: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>RIF / CI</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editingClient.tax_id} 
                  onChange={(e) => setEditingClient({...editingClient, tax_id: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Teléfono</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editingClient.phone} 
                  onChange={(e) => setEditingClient({...editingClient, phone: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Email</label>
                <input 
                  type="email" 
                  className="input-field" 
                  value={editingClient.email} 
                  onChange={(e) => setEditingClient({...editingClient, email: e.target.value})}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Estado del Cliente</label>
                <select
                  className="input-field"
                  value={editingClient.status}
                  onChange={(e) => setEditingClient({...editingClient, status: e.target.value})}
                  style={{ background: 'var(--surface-elevated)', color: 'white' }}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>Dirección</label>
                <textarea 
                  className="input-field" 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={editingClient.address} 
                  onChange={(e) => setEditingClient({...editingClient, address: e.target.value})}
                ></textarea>
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                  disabled={savingEdit}
                >
                  {savingEdit ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : 'Guardar Cambios'}
                </button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => setShowEditModal(false)}
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Eliminación con Validación de Pendientes */}
      {showDeleteModal && clientToDelete && (
        <div className="modal-overlay">
          <div className="card modal-content animate-fade" style={{ maxWidth: '520px' }}>
            {checkingPending ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--primary-color)' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>Verificando registros del cliente...</h3>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>Comprobando si existen propuestas, obras o gastos vinculados.</p>
              </div>
            ) : pendingSummary?.hasPending ? (
              // CASO BLOQUEADO: TIENE ASUNTOS PENDIENTES
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', color: 'var(--danger)' }}>
                  <AlertTriangle size={28} />
                  <h3 style={{ margin: 0, color: 'var(--danger)' }}>No se puede eliminar el cliente</h3>
                </div>

                <p style={{ fontSize: '0.95rem', color: 'white', marginBottom: '1rem' }}>
                  El cliente <strong>{clientToDelete.name}</strong> tiene registros activos o asuntos pendientes en el sistema:
                </p>

                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                    {pendingSummary.activeProjectsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5' }}>
                        • <strong>{pendingSummary.activeProjectsCount}</strong> Obras / Proyectos en ejecución
                      </li>
                    )}
                    {pendingSummary.proposalsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fde047' }}>
                        • <strong>{pendingSummary.proposalsCount}</strong> Propuesta(s) pendiente(s)
                      </li>
                    )}
                    {pendingSummary.historyProjectsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1' }}>
                        • <strong>{pendingSummary.historyProjectsCount}</strong> Obra(s) completada(s) / archivada(s)
                      </li>
                    )}
                    {pendingSummary.paymentsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#86efac' }}>
                        • <strong>{pendingSummary.paymentsCount}</strong> Pagos / Abonos registrados
                      </li>
                    )}
                    {pendingSummary.costsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5' }}>
                        • <strong>{pendingSummary.costsCount}</strong> Gastos de obra registrados
                      </li>
                    )}
                    {pendingSummary.commitmentsCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fde047' }}>
                        • <strong>{pendingSummary.commitmentsCount}</strong> Cuentas por pagar vinculadas
                      </li>
                    )}
                    {pendingSummary.pendingTelegramCount > 0 && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fde047' }}>
                        • <strong>{pendingSummary.pendingTelegramCount}</strong> Entradas pendientes por aprobar desde Telegram
                      </li>
                    )}
                  </ul>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  💡 <strong>¿Por qué está protegido?</strong> Para preservar la trazabilidad contable y evitar inconsistencias financieras, un cliente con propuestas o proyectos no puede eliminarse directamente. Si ya no requiere al cliente, puede cambiar su estado a <strong>Inactivo</strong> o eliminar previamente sus proyectos asociados.
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ minWidth: '130px' }}
                    onClick={() => { setShowDeleteModal(false); setClientToDelete(null); }}
                  >
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              // CASO PERMITIDO: NO TIENE NINGÚN ASUNTO PENDIENTE
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', color: 'var(--danger)' }}>
                  <Trash2 size={28} />
                  <h3 style={{ margin: 0, color: 'var(--danger)' }}>Confirmar Eliminación</h3>
                </div>

                <p style={{ fontSize: '0.95rem', color: 'white', marginBottom: '0.75rem' }}>
                  ¿Estás seguro de que deseas eliminar permanentemente al cliente <strong>{clientToDelete.name}</strong>?
                </p>

                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#86efac' }}>
                  <CheckCircle2 size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.4rem' }} />
                  Verificación completada: Este cliente no tiene propuestas, obras ni gastos pendientes asociados.
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Esta acción es irreversible y removerá la ficha del cliente del sistema.
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => { setShowDeleteModal(false); setClientToDelete(null); }}
                    disabled={deletingClient}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={handleConfirmDelete}
                    disabled={deletingClient}
                  >
                    {deletingClient ? <><Loader2 size={16} className="animate-spin" /> Eliminando...</> : <><Trash2 size={16} /> Eliminar Cliente</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

