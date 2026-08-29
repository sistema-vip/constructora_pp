'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, Save, FileText, Calendar, Truck, DollarSign, Package, 
  Plus, Trash2, ChevronDown, ChevronRight, Search, CheckCircle, AlertCircle,
  UserPlus, X 
} from 'lucide-react';
import Link from 'next/link';
import { autoPopulateTrackingTasks } from '@/lib/projectTaskHelper';

// Simple inline currency formatter as fallback if needed, but we try to match existing formatters
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export default function AnteproyectoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [activeTab, setActiveTab] = useState('technical');
  const [error, setError] = useState('');

  // Data state
  const [preProject, setPreProject] = useState<any>(null);
  const [clientsList, setClientsList] = useState<any[]>([]);

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
  
  // Tab states
  const [technical, setTechnical] = useState({
    objective: '',
    scope: '',
    area: '',
    location: '',
    siteConditions: '',
    technicalNotes: ''
  });

  const [dailyPlan, setDailyPlan] = useState<any[]>([]);
  
  const [logistics, setLogistics] = useState({
    transport: '',
    equipment: [''],
    labor: { qualified: 0, helpers: 0 },
    accessNotes: '',
    suppliers: ['']
  });

  const [costStructure, setCostStructure] = useState({
    items: [],
    overhead_pct: 10,
    margin_pct: 25
  });

  const [materials, setMaterials] = useState<any[]>([]);

  // Catalogs
  const [materialsCatalog, setMaterialsCatalog] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    loadMaterialsCatalog();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [preResponse, clientsResponse] = await Promise.all([
        supabase
          .from('pre_projects')
          .select(`
            *,
            clients (id, name)
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('clients')
          .select('id, name')
          .eq('status', 'active')
          .order('name')
      ]);

      if (preResponse.error) throw preResponse.error;
      if (clientsResponse.data) setClientsList(clientsResponse.data);

      const data = preResponse.data;
      setPreProject(data);
      
      if (data.technical_analysis) setTechnical(data.technical_analysis);
      if (data.daily_plan) setDailyPlan(data.daily_plan);
      if (data.logistics) setLogistics(data.logistics);
      if (data.cost_structure) setCostStructure(data.cost_structure);
      if (data.material_calculations) setMaterials(data.material_calculations);
      
    } catch (err: any) {
      console.error('Error loading pre-project:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
        setClientsList(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
        setPreProject((prev: any) => ({
          ...prev,
          client_id: data.id,
          clients: { id: data.id, name: data.name }
        }));
        
        await supabase
          .from('pre_projects')
          .update({ client_id: data.id, updated_at: new Date().toISOString() })
          .eq('id', id);

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

  const handleClientChange = async (newClientId: string) => {
    const selectedClient = clientsList.find(c => c.id === newClientId);
    setPreProject((prev: any) => ({
      ...prev,
      client_id: newClientId || null,
      clients: selectedClient ? { id: selectedClient.id, name: selectedClient.name } : null
    }));

    try {
      await supabase
        .from('pre_projects')
        .update({ client_id: newClientId || null, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (err: any) {
      console.error('Error updating client:', err);
    }
  };

  const loadMaterialsCatalog = async () => {
    try {
      const { data, error } = await supabase.from('materials').select('*');
      if (!error && data) setMaterialsCatalog(data);
    } catch (err) {
      console.error('Error loading materials:', err);
    }
  };

  const handleSave = async (showIndicator = true) => {
    try {
      setSaving(true);
      const updateData = {
        title: preProject.title,
        technical_analysis: technical,
        daily_plan: dailyPlan,
        logistics: logistics,
        cost_structure: costStructure,
        material_calculations: materials,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('pre_projects')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      if (showIndicator) {
        setSaveIndicator(true);
        setTimeout(() => setSaveIndicator(false), 2000);
      }
    } catch (err: any) {
      console.error('Error saving:', err);
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateProposal = async () => {
    try {
      if (!preProject.title) {
        alert('El título es requerido para generar la propuesta.');
        return;
      }

      setSaving(true);
      await handleSave(false);

      // Calc total
      const itemsTotal = costStructure.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
      const overhead = itemsTotal * (costStructure.overhead_pct / 100);
      const margin = itemsTotal * (costStructure.margin_pct / 100);
      const totalInversion = itemsTotal + overhead + margin;

      const totalDays = dailyPlan.length;
      
      const markdown = `Proyecto: ${preProject.title}
Fecha: ${new Date().toLocaleDateString('es-ES')}
Para: ${preProject.clients?.name || 'Cliente'}
Área de Ejecución: ${technical.area || 'No especificada'}

Objetivo del Proyecto
${technical.objective || 'No especificado'}

Fases del Trabajo (Alcance Técnico)
${dailyPlan.map(d => `Día ${d.day}: ${d.tasks.join(', ')}`).join('\n')}

Tiempo de Ejecución y Entrega
${totalDays} días hábiles

Presupuesto de Inversión (A Todo Costo)
Subtotal: ${formatCurrency(itemsTotal)}
Imprevistos (${costStructure.overhead_pct}%): ${formatCurrency(overhead)}
Margen (${costStructure.margin_pct}%): ${formatCurrency(margin)}

INVERSIÓN TOTAL: ${formatCurrency(totalInversion)}

Condiciones y Métodos de Pago
Esquema de Pago: Anticipo del 60% para la adquisición de materiales y movilización; 40% restante al finalizar la obra.
Tasa de Cambio: El presupuesto se mantiene en divisas.`;

      // Insert into projects
      const { data: newProject, error: projError } = await supabase
        .from('projects')
        .insert({
          title: preProject.title,
          client_id: preProject.client_id,
          status: 'proposal',
          description: markdown,
          budget_usd: totalInversion,
          start_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (projError) throw projError;

      // Auto-poblar tareas de seguimiento si las hay
      if (newProject?.id && markdown) {
        autoPopulateTrackingTasks(newProject.id, markdown);
      }

      // Update pre_project
      const { error: preError } = await supabase
        .from('pre_projects')
        .update({
          status: 'converted',
          converted_project_id: newProject.id
        })
        .eq('id', id);

      if (preError) throw preError;

      alert('Propuesta generada con éxito.');
      router.push('/proyectos');

    } catch (err: any) {
      console.error('Error generating proposal:', err);
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('pre_projects')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setPreProject({ ...preProject, status: newStatus });
    } catch (err: any) {
      console.error('Error changing status:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)' }}>Cargando anteproyecto...</div>
      </div>
    );
  }

  if (error || !preProject) {
    return (
      <div style={{ padding: '2rem', color: 'var(--danger)' }}>
        Error: {error || 'Anteproyecto no encontrado'}
      </div>
    );
  }

  // --- Sub-components for tabs ---

  const renderTechnicalTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.3s' }}>
      <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Información General</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Objetivo del Proyecto</label>
            <textarea 
              value={technical.objective}
              onChange={e => setTechnical({...technical, objective: e.target.value})}
              onBlur={() => handleSave(false)}
              rows={3}
              style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Alcance de la Obra</label>
            <textarea 
              value={technical.scope}
              onChange={e => setTechnical({...technical, scope: e.target.value})}
              onBlur={() => handleSave(false)}
              rows={2}
              style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Área de Ejecución</label>
              <input 
                type="text"
                value={technical.area}
                onChange={e => setTechnical({...technical, area: e.target.value})}
                onBlur={() => handleSave(false)}
                placeholder="Ej. 17 m²"
                style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Ubicación</label>
              <input 
                type="text"
                value={technical.location}
                onChange={e => setTechnical({...technical, location: e.target.value})}
                onBlur={() => handleSave(false)}
                style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Condiciones y Observaciones</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Condiciones del Sitio</label>
            <textarea 
              value={technical.siteConditions}
              onChange={e => setTechnical({...technical, siteConditions: e.target.value})}
              onBlur={() => handleSave(false)}
              rows={3}
              placeholder="Observaciones sobre terreno, acceso, etc."
              style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Observaciones Técnicas</label>
            <textarea 
              value={technical.technicalNotes}
              onChange={e => setTechnical({...technical, technicalNotes: e.target.value})}
              onBlur={() => handleSave(false)}
              rows={3}
              style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderDailyPlanTab = () => {
    const addDay = () => {
      const newDay = {
        day: dailyPlan.length + 1,
        date: '',
        tasks: [''],
        materials: [''],
        workers: 1,
        notes: ''
      };
      setDailyPlan([...dailyPlan, newDay]);
    };

    const removeDay = (index: number) => {
      const newPlan = dailyPlan.filter((_, i) => i !== index).map((d, i) => ({ ...d, day: i + 1 }));
      setDailyPlan(newPlan);
      handleSave(false);
    };

    const updateDay = (index: number, field: string, value: any) => {
      const newPlan = [...dailyPlan];
      newPlan[index] = { ...newPlan[index], [field]: value };
      setDailyPlan(newPlan);
    };

    const totalWorkers = dailyPlan.reduce((sum, d) => sum + (Number(d.workers) || 0), 0);
    const avgWorkers = dailyPlan.length > 0 ? Math.round(totalWorkers / dailyPlan.length) : 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-elevated)', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Días</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{dailyPlan.length}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Trabajadores Promedio</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{avgWorkers}</div>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          <div style={{ position: 'absolute', left: '0.5rem', top: 0, bottom: 0, width: '2px', backgroundColor: 'var(--border-color)' }}></div>
          
          {dailyPlan.map((day, idx) => (
            <div key={idx} style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <div style={{ position: 'absolute', left: '-2rem', top: '1.5rem', width: '1rem', height: '1rem', borderRadius: '50%', backgroundColor: 'var(--primary-color)', border: '4px solid var(--bg-primary)' }}></div>
              
              <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Día {day.day}</h4>
                  <button onClick={() => removeDay(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem' }}>
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Fecha (opcional)</label>
                    <input 
                      type="date"
                      value={day.date}
                      onChange={e => updateDay(idx, 'date', e.target.value)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', color: 'white' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Trabajadores</label>
                    <input 
                      type="number"
                      min={0}
                      value={day.workers}
                      onChange={e => updateDay(idx, 'workers', parseInt(e.target.value) || 0)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', color: 'white' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Tareas</label>
                    {day.tasks.map((task: string, tIdx: number) => (
                      <div key={tIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input 
                          type="text"
                          value={task}
                          onChange={e => {
                            const newTasks = [...day.tasks];
                            newTasks[tIdx] = e.target.value;
                            updateDay(idx, 'tasks', newTasks);
                          }}
                          onBlur={() => handleSave(false)}
                          style={{ flex: 1, backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                        />
                        <button 
                          onClick={() => {
                            const newTasks = day.tasks.filter((_: any, i: number) => i !== tIdx);
                            updateDay(idx, 'tasks', newTasks);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => updateDay(idx, 'tasks', [...day.tasks, ''])}
                      style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', padding: '0.25rem 0' }}
                    >
                      <Plus size={14} /> Añadir tarea
                    </button>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Materiales Estimados</label>
                    {day.materials.map((mat: string, mIdx: number) => (
                      <div key={mIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input 
                          type="text"
                          value={mat}
                          onChange={e => {
                            const newMats = [...day.materials];
                            newMats[mIdx] = e.target.value;
                            updateDay(idx, 'materials', newMats);
                          }}
                          onBlur={() => handleSave(false)}
                          style={{ flex: 1, backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                        />
                        <button 
                          onClick={() => {
                            const newMats = day.materials.filter((_: any, i: number) => i !== mIdx);
                            updateDay(idx, 'materials', newMats);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => updateDay(idx, 'materials', [...day.materials, ''])}
                      style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', padding: '0.25rem 0' }}
                    >
                      <Plus size={14} /> Añadir material
                    </button>
                  </div>
                </div>
                
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Notas</label>
                  <textarea 
                    value={day.notes}
                    onChange={e => updateDay(idx, 'notes', e.target.value)}
                    onBlur={() => handleSave(false)}
                    rows={1}
                    style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', color: 'white' }}
                  />
                </div>
              </div>
            </div>
          ))}
          
          <button 
            onClick={addDay}
            style={{ width: '100%', padding: '1rem', backgroundColor: 'var(--surface-color)', border: '1px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> Agregar Día
          </button>
        </div>
      </div>
    );
  };

  const renderLogisticsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.3s' }}>
      <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Logística y Movilización</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Transporte de Materiales</label>
            <textarea 
              value={logistics.transport}
              onChange={e => setLogistics({...logistics, transport: e.target.value})}
              onBlur={() => handleSave(false)}
              rows={2}
              style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Equipos Requeridos</label>
              {logistics.equipment.map((eq: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input 
                    type="text"
                    value={eq}
                    onChange={e => {
                      const newEq = [...logistics.equipment];
                      newEq[idx] = e.target.value;
                      setLogistics({...logistics, equipment: newEq});
                    }}
                    onBlur={() => handleSave(false)}
                    style={{ flex: 1, backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                  />
                  <button 
                    onClick={() => {
                      const newEq = logistics.equipment.filter((_, i) => i !== idx);
                      setLogistics({...logistics, equipment: newEq});
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => setLogistics({...logistics, equipment: [...logistics.equipment, '']})}
                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', padding: '0.25rem 0' }}
              >
                <Plus size={14} /> Añadir equipo
              </button>
            </div>
            
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Proveedores Clave</label>
              {logistics.suppliers.map((sup: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input 
                    type="text"
                    value={sup}
                    onChange={e => {
                      const newSup = [...logistics.suppliers];
                      newSup[idx] = e.target.value;
                      setLogistics({...logistics, suppliers: newSup});
                    }}
                    onBlur={() => handleSave(false)}
                    style={{ flex: 1, backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                  />
                  <button 
                    onClick={() => {
                      const newSup = logistics.suppliers.filter((_, i) => i !== idx);
                      setLogistics({...logistics, suppliers: newSup});
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => setLogistics({...logistics, suppliers: [...logistics.suppliers, '']})}
                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', padding: '0.25rem 0' }}
              >
                <Plus size={14} /> Añadir proveedor
              </button>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Fuerza Laboral Requerida</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Obreros Calificados</span>
                <input 
                  type="number"
                  value={logistics.labor.qualified}
                  onChange={e => setLogistics({...logistics, labor: {...logistics.labor, qualified: parseInt(e.target.value) || 0}})}
                  onBlur={() => handleSave(false)}
                  style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ayudantes</span>
                <input 
                  type="number"
                  value={logistics.labor.helpers}
                  onChange={e => setLogistics({...logistics, labor: {...logistics.labor, helpers: parseInt(e.target.value) || 0}})}
                  onBlur={() => handleSave(false)}
                  style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
                />
              </div>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Notas de Acceso al Sitio</label>
            <textarea 
              value={logistics.accessNotes}
              onChange={e => setLogistics({...logistics, accessNotes: e.target.value})}
              onBlur={() => handleSave(false)}
              rows={2}
              style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderCostTab = () => {
    const addItem = () => {
      setCostStructure({
        ...costStructure,
        items: [...costStructure.items, { category: 'materiales', description: '', quantity: 1, unit_price: 0, total: 0 } as never]
      });
    };

    const updateItem = (index: number, field: string, value: any) => {
      const newItems: any[] = [...costStructure.items];
      newItems[index] = { ...newItems[index], [field]: value };
      
      // Auto-calculate total
      if (field === 'quantity' || field === 'unit_price') {
        newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
      }
      
      setCostStructure({ ...costStructure, items: newItems as never[] });
    };

    const removeItem = (index: number) => {
      const newItems = costStructure.items.filter((_, i) => i !== index);
      setCostStructure({ ...costStructure, items: newItems as never[] });
      handleSave(false);
    };

    const subtotal = costStructure.items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const overhead = subtotal * (costStructure.overhead_pct / 100);
    const margin = subtotal * (costStructure.margin_pct / 100);
    const total = subtotal + overhead + margin;

    const categories = ['materiales', 'mano_de_obra', 'transporte', 'equipos', 'otros'];
    const categoryLabels: Record<string, string> = {
      'materiales': 'Materiales',
      'mano_de_obra': 'Mano de Obra',
      'transporte': 'Transporte',
      'equipos': 'Equipos',
      'otros': 'Otros'
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.3s' }}>
        <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px', overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Desglose de Costos</h3>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Categoría</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Descripción</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Cantidad</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Precio Unit. ($)</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Total ($)</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {costStructure.items.map((item: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem' }}>
                    <select 
                      value={item.category}
                      onChange={e => updateItem(idx, 'category', e.target.value)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    >
                      {categories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="text"
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="number"
                      value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="number"
                      value={item.unit_price}
                      onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                    {formatCurrency(item.total)}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <button 
            onClick={addItem}
            style={{ marginTop: '1rem', background: 'none', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem' }}
          >
            <Plus size={16} /> Agregar Línea
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)' }}>Resumen</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: 'bold' }}>{formatCurrency(subtotal)}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Imprevistos (%):</span>
                <input 
                  type="number"
                  value={costStructure.overhead_pct}
                  onChange={e => {
                    setCostStructure({...costStructure, overhead_pct: parseFloat(e.target.value) || 0});
                  }}
                  onBlur={() => handleSave(false)}
                  style={{ width: '60px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem', color: 'white', textAlign: 'right' }}
                />
              </div>
              <span>{formatCurrency(overhead)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Margen (%):</span>
                <input 
                  type="number"
                  value={costStructure.margin_pct}
                  onChange={e => {
                    setCostStructure({...costStructure, margin_pct: parseFloat(e.target.value) || 0});
                  }}
                  onBlur={() => handleSave(false)}
                  style={{ width: '60px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem', color: 'white', textAlign: 'right' }}
                />
              </div>
              <span>{formatCurrency(margin)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>INVERSIÓN TOTAL:</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMaterialsTab = () => {
    const addMaterial = () => {
      setMaterials([...materials, { material_id: null, name: '', unit: '', quantity: 1, unit_price: 0, total: 0, notes: '' }]);
    };

    const updateMaterial = (index: number, field: string, value: any) => {
      const newMats = [...materials];
      newMats[index] = { ...newMats[index], [field]: value };
      
      if (field === 'quantity' || field === 'unit_price') {
        newMats[index].total = newMats[index].quantity * newMats[index].unit_price;
      }
      
      setMaterials(newMats);
    };

    const removeMaterial = (index: number) => {
      const newMats = materials.filter((_, i) => i !== index);
      setMaterials(newMats);
      handleSave(false);
    };

    const selectFromCatalog = (index: number, catalogItem: any) => {
      const newMats = [...materials];
      newMats[index] = {
        ...newMats[index],
        material_id: catalogItem.id,
        name: catalogItem.name,
        unit: catalogItem.unit,
        unit_price: catalogItem.unit_price,
        total: newMats[index].quantity * catalogItem.unit_price
      };
      setMaterials(newMats);
    };

    const totalMaterials = materials.reduce((sum, m) => sum + (m.total || 0), 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ backgroundColor: 'var(--surface-elevated)', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total de Materiales:</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{formatCurrency(totalMaterials)}</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-elevated)', borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Nombre</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Unidad</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Cantidad</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Precio Unit. ($)</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Total ($)</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Notas</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((mat, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', position: 'relative' }}>
                    <input 
                      type="text"
                      value={mat.name}
                      onChange={e => updateMaterial(idx, 'name', e.target.value)}
                      onBlur={() => handleSave(false)}
                      placeholder="Buscar o escribir..."
                      style={{ width: '100%', minWidth: '200px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                      list={`materials-list-${idx}`}
                    />
                    <datalist id={`materials-list-${idx}`}>
                      {materialsCatalog.map(cat => (
                        <option key={cat.id} value={cat.name} />
                      ))}
                    </datalist>
                    {/* Auto-fill logic on select could be enhanced, but we'll keep it simple: user types, if matches, we update */}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="text"
                      value={mat.unit}
                      onChange={e => updateMaterial(idx, 'unit', e.target.value)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '80px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="number"
                      value={mat.quantity}
                      onChange={e => updateMaterial(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '80px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="number"
                      value={mat.unit_price}
                      onChange={e => updateMaterial(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                    {formatCurrency(mat.total)}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <input 
                      type="text"
                      value={mat.notes}
                      onChange={e => updateMaterial(idx, 'notes', e.target.value)}
                      onBlur={() => handleSave(false)}
                      style={{ width: '100%', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', color: 'white' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <button onClick={() => removeMaterial(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <button 
            onClick={addMaterial}
            style={{ marginTop: '1rem', background: 'none', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem' }}
          >
            <Plus size={16} /> Agregar Material
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link href="/anteproyecto" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '1rem', fontSize: '0.9rem' }}>
            <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Volver a Anteproyectos
          </Link>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              value={preProject.title || ''} 
              onChange={e => setPreProject({...preProject, title: e.target.value})}
              onBlur={() => handleSave(false)}
              style={{ fontSize: '1.8rem', fontWeight: 'bold', backgroundColor: 'transparent', border: 'none', color: 'white', outline: 'none', padding: 0, margin: 0, minWidth: '320px', borderBottom: '1px dashed transparent' }}
              placeholder="Título del Anteproyecto"
            />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <select
                value={preProject.client_id || ''}
                onChange={e => handleClientChange(e.target.value)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--surface-color)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Sin Cliente Asignado --</option>
                {clientsList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowNewClientModal(true)}
                title="Registrar Nuevo Cliente"
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid var(--primary-color)',
                  color: 'var(--primary-color)',
                  borderRadius: '999px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontWeight: '600'
                }}
              >
                <UserPlus size={14} /> + Cliente
              </button>
            </div>

            <select 
              value={preProject.status}
              onChange={e => handleStatusChange(e.target.value)}
              style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', fontSize: '0.85rem', backgroundColor: 
                preProject.status === 'ready' ? 'rgba(16, 185, 129, 0.15)' : 
                preProject.status === 'converted' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: 
                preProject.status === 'ready' ? 'var(--success)' : 
                preProject.status === 'converted' ? 'var(--accent-blue)' : 'var(--primary-color)',
                border: 'none', cursor: 'pointer', outline: 'none', fontWeight: '600'
              }}
            >
              <option value="draft">Borrador</option>
              <option value="ready">Listo</option>
              <option value="converted" disabled>Convertido</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {saveIndicator && <span style={{ color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={14} /> Guardado</span>}
          <button 
            onClick={() => handleSave(true)}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'white', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
          </button>

          {preProject.status !== 'converted' && (
            <button 
              onClick={handleGenerateProposal}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'var(--primary-color)', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              Generar Propuesta
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', overflowX: 'auto' }}>
        {[
          { id: 'technical', label: 'Análisis Técnico', icon: <FileText size={16} /> },
          { id: 'daily', label: 'Planificación Día a Día', icon: <Calendar size={16} /> },
          { id: 'logistics', label: 'Logística', icon: <Truck size={16} /> },
          { id: 'cost', label: 'Estructura de Costos', icon: <DollarSign size={16} /> },
          { id: 'materials', label: 'Cálculo de Materiales', icon: <Package size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '1rem 1.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary-color)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'technical' && renderTechnicalTab()}
        {activeTab === 'daily' && renderDailyPlanTab()}
        {activeTab === 'logistics' && renderLogisticsTab()}
        {activeTab === 'cost' && renderCostTab()}
        {activeTab === 'materials' && renderMaterialsTab()}
      </div>

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
