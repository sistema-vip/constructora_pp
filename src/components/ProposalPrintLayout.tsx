import React from 'react';

interface ProposalPrintLayoutProps {
  proposalNumber?: number;
  date: string;
  contentText: string | null | undefined;
}

// Helper to parse simple **bold** markdown syntax
const parseBoldText = (text: string) => {
  if (!text) return text;
  return text.replace(/\*\*/g, '');
};

/**
 * ⚠️ PROTECTED COMPONENT BLOCK — CORPORATE IDENTITY ⚠️
 * 
 * The following parsing and rendering logic (renderStructuredProposal) defines the 
 * OFFICIAL print design of the proposals. 
 * DO NOT MODIFY the visual structure, fonts, margins, or rendering rules 
 * without explicit approval from the client.
 */
export const renderStructuredProposal = (text: string | null | undefined) => {
  if (!text) return null;

  // Extraer metadatos de adicionales unificados si existen
  let unifiedAdditionals: { proposal_number?: number | string; title: string; budget_usd: number }[] = [];
  let originalBaseBudget: number | null = null;

  const addMatch = text.match(/<!--\s*PP_UNIFIED_ADDITIONALS:\s*(\[[\s\S]*?\])\s*-->/);
  if (addMatch) {
    try {
      const parsed = JSON.parse(addMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        unifiedAdditionals = parsed.map((a: any) => ({
          proposal_number: a.proposal_number,
          title: a.title,
          budget_usd: Number(a.budget_usd || 0)
        }));
      }
    } catch (e) {
      console.warn('Error parsing unifiedAdditionals in print layout:', e);
    }
  }

  const origMatch = text.match(/<!--\s*PP_ORIGINAL_BUDGET:\s*([\d\.]+)\s*-->/);
  if (origMatch) {
    const val = parseFloat(origMatch[1]);
    if (!isNaN(val)) originalBaseBudget = val;
  }

  // Limpiar comentarios HTML del texto visible
  const cleanText = text
    .replace(/<!--\s*PP_UNIFIED_ADDITIONALS:[\s\S]*?-->/g, '')
    .replace(/<!--\s*PP_ORIGINAL_BUDGET:[\s\S]*?-->/g, '')
    .replace(/<!--\s*PP_PARENT_PROJECT:[\s\S]*?-->/g, '')
    .trim();

  const lines = cleanText.split('\n');
  const renderedElements: React.ReactNode[] = [];

  // Si hay presupuestos unificados, renderizar recuadro destacado
  if (unifiedAdditionals.length > 0) {
    const baseBudget = originalBaseBudget !== null ? originalBaseBudget : 0;
    const totalUnified = baseBudget + unifiedAdditionals.reduce((sum, a) => sum + a.budget_usd, 0);

    renderedElements.push(
      <div key="unified-breakdown-card" style={{
        margin: '0.8rem 0 1.2rem 0',
        padding: '0.9rem 1.1rem',
        background: '#f8fafc',
        border: '1.5px solid #0284c7',
        borderRadius: '6px',
        fontSize: '11pt'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>
          <strong style={{ color: '#0284c7', textTransform: 'uppercase', fontSize: '10.5pt', letterSpacing: '0.5px' }}>
            Desglose de Presupuestos Unificados ({1 + unifiedAdditionals.length} Conceptos)
          </strong>
          <span style={{ fontSize: '9.5pt', color: '#64748b' }}>Consolidado Oficial</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#000' }}>
              • <strong>Propuesta Principal:</strong> Concepto Base Original
            </span>
            <strong style={{ color: '#000' }}>
              ${baseBudget.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
            </strong>
          </div>

          {unifiedAdditionals.map((add, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#0369a1' }}>
                • <strong>{add.proposal_number ? `Propuesta Adicional #${add.proposal_number}: ` : 'Adicional: '}</strong>
                {add.title}
              </span>
              <strong style={{ color: '#0369a1' }}>
                + ${add.budget_usd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
              </strong>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1.5px solid #b87333' }}>
            <strong style={{ color: '#b87333', fontSize: '11pt', textTransform: 'uppercase' }}>
              INVERSIÓN TOTAL CONSOLIDADA:
            </strong>
            <strong style={{ color: '#b87333', fontSize: '12pt' }}>
              ${totalUnified.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD
            </strong>
          </div>
        </div>
      </div>
    );
  }

  const headers = [
    'objetivo del proyecto',
    'fases del trabajo (alcance técnico)',
    'fases del trabajo',
    'fases de trabajo',
    'alcance técnico',
    'tiempo de ejecución y entrega',
    'presupuesto de inversión (a todo costo)',
    'presupuesto de inversión (solo mano de obra)',
    'presupuesto de inversión (mano de obra)',
    'presupuesto de inversión (materiales)',
    'presupuesto de inversión (solo materiales)',
    'presupuesto de inversión',
    'desglose de inversión',
    'condiciones y métodos de pago',
    'resumen financiero y ejecución',
    'alcance de trabajo adicional vinculado',
    'trabajo adicional vinculado',
    'obras adicionales unificadas',
    'alcance técnico adicional'
  ];

  const labels = [
    'proyecto',
    'fecha',
    'para',
    'área de ejecución',
    'área',
    'inversión total',
    'inversión total (usd)',
    'esquema de pago',
    'moneda de pago',
    'formas de pago',
    'métodos de pago',
    'tiempo estimado'
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      // Empty line, add a spacing div (compacted)
      renderedElements.push(<div key={`empty-${i}`} style={{ height: '0.2rem' }} />);
      continue;
    }

    const cleanLine = line.replace(/^\*{1,2}|\*{1,2}$/g, '').replace(/^#+\s*/, '').trim();
    const lowerLine = cleanLine.toLowerCase();
    const isCustomHeader = (line.startsWith('**') && line.endsWith('**') && cleanLine.length > 0 && cleanLine.length < 60 && !cleanLine.includes(':')) || (line.startsWith('#') && cleanLine.length < 60);

    // Check if it's a section header
    if (headers.includes(lowerLine) || isCustomHeader) {
      renderedElements.push(
        <h3 key={`header-${i}`} style={{ 
          margin: '0.75rem 0 0.3rem 0', 
          fontSize: '11.5pt', 
          color: '#000', 
          borderBottom: '1px solid #ccc', 
          paddingBottom: '0.15rem', 
          fontWeight: 'bold',
          textTransform: 'none'
        }}>
          {cleanLine}
        </h3>
      );
      continue;
    }

    // Check if it starts with a label and a colon
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      const possibleLabel = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      const lowerLabel = possibleLabel.toLowerCase();

      if (labels.includes(lowerLabel) || lowerLabel.includes('inversión total') || lowerLabel.includes('proyecto') || lowerLabel.includes('para') || lowerLabel.includes('fecha')) {
        // Render as styled key-value
        renderedElements.push(
          <div key={`kv-${i}`} style={{ marginBottom: '0.2rem', fontSize: '11pt', color: '#333' }}>
            <strong style={{ color: '#000', fontWeight: 'bold' }}>{possibleLabel}:</strong> {parseBoldText(value)}
          </div>
        );
        continue;
      }
    }

    // Check if it's a numbered or bullet list item
    const isListItem = /^[-\*•\d]+[\s\.-]/.test(line);
    if (isListItem) {
      // Extract number/bullet and content
      const match = line.match(/^([-\*•\d]+[\s\.-]*)(.*)/);
      const bullet = match ? match[1] : '';
      const content = match ? match[2] : line;

      if (content.includes('.... $')) {
        const parts = content.split('.... $');
        const desc = parts[0].trim();
        const price = parts[1].trim();
        renderedElements.push(
          <div key={`li-${i}`} style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            paddingLeft: '1.5rem', 
            textIndent: '-1.5rem', 
            margin: '0.2rem 0', 
            fontSize: '11pt',
            color: '#333'
          }}>
            <span><strong style={{ color: '#000' }}>{bullet}</strong> {parseBoldText(desc)}</span>
            <strong style={{ color: '#000', whiteSpace: 'nowrap', marginLeft: '1rem' }}>${price}</strong>
          </div>
        );
        continue;
      }

      renderedElements.push(
        <div key={`li-${i}`} style={{ 
          paddingLeft: '1.5rem', 
          textIndent: '-1.5rem', 
          margin: '0.2rem 0', 
          textAlign: 'justify', 
          lineHeight: '1.45', 
          fontSize: '11pt',
          color: '#333'
        }}>
          <strong style={{ color: '#000' }}>{bullet}</strong> {parseBoldText(content)}
        </div>
      );
      continue;
    }

    // Regular paragraph
    renderedElements.push(
      <p key={`p-${i}`} style={{ 
        margin: '0.2rem 0', 
        textAlign: 'justify', 
        lineHeight: '1.45', 
        fontSize: '11pt',
        color: '#333',
        whiteSpace: 'pre-wrap'
      }}>
        {parseBoldText(line)}
      </p>
    );
  }

  return <div style={{ display: 'flex', flexDirection: 'column' }}>{renderedElements}</div>;
};

export default function ProposalPrintLayout({ proposalNumber, date, contentText }: ProposalPrintLayoutProps) {
  return (
    <div className="print-area" style={{ padding: '2rem', overflowY: 'auto', flex: 1, background: '#ffffff' }}>
      {/* Header de la Propuesta */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #b87333', paddingBottom: '0.5rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_3d.png" alt="P&P CONSTRUYE" width={160} height={80} style={{ objectFit: 'contain' }} />
        <div style={{ textAlign: 'right', color: '#333' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#b87333' }}>
            PROPUESTA {proposalNumber ? `N° ${proposalNumber}` : ''}
          </h3>
          <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.85rem' }}>Fecha: {date}</p>
        </div>
      </div>

      <div style={{ lineHeight: 1.6, color: '#000', fontSize: '14px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {renderStructuredProposal(contentText)}
      </div>
    </div>
  );
}
