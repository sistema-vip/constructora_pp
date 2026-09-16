'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Download, 
  Share2, 
  Eye, 
  FileText, 
  Loader2
} from 'lucide-react';

interface ReportShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fileName: string;
  pdfUrl: string;
  clientPhone?: string;
  clientEmail?: string;
  onPrint?: () => void;
}

export default function ReportShareModal({
  isOpen,
  onClose,
  title,
  subtitle,
  fileName,
  pdfUrl,
  clientPhone
}: ReportShareModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${origin}${pdfUrl}`;
  const downloadUrl = `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}download=1`;
  const fullDownloadUrl = downloadUrl.startsWith('http') ? downloadUrl : `${origin}${downloadUrl}`;

  // Formato internacional para teléfono de Venezuela (+58)
  const formatPhone = (phone?: string) => {
    if (!phone) return '';
    let c = phone.replace(/\D/g, '');
    if (c.startsWith('0')) c = '58' + c.substring(1);
    else if (c.length === 10) c = '58' + c;
    return c;
  };
  const waPhone = formatPhone(clientPhone);

  // 1. VISUALIZAR PDF EN MÓVIL (Google Docs Viewer para renderizar garantizado en Android WebView)
  const handleViewPdf = () => {
    setIsViewing(true);
    // En navegadores móviles y Android WebView, Google Docs Viewer renderiza el PDF sin requerir plugin nativo
    const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fullPdfUrl)}&embedded=false`;
    
    try {
      const win = window.open(viewerUrl, '_blank');
      if (!win || win.closed || typeof win.closed === 'undefined') {
        window.location.href = viewerUrl;
      }
    } catch {
      window.location.href = viewerUrl;
    }

    setTimeout(() => setIsViewing(false), 1500);
  };

  // 2. COMPARTIR PDF (Abre la bandeja de Android con WhatsApp, Telegram, Correo, etc.)
  const handleNativeShare = async () => {
    setIsSharing(true);
    try {
      // 1. Intentar compartir el archivo PDF real si el navegador lo permite
      if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
        try {
          const res = await fetch(fullPdfUrl);
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], fileName, { type: 'application/pdf' });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: title,
                text: `Le compartimos su ${title} emitido por P&P Construye.`
              });
              setIsSharing(false);
              return;
            }
          }
        } catch (fileErr) {
          console.warn('Compartir archivo directo no disponible, usando enlace:', fileErr);
        }
      }

      // 2. Compartir como URL (rápido y nativo en Android)
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: title,
          text: `Le compartimos su ${title} de P&P Construye:`,
          url: fullPdfUrl
        });
        setIsSharing(false);
        return;
      }

      // 3. Fallback directo a WhatsApp si Web Share no existe en el WebView
      const msg = encodeURIComponent(`Estimado(a) cliente, le compartimos su *${title}* emitido por *P&P Construye*:\n\n📄 Consulte y descargue su documento aquí:\n${fullPdfUrl}`);
      const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
      window.location.href = waUrl;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const msg = encodeURIComponent(`Estimado(a) cliente, le compartimos su *${title}* emitido por *P&P Construye*:\n\n📄 Consulte y descargue su documento aquí:\n${fullPdfUrl}`);
        const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
        window.location.href = waUrl;
      }
    } finally {
      setIsSharing(false);
    }
  };

  // 3. DESCARGAR PDF (Blob en memoria + fallback a navegador del sistema)
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Método 1: Fetch del blob y descarga directa (evita bloqueos de WebView)
      const res = await fetch(fullDownloadUrl);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          window.URL.revokeObjectURL(blobUrl);
          setIsDownloading(false);
        }, 1500);
        return;
      }
    } catch (err) {
      console.warn('Descarga por Blob falló, intentando por ventana de sistema:', err);
    }

    // Método 2: Abrir en navegador de sistema (_system en Capacitor activa Chrome DownloadManager)
    try {
      window.open(fullDownloadUrl, '_system');
    } catch {
      window.location.href = fullDownloadUrl;
    }
    setTimeout(() => setIsDownloading(false), 1500);
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          borderTop: '1px solid rgba(245, 158, 11, 0.4)',
          borderLeft: '1px solid rgba(245, 158, 11, 0.25)',
          borderRight: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '24px 24px 0 0',
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90dvh',
          overflowY: 'auto',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(245, 158, 11, 0.15)',
          paddingBottom: 'calc(1.4rem + env(safe-area-inset-bottom, 16px))'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Manija */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.75rem', paddingBottom: '0.2rem' }}>
          <div style={{ width: '44px', height: '5px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.25)' }} />
        </div>

        {/* Encabezado */}
        <div style={{
          padding: '0.65rem 1.25rem 0.85rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flex: 1, minWidth: 0 }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              fontWeight: 800
            }}>
              <FileText size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </div>
              {subtitle && (
                <div style={{ fontSize: '0.76rem', color: '#fbbf24', fontWeight: 600 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.45rem',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '0.5rem'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Los 3 Únicos Botones Solicitados */}
        <div style={{ padding: '1.2rem 1.25rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* 1. VISUALIZAR PDF */}
          <button
            onClick={handleViewPdf}
            disabled={isViewing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              borderRadius: '14px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
              padding: '1rem',
              width: '100%',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.15)',
              opacity: isViewing ? 0.7 : 1
            }}
          >
            {isViewing ? <Loader2 size={20} className="animate-spin" /> : <Eye size={20} />}
            <span>Visualizar Documento</span>
          </button>

          {/* 2. COMPARTIR PDF */}
          <button
            onClick={handleNativeShare}
            disabled={isSharing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
              padding: '1rem',
              width: '100%',
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)',
              opacity: isSharing ? 0.7 : 1
            }}
          >
            {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
            <span>Compartir PDF</span>
          </button>

          {/* 3. DESCARGAR PDF */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
              padding: '1rem',
              width: '100%',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000000',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
              opacity: isDownloading ? 0.7 : 1
            }}
          >
            {isDownloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
            <span>Descargar Archivo PDF</span>
          </button>

        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
