'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Users, HardHat, Wallet, LayoutDashboard,
  Settings, PlusCircle, Package, LogOut, ShieldCheck, TrendingUp, ClipboardList
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NewProposalModal from '@/components/NewProposalModal';
import FloatingAssistant from '@/components/FloatingAssistant';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { UserProvider, useUser } from '@/lib/UserContext';
import { supabase } from '@/lib/supabase';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { role, user, loading: userLoading } = useUser();

  useEffect(() => {
    if (!userLoading && !user && pathname !== '/login') {
      router.push('/login');
    } else if (!userLoading && user && pathname === '/login') {
      router.push('/');
    }
  }, [user, userLoading, pathname, router]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
    router.push('/login');
  }

  function handleNewProposal() {
    setModalOpen(true);
  }

  function handleOpenAI() {
    if (typeof window !== 'undefined' && (window as any).__openProposalAssistant) {
      (window as any).__openProposalAssistant();
    }
  }

  if (!user && !userLoading && pathname !== '/login') {
    return null; // El useEffect se encargará de la redirección
  }

  if (!user || pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="app-container">
      {/* SIDEBAR — only visible on desktop (hidden via CSS on mobile) */}
      <aside className="sidebar hide-on-print">
        <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <Image src="/logo_3d.png" alt="P&P CONSTRUYE" width={160} height={80} style={{ objectFit: 'contain', filter: 'brightness(1.1)' }} priority />
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link href="/clientes" className={`nav-link ${pathname.startsWith('/clientes') ? 'active' : ''}`}>
            <Users size={20} /> Clientes
          </Link>
          <Link href="/proyectos" className={`nav-link ${pathname.startsWith('/proyectos') ? 'active' : ''}`}>
            <HardHat size={20} /> Proyectos
          </Link>
          <Link href="/anteproyecto" className={`nav-link ${pathname.startsWith('/anteproyecto') ? 'active' : ''}`}>
            <ClipboardList size={20} /> Anteproyecto
          </Link>
          <Link href="/cuentas-por-pagar" className={`nav-link ${pathname.startsWith('/cuentas-por-pagar') ? 'active' : ''}`}>
            <Wallet size={20} /> Cuentas por Pagar
          </Link>
          <Link href="/cuentas-por-cobrar" className={`nav-link ${pathname.startsWith('/cuentas-por-cobrar') ? 'active' : ''}`}>
            <TrendingUp size={20} /> Cuentas por Cobrar
          </Link>
          <Link href="/materiales" className={`nav-link ${pathname.startsWith('/materiales') ? 'active' : ''}`}>
            <Package size={20} /> Materiales
          </Link>
          {role === 'admin' && (
            <Link href="/administracion" className={`nav-link ${pathname === '/administracion' ? 'active' : ''}`}>
              <BarChart3 size={20} /> Administración
            </Link>
          )}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          
          <PWAInstallPrompt variant="button" />
          
          <div style={{ padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
             <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'black', fontSize: '0.8rem' }}>
               {user?.user_metadata?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
             </div>
             <div style={{ flex: 1, minWidth: 0 }}>
               <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                 {user?.user_metadata?.name || 'Usuario'}
               </div>
               <div style={{ fontSize: '0.7rem', color: role === 'admin' ? 'var(--primary-color)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                 {role === 'admin' ? 'Administrador' : role === 'client' ? 'Cliente / Generador' : role === 'sales' ? 'Ventas' : 'Observador'}
               </div>
             </div>
          </div>

          <button className="nav-link" onClick={handleLogout} style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}>
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {/* MOBILE HEADER — only visible on mobile via CSS */}
        {pathname !== '/login' && (
          <div className="mobile-header hide-on-print">
            <span className="mobile-header-title">P&amp;P CONSTRUYE</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).__openPepeChat) {
                    (window as any).__openPepeChat();
                  }
                }}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '20px',
                  padding: '0.3rem 0.65rem',
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <img src="/pepe_avatar.png" alt="Pepe" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                <span>Pepe IA</span>
              </button>
              <button
                onClick={handleLogout}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                title="Cerrar Sesión"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}

        {pathname !== '/login' && (
          <header className="hide-on-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
            <div style={{ maxWidth: '240px' }}>
              <PWAInstallPrompt variant="button" />
            </div>
          </header>
        )}

        {children}
      </main>

      {/* BOTTOM NAVIGATION — only visible on mobile via CSS */}
      {pathname !== '/login' && (
        <nav className="bottom-nav hide-on-print">
          <Link href="/" className={`bottom-nav-item ${pathname === '/' ? 'active' : ''}`}>
            <LayoutDashboard size={22} />
            <span>Inicio</span>
          </Link>
          <Link href="/proyectos" className={`bottom-nav-item ${pathname.startsWith('/proyectos') ? 'active' : ''}`}>
            <HardHat size={22} />
            <span>Obras</span>
          </Link>
          <Link href="/clientes" className={`bottom-nav-item ${pathname.startsWith('/clientes') ? 'active' : ''}`}>
            <Users size={22} />
            <span>Clientes</span>
          </Link>
          <Link href="/cuentas-por-cobrar" className={`bottom-nav-item ${pathname.startsWith('/cuentas-por-cobrar') ? 'active' : ''}`}>
            <TrendingUp size={22} />
            <span>Cobrar</span>
          </Link>
          <Link href="/cuentas-por-pagar" className={`bottom-nav-item ${pathname.startsWith('/cuentas-por-pagar') ? 'active' : ''}`}>
            <Wallet size={22} />
            <span>Pagar</span>
          </Link>
        </nav>
      )}

      {/* Floating PWA Install Banner */}
      <PWAInstallPrompt variant="banner" />

      {/* Floating Global AI Assistant */}
      {role !== null && role !== 'viewer' && (
        <FloatingAssistant onProposalSaved={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('proposalSaved'));
          }
        }} />
      )}

      <NewProposalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => setModalOpen(false)}
        onOpenAI={handleOpenAI}
      />
    </div>
  );
}
