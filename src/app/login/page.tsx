'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, User, ShieldAlert, Send, CheckCircle2, Clock } from 'lucide-react';
import Image from 'next/image';

type PageMode = 'login' | 'request-access' | 'request-sent';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<PageMode>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Solicitud de acceso
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqMessage, setReqMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error en la autenticación.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/access-requests/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reqName, email: reqEmail, message: reqMessage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setMode('request-sent');
    } catch (err: any) {
      setError(err.message || 'No se pudo enviar la solicitud. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: PageMode) => {
    setMode(newMode);
    setError(null);
    setEmail('');
    setPassword('');
  };

  return (
    <div
      className="app-container"
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: 'radial-gradient(circle at center, #161a22 0%, #0c0e12 100%)',
      }}
    >
      <div
        className="card animate-fade"
        style={{
          maxWidth: '420px',
          width: '100%',
          padding: '3rem 2rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative Top Accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, var(--primary-color), var(--accent-blue))',
          }}
        />

        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Image
            src="/logo_3d.png"
            alt="P&P Construye"
            width={180}
            height={80}
            style={{ objectFit: 'contain', marginBottom: '1rem' }}
          />
          <h1 style={{ fontSize: '1.5rem', color: 'white' }}>
            {mode === 'login' && 'Acceso al Sistema'}
            {mode === 'request-access' && 'Solicitar Acceso'}
            {mode === 'request-sent' && 'Solicitud Enviada'}
          </h1>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>
            Sistema Integrado de Gestión y Control
          </p>
        </div>

        {/* ── MODO: SOLICITUD ENVIADA ── */}
        {mode === 'request-sent' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'rgba(16,185,129,0.1)',
                border: '2px solid var(--success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem auto',
              }}
            >
              <CheckCircle2 size={36} color="var(--success)" />
            </div>
            <h2 style={{ color: 'var(--success)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>
              ¡Solicitud enviada!
            </h2>
            <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              El administrador revisará tu solicitud y te notificará cuándo tu acceso esté listo.
            </p>
            <div
              style={{
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '2rem',
                textAlign: 'left',
              }}
            >
              <Clock size={18} color="var(--primary-color)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                Una vez aprobado, recibirás tus credenciales de acceso a través del administrador.
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => switchMode('login')}
            >
              Volver al inicio de sesión
            </button>
          </div>
        )}

        {/* ── MODO: INICIAR SESIÓN ── */}
        {mode === 'login' && (
          <>
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <ShieldAlert size={16} /> {error}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  Correo Electrónico
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    required
                    className="input-field"
                    style={{ paddingLeft: '3rem' }}
                    placeholder="admin@constructora.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="password"
                    required
                    className="input-field"
                    style={{ paddingLeft: '3rem' }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '1rem', marginTop: '0.5rem' }}
                disabled={loading}
              >
                {loading ? 'Verificando...' : 'Ingresar al Sistema'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textDecoration: 'underline',
                }}
                onClick={() => switchMode('request-access')}
              >
                ¿No tienes acceso? Solicítalo aquí
              </button>
            </div>
          </>
        )}

        {/* ── MODO: SOLICITAR ACCESO ── */}
        {mode === 'request-access' && (
          <>
            {/* Info banner */}
            <div
              style={{
                background: 'rgba(56,189,248,0.06)',
                border: '1px solid rgba(56,189,248,0.2)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                fontSize: '0.82rem',
                color: 'var(--text-main)',
                lineHeight: 1.5,
              }}
            >
              <Clock size={16} color="var(--accent-blue)" style={{ marginTop: '2px', flexShrink: 0 }} />
              El administrador revisará tu solicitud y te enviará las credenciales de acceso cuando sea aprobada.
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <ShieldAlert size={16} /> {error}
              </div>
            )}

            <form
              onSubmit={handleRequestAccess}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  Nombre Completo
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    className="input-field"
                    style={{ paddingLeft: '3rem' }}
                    placeholder="Juan Pérez"
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  Correo Electrónico
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    required
                    className="input-field"
                    style={{ paddingLeft: '3rem' }}
                    placeholder="juan@empresa.com"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  Motivo de la solicitud <span style={{ opacity: 0.5 }}>(opcional)</span>
                </label>
                <textarea
                  className="input-field"
                  style={{ resize: 'none', minHeight: '80px', lineHeight: 1.5, fontFamily: 'inherit' }}
                  placeholder="Ej: Soy el nuevo encargado de obra del proyecto X..."
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '1rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                disabled={loading}
              >
                {loading ? 'Enviando solicitud...' : <><Send size={18} /> Enviar Solicitud de Acceso</>}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textDecoration: 'underline',
                }}
                onClick={() => switchMode('login')}
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
