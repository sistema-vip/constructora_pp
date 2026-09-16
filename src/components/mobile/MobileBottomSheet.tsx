'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children
}: MobileBottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="mobile-sheet-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        animation: 'fadeInOverlay 0.25s ease-out'
      }}
    >
      <div 
        className="mobile-sheet-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#161a22',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.8)',
          animation: 'slideUpSheet 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))'
        }}
      >
        {/* Drag handle pill */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px 0' }}>
          <div style={{
            width: '44px',
            height: '5px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.25)'
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 1.25rem 1rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '1.2rem',
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '-0.01em'
          }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              touchAction: 'manipulation'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body content */}
        <div style={{
          padding: '1.25rem',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          flex: 1
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
