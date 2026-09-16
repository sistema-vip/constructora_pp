'use client';

import React, { useState } from 'react';
import { Plus, X, DollarSign, Receipt, UserPlus } from 'lucide-react';

interface MobileFloatingActionProps {
  onNewExpense: () => void;
  onNewPayment: () => void;
  onNewClient: () => void;
}

export default function MobileFloatingAction({
  onNewExpense,
  onNewPayment,
  onNewClient
}: MobileFloatingActionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Backdrop when expanded */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 1500,
            animation: 'fadeInOverlay 0.2s ease-out'
          }}
        />
      )}

      {/* Floating Buttons Container */}
      <div
        style={{
          position: 'fixed',
          right: '1.25rem',
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          zIndex: 1600,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '0.85rem'
        }}
      >
        {/* Sub-actions when open */}
        {expanded && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              alignItems: 'flex-end',
              animation: 'slideUpSheet 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <button
              onClick={() => {
                setExpanded(false);
                onNewClient();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: '#1f242e',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '0.65rem 1.1rem',
                borderRadius: '999px',
                fontSize: '0.88rem',
                fontWeight: 600,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                cursor: 'pointer'
              }}
            >
              <span>Nuevo Cliente</span>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <UserPlus size={16} />
              </div>
            </button>

            <button
              onClick={() => {
                setExpanded(false);
                onNewPayment();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: '#1f242e',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '0.65rem 1.1rem',
                borderRadius: '999px',
                fontSize: '0.88rem',
                fontWeight: 600,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                cursor: 'pointer'
              }}
            >
              <span>Registrar Cobro</span>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <DollarSign size={16} />
              </div>
            </button>

            <button
              onClick={() => {
                setExpanded(false);
                onNewExpense();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: '#1f242e',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '0.65rem 1.1rem',
                borderRadius: '999px',
                fontSize: '0.88rem',
                fontWeight: 600,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                cursor: 'pointer'
              }}
            >
              <span>Registrar Gasto</span>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Receipt size={16} />
              </div>
            </button>
          </div>
        )}

        {/* Main Trigger Button */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-color)',
            color: '#000000',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 25px rgba(245, 158, 11, 0.45)',
            cursor: 'pointer',
            transform: expanded ? 'rotate(45deg)' : 'none',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            touchAction: 'manipulation'
          }}
        >
          <Plus size={28} strokeWidth={2.6} />
        </button>
      </div>
    </>
  );
}
