'use client';

import { useState, useEffect } from 'react';
import { Download, Smartphone, X, QrCode, Share, CheckCircle2, ShieldCheck, Apple } from 'lucide-react';
import Image from 'next/image';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PWAInstallPrompt({ variant = 'banner' }: { variant?: 'banner' | 'button' | 'login' }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<'apk' | 'ios' | 'pwa'>('apk');

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('SW registration error:', err);
      });
    }

    // 2. Check standalone
    if (typeof window !== 'undefined') {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);

      // Check iOS
      const ua = window.navigator.userAgent.toLowerCase();
      const isIphone = /iphone|ipad|ipod/.test(ua);
      setIsIOS(isIphone);

      if (isIphone) {
        setActiveTab('ios');
      } else {
        setActiveTab('apk');
      }

      // 3. Listen to beforeinstallprompt
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      window.addEventListener('appinstalled', () => {
        setIsInstalled(true);
        setDeferredPrompt(null);
      });

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleNativeInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('Error in prompt:', err);
      }
    }
  };

  // Only hide banner if already in standalone
  const showBanner = variant === 'banner' && !isStandalone && !isInstalled && !dismissed;

  return (
    <>
      {/* Botón en Login */}
      {variant === 'login' && (
        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              width: '100%',
              padding: '0.85rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(245, 158, 11, 0.08) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              borderRadius: '12px',
              color: '#f59e0b',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Download size={18} />
            <span>📲 Descargar Instalador App (APK / Móvil)</span>
          </button>
        </div>
      )}

      {/* Botón en el Sidebar */}
      {variant === 'button' && (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(56, 189, 248, 0.1))',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '10px',
            color: '#fbbf24',
            fontWeight: 600,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Smartphone size={18} />
          <span>Descargar App (.APK)</span>
        </button>
      )}

      {/* Banner flotante en pantalla */}
      {showBanner && (
        <div
          className="hide-on-print"
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            right: '16px',
            maxWidth: '500px',
            margin: '0 auto',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '16px',
            padding: '0.9rem 1.2rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            animation: 'fadeInUp 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <Image
              src="/logo_3d.png"
              alt="P&P"
              width={38}
              height={38}
              style={{ objectFit: 'contain', borderRadius: '8px' }}
            />
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '0.88rem' }}>
                App P&P Construye
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                Instalador APK para Android e iPhone
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              style={{
                background: 'var(--primary-color)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 0.85rem',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Download size={14} /> Descargar
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px',
              }}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Modal Principal con Descarga APK y Código QR */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              background: '#0b1329',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '24px',
              padding: '2rem 1.75rem',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: '#94a3b8',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            {/* Encabezado */}
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <Image
                src="/logo_3d.png"
                alt="P&P Construye"
                width={75}
                height={75}
                style={{ objectFit: 'contain', margin: '0 auto 0.5rem auto' }}
              />
              <h3 style={{ color: 'white', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
                App P&P CONSTRUYE
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                Instalación directa en tu teléfono celular
              </p>
            </div>

            {/* Pestañas: APK Android vs iPhone */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.05)',
                padding: '4px',
                borderRadius: '12px',
                marginBottom: '1.25rem',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('apk')}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeTab === 'apk' ? 'var(--primary-color)' : 'transparent',
                  color: activeTab === 'apk' ? '#000' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Smartphone size={16} /> Android (.APK)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeTab === 'ios' ? 'var(--primary-color)' : 'transparent',
                  color: activeTab === 'ios' ? '#000' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Apple size={16} /> iPhone (iOS)
              </button>
            </div>

            {/* CONTENIDO PESTAÑA: ANDROID APK */}
            {activeTab === 'apk' && (
              <div style={{ textAlign: 'center' }}>
                {/* Botón de Descarga Directa del APK */}
                <a
                  href="/api/download-apk"
                  download="PP_Construye.apk"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    padding: '0.9rem 1.25rem',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    boxShadow: '0 8px 20px rgba(245, 158, 11, 0.3)',
                    marginBottom: '1.25rem',
                  }}
                >
                  <Download size={20} />
                  <span>📥 Descargar Archivo APK Directo (5.6 MB)</span>
                </a>

                {/* QR Code para escanear y descargar desde la PC */}
                <div
                  style={{
                    background: '#ffffff',
                    padding: '0.85rem',
                    borderRadius: '16px',
                    display: 'inline-block',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                    marginBottom: '0.85rem',
                  }}
                >
                  <Image
                    src="/qr-apk.png"
                    alt="Escanear para descargar APK"
                    width={190}
                    height={190}
                    style={{ display: 'block', borderRadius: '8px' }}
                    priority
                  />
                </div>

                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '10px',
                    padding: '0.75rem 0.9rem',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    fontSize: '0.8rem',
                    color: '#e2e8f0',
                  }}
                >
                  <ShieldCheck size={18} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                  <span>Escanea este QR con la cámara de tu teléfono para descargar e instalar el archivo APK de inmediato.</span>
                </div>
              </div>
            )}

            {/* CONTENIDO PESTAÑA: IPHONE (iOS) */}
            {activeTab === 'ios' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.2rem' }}>
                  En iPhone, las apps web se instalan en 3 segundos desde Safari:
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px' }}>
                  <div style={{ background: 'var(--primary-color)', color: '#000', fontWeight: 'bold', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0 }}>
                    1
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                    Abre <strong>construct-pp.vercel.app</strong> en Safari y toca el botón <strong>Compartir</strong> (<Share size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />).
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px' }}>
                  <div style={{ background: 'var(--primary-color)', color: '#000', fontWeight: 'bold', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0 }}>
                    2
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                    Desplaza hacia abajo y selecciona <strong>&ldquo;Agregar a inicio&rdquo;</strong>.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px' }}>
                  <div style={{ background: 'var(--primary-color)', color: '#000', fontWeight: 'bold', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0 }}>
                    3
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                    Toca <strong>&ldquo;Agregar&rdquo;</strong> arriba a la derecha. ¡Listo!
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn-primary"
              style={{
                width: '100%',
                marginTop: '1.25rem',
                justifyContent: 'center',
                padding: '0.8rem',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
