'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  ChevronRight, 
  Plus, 
  MessageSquare
} from 'lucide-react';

interface MobileClientsViewProps {
  clients: any[];
  loading: boolean;
  onNewClient?: () => void;
  canCreate?: boolean;
}

export default function MobileClientsView({
  clients,
  loading,
  onNewClient,
  canCreate = true
}: MobileClientsViewProps) {
  const [search, setSearch] = useState('');

  const filtered = clients.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mobile-view-root" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.35rem 0' }}>
          Clientes 👥
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
          {filtered.length} clientes registrados
        </p>
      </div>

      {/* Buscador táctil */}
      <div style={{
        position: 'relative',
        marginBottom: '1rem'
      }}>
        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder="Buscar cliente por nombre, empresa o tlf..."
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

      {/* Lista de Tarjetas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
          Cargando clientes...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          backgroundColor: '#161a22',
          borderRadius: '16px',
          padding: '2.5rem 1rem',
          textAlign: 'center',
          border: '1px dashed rgba(255, 255, 255, 0.15)'
        }}>
          <Users size={36} color="#94a3b8" style={{ margin: '0 auto 0.6rem auto' }} />
          <p style={{ margin: 0, color: '#f8fafc', fontWeight: 600 }}>No hay clientes encontrados</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map(c => {
            const cleanPhone = c.phone?.replace(/[^\d]/g, '') || '';
            const waPhone = cleanPhone.startsWith('0') ? '58' + cleanPhone.substring(1) : cleanPhone;

            return (
              <div
                key={c.id}
                style={{
                  backgroundColor: '#161a22',
                  borderRadius: '16px',
                  padding: '1.1rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                      {c.name}
                    </h3>
                    {c.company_name && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Building size={13} /> {c.company_name}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/clientes/${c.id}`}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary-color)',
                      textDecoration: 'none'
                    }}
                  >
                    <ChevronRight size={18} />
                  </Link>
                </div>

                {/* Detalles de contacto con botones táctiles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: '#94a3b8' }}>
                  {c.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Phone size={14} color="#10b981" /> {c.phone}
                      </span>
                      {waPhone && (
                        <a
                          href={`https://wa.me/${waPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '0.75rem',
                            color: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            textDecoration: 'none',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <MessageSquare size={12} /> WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  {c.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Mail size={14} color="#38bdf8" /> {c.email}
                    </div>
                  )}

                  {c.address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <MapPin size={14} color="#f59e0b" /> {c.address}
                    </div>
                  )}
                </div>

                {/* Botón ver expediente */}
                <Link
                  href={`/clientes/${c.id}`}
                  style={{
                    marginTop: '0.85rem',
                    paddingTop: '0.65rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: 'var(--primary-color)',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  <span>Ver Obras y Expediente</span>
                  <ChevronRight size={15} />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button para nuevo cliente */}
      {canCreate && onNewClient && (
        <button
          onClick={onNewClient}
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
