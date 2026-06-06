'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Users, HardHat, Wallet, LayoutDashboard,
  Settings, PlusCircle, Package, LogOut, ShieldCheck, TrendingUp
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NewProposalModal from '@/components/NewProposalModal';
import FloatingAssistant from '@/components/FloatingAssistant';
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
      {/* SIDEBAR */}
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
          <Link href="/cuentas-por-pagar" className={`nav-link ${pathname.startsWith('/cuentas-por-pagar') ? 'active' : ''}`}>
            <Wallet size={20} /> Cuentas por Pagar
          </Link>
          <Link href="/cuentas-por-cobrar" className={`nav-link ${pathname.startsWith('/cuentas-por-cobrar') ? 'active' : ''}`}>
            <TrendingUp size={20} /> Cuentas por Cobrar
          </Link>
          <Link href="/materiales" className={`nav-link ${pathname.startsWith('/materiales') ? 'active' : ''}`}>
            <Package size={20} /> Materiales
          </Link>
          <Link href="/administracion" className={`nav-link ${pathname === '/administracion' ? 'active' : ''}`}>
            <BarChart3 size={20} /> Administración
          </Link>
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>

          
          <div style={{ padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
             <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'black', fontSize: '0.8rem' }}>
               {user?.user_metadata?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
             </div>
             <div style={{ flex: 1, minWidth: 0 }}>
               <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                 {user?.user_metadata?.name || 'Usuario'}
               </div>
               <div style={{ fontSize: '0.7rem', color: role === 'admin' ? 'var(--primary-color)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                 {role === 'admin' ? 'Administrador' : 'Observador'}
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
        {pathname !== '/login' && (
          <header className="hide-on-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '2.5rem' }}>
             {/* Header vacío o para futuros elementos globales */}
          </header>
        )}

        {children}
      </main>

      {/* Floating Global AI Assistant - Solo para Admins */}
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
