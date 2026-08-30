import { formatCurrency } from '@/lib/formatters';
import { parseProjectRelation } from '@/lib/projectRelationsHelper';

export interface PartnerReportData {
  client: any;
  clientNotes?: string;
  activeProjectsCount: number;
  printProjects: any[];
  printPayments: any[];
  printCosts: any[];
  printExtras: any[];
  printCommitments: any[];
  printAdvances: any[];
  printTotalContracted: number;
  printTotalPaid: number;
  printTotalCostsValue: number;
  printTotalCommitted: number;
  printTotalAdvances: number;
  printBalanceDue: number;
  printEstimatedProfit: number;
  printNetProfit: number;
  henryAdvances: number;
  losbersAdvances: number;
}

export function generatePartnerReportHtml(data: PartnerReportData): string {
  const {
    client,
    clientNotes,
    activeProjectsCount,
    printProjects,
    printPayments,
    printCosts,
    printExtras,
    printCommitments,
    printAdvances,
    printTotalContracted,
    printTotalPaid,
    printTotalCostsValue,
    printTotalCommitted,
    printTotalAdvances,
    printBalanceDue,
    printEstimatedProfit,
    printNetProfit,
    henryAdvances,
    losbersAdvances
  } = data;

  const todayStr = new Date().toLocaleDateString('es-VE');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Financiero de Socios - P&P Construye</title>
  <style>
    @page {
      size: letter;
      margin: 12mm 15mm 15mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
      font-size: 12px;
      line-height: 1.4;
    }
    h1, h2, h3, p {
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
  </style>
</head>
<body>
  <div>
    <!-- Encabezado del Reporte -->
    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 1rem; margin-bottom: 2rem;">
      <div>
         <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #000;">P&P CONSTRUYE</h1>
         <p style="margin: 0; font-size: 12px; color: #555;">Ingeniería, Arquitectura y Construcción</p>
      </div>
      <div style="text-align: right;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #000;">REPORTE FINANCIERO DE SOCIOS</h2>
        <p style="margin: 0; font-size: 11px; color: #dc2626; font-weight: 600;">USO INTERNO EXCLUSIVO DE SOCIOS</p>
        <p style="margin: 0; font-size: 12px; color: #555;">Fecha de Emisión: ${todayStr}</p>
        <p style="margin: 0; font-size: 12px; color: #555;">Proyectos incluidos: ${printProjects.length} de ${activeProjectsCount}</p>
      </div>
    </div>

    <!-- Datos del Cliente -->
    <div style="margin-bottom: 2rem; padding: 1rem; background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px;">
      <h3 style="margin: 0 0 0.5rem 0; font-size: 16px; font-weight: bold;">CLIENTE: ${client.name || 'N/A'}</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 12px;">
        <div><strong>Empresa:</strong> ${client.company_name || 'N/A'}</div>
        <div><strong>RIF/Identificación:</strong> ${client.tax_id || 'N/A'}</div>
        <div><strong>Teléfono:</strong> ${client.phone || 'N/A'}</div>
        <div><strong>Email:</strong> ${client.email || 'N/A'}</div>
      </div>
    </div>

    <!-- Resumen Financiero (KPIs) -->
    <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">RESUMEN FINANCIERO</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 14px;">
      <tbody>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa; width: 50%;"><strong>Total Contratado:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; width: 50%; text-align: right;">$${formatCurrency(printTotalContracted)}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa;"><strong>Total Abonado:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; text-align: right;">$${formatCurrency(printTotalPaid)}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa;"><strong>Saldo Pendiente:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; text-align: right; color: ${printBalanceDue > 0 ? '#ff9800' : '#28a745'}; font-weight: 600;">$${formatCurrency(printBalanceDue)}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa;"><strong>Gastos Ejecutados:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; text-align: right; color: #d32f2f; font-weight: 600;">$${formatCurrency(printTotalCostsValue)}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa;"><strong>Cuentas por Pagar Pendientes:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; text-align: right; color: #d32f2f; font-weight: 600;">$${formatCurrency(printTotalCommitted)}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa;"><strong>Ganancia Estimada:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; text-align: right; color: #28a745; font-weight: 600;">$${formatCurrency(printEstimatedProfit)}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem; border: 1px solid #ccc; background: #f8f9fa;"><strong>Total Retiro de Socios:</strong></td>
          <td style="padding: 0.5rem; border: 1px solid #ccc; text-align: right; color: #d32f2f; font-weight: 600;">$${formatCurrency(printTotalAdvances)}</td>
        </tr>
        <tr style="background: #e8f5e9;">
          <td style="padding: 0.7rem; border: 2px solid #28a745; font-weight: bold;"><strong>GANANCIA NETA POR RETIRAR:</strong></td>
          <td style="padding: 0.7rem; border: 2px solid #28a745; text-align: right; font-weight: bold; color: #1b5e20; font-size: 15px;">$${formatCurrency(printNetProfit)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Detalle de Proyectos -->
    <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">1. PROYECTOS Y PRESUPUESTOS</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 12px;">
      <thead>
        <tr style="background: #f1f1f1;">
          <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">PROYECTO</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: center;">FECHA</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">PRESUPUESTO BASE</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">ADICIONALES</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">TOTAL PROYECTO</th>
        </tr>
      </thead>
      <tbody>
        ${printProjects.map(p => {
          const pExtras = (p.project_extras || []).reduce((acc: number, e: any) => acc + Number(e.amount_usd), 0);
          const rel = parseProjectRelation(p, printProjects);
          const pTotal = Number(p.budget_usd) + pExtras;
          return `
            <tr style="${rel.isAdditional ? 'background-color: #fff7ed;' : ''}">
              <td style="border: 1px solid #ccc; padding: 0.5rem;">
                ${rel.isOriginalWithAdditionals ? `
                  <div style="display: inline-block; font-size: 10px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #bae6fd;">
                    🔗 Proyectos Unificados (${1 + rel.additionals.length})
                  </div>
                ` : ''}
                <div><strong>${p.proposal_number ? '#' + p.proposal_number + ' - ' : ''}${p.title}</strong></div>
                ${rel.isAdditional && rel.parentProject ? `
                  <div style="font-size: 10.5px; color: #c2410c; font-weight: 600; margin-top: 3px;">
                    ↳ Obra Adicional vinculada a #${rel.parentProject.proposal_number || 'S/N'} (${rel.parentProject.title})
                  </div>
                ` : ''}
                ${!rel.isAdditional && rel.additionals.length > 0 ? `
                  <div style="margin-top: 6px; padding: 6px 8px; background: #f8fafc; border-left: 3px solid #0284c7; border-radius: 2px; font-size: 11px;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px; text-transform: uppercase; font-size: 10px;">Desglose de Conceptos Originales Unificados:</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #334155;">
                      <span>• <strong>Proyecto Principal (${p.proposal_number ? '#' + p.proposal_number : 'Base'}):</strong> ${p.title}</span>
                      <strong style="white-space: nowrap; margin-left: 8px;">$${formatCurrency(rel.originalBudgetUsd)} USD</strong>
                    </div>
                    ${rel.additionals.map(a => `
                      <div style="display: flex; justify-content: space-between; margin-top: 2px; color: #0369a1;">
                        <span>• <strong>Proyecto Unificado (${a.proposal_number ? '#' + a.proposal_number : 'Adicional'}):</strong> ${a.title}</span>
                        <strong style="white-space: nowrap; margin-left: 8px;">$${formatCurrency(a.budget_usd)} USD</strong>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: center;">${new Date(p.created_at).toLocaleDateString('es-VE')}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(rel.originalBudgetUsd || p.budget_usd)}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(pExtras + (rel.isOriginalWithAdditionals ? rel.totalAdditionalsBudget : 0))}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; font-weight: bold;">$${formatCurrency(pTotal)}</td>
            </tr>
          `;
        }).join('')}
        <tr style="background: #f8f9fa; font-weight: bold;">
          <td colspan="2" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">TOTALES GLOBALES:</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd), 0))}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd), 0))}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(printTotalContracted)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Detalle de Pagos -->
    <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">2. HISTORIAL DE PAGOS RECIBIDOS</h3>
    ${printPayments.length === 0 ? `
      <p style="font-size: 12px; color: #555; margin-bottom: 2rem;">No hay pagos registrados.</p>
    ` : `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 12px;">
        <thead>
          <tr style="background: #f1f1f1;">
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">FECHA</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">CONCEPTO / REFERENCIA</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">PROYECTO ORIGEN</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">MONTO (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${printPayments.map(p => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 0.5rem;">${p.date || 'N/A'}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem;">${p.description || ''} ${p.reference ? '(Ref: ' + p.reference + ')' : ''}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem;">${p.proposal_number ? '#' + p.proposal_number + ' - ' : ''}${p.project_title}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(p.amount_usd)}</td>
            </tr>
          `).join('')}
          <tr style="background: #f8f9fa; font-weight: bold;">
            <td colspan="3" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">Total Cobrado:</td>
            <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(printTotalPaid)}</td>
          </tr>
        </tbody>
      </table>
    `}

    <!-- Detalle de Gastos -->
    <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">3. RELACIÓN DE GASTOS EJECUTADOS</h3>
    ${printCosts.length === 0 ? `
      <p style="font-size: 12px; color: #555; margin-bottom: 2rem;">No hay gastos registrados.</p>
    ` : `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 12px;">
        <thead>
          <tr style="background: #f1f1f1;">
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">FECHA</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">PROVEEDOR</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">CONCEPTO</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: center;">CANT.</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">P. UNIT.</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">TOTAL (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${printCosts.map(c => {
            const costDate = c.date || (c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : 'N/A');
            const totalCost = Number(c.quantity || 1) * Number(c.unit_price_usd || 0);
            return `
              <tr>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${costDate}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${c.provider || 'N/A'}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${c.description || ''}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: center;">${c.quantity || 1}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(c.unit_price_usd)}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(totalCost)}</td>
              </tr>
            `;
          }).join('')}
          <tr style="background: #f8f9fa; font-weight: bold;">
            <td colspan="5" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">Total Gastado:</td>
            <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; color: #d32f2f;">$${formatCurrency(printTotalCostsValue)}</td>
          </tr>
        </tbody>
      </table>
    `}

    <!-- Detalle de Cuentas por Pagar -->
    <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">4. CUENTAS POR PAGAR (PENDIENTES)</h3>
    ${printCommitments.length === 0 ? `
      <p style="font-size: 12px; color: #555; margin-bottom: 2rem;">No hay cuentas por pagar pendientes por liquidar.</p>
    ` : `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 12px;">
        <thead>
          <tr style="background: #f1f1f1;">
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">FECHA</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">PROVEEDOR</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">CONCEPTO</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">PROYECTO</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">TOTAL PACTADO</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">ABONADO</th>
            <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">SALDO PENDIENTE (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${printCommitments.map(c => {
            const commDate = c.date || (c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : 'N/A');
            return `
              <tr>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${commDate}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${c.provider || 'N/A'}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${c.description || ''}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${c.proposal_number ? '#' + c.proposal_number + ' - ' : ''}${c.project_title}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(c.total_amount)}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; color: #28a745;">$${formatCurrency(c.paid_amount)}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; font-weight: bold; color: #d32f2f;">$${formatCurrency(c.balance)}</td>
              </tr>
            `;
          }).join('')}
          <tr style="background: #f8f9fa; font-weight: bold;">
            <td colspan="6" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">Total Cuentas por Pagar Pendientes:</td>
            <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; color: #d32f2f;">$${formatCurrency(printTotalCommitted)}</td>
          </tr>
        </tbody>
      </table>
    `}

    <!-- Detalle de Retiros -->
    <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">5. RETIRO DE SOCIOS</h3>
    ${printAdvances.length === 0 ? `
      <p style="font-size: 12px; color: #555; margin-bottom: 2rem;">No hay retiros registrados.</p>
    ` : `
      <div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 12px;">
          <thead>
            <tr style="background: #f1f1f1;">
              <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">FECHA</th>
              <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">SOCIO</th>
              <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: left;">PROYECTO</th>
              <th style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">MONTO (USD)</th>
            </tr>
          </thead>
          <tbody>
            ${printAdvances.map(a => `
              <tr>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${a.date || 'N/A'}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; font-weight: bold;">${a.partner_name}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem;">${a.proposal_number ? '#' + a.proposal_number + ' - ' : ''}${a.project_title}</td>
                <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(a.amount_usd)}</td>
              </tr>
            `).join('')}
            <tr style="background: #f8f9fa; font-weight: bold;">
              <td colspan="3" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">Total Retiros Henry Peraza:</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(henryAdvances)}</td>
            </tr>
            <tr style="background: #f8f9fa; font-weight: bold;">
              <td colspan="3" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">Total Retiros Losbers Perez:</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(losbersAdvances)}</td>
            </tr>
            <tr style="background: #fff3cd; font-weight: bold;">
              <td colspan="3" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">TOTAL RETIRADO:</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; color: #d32f2f;">$${formatCurrency(printTotalAdvances)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `}

    ${clientNotes ? `
      <div style="margin-top: 1.5rem;">
        <h3 style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1rem;">OBSERVACIONES IMPORTANTES</h3>
        <div style="padding: 1rem; border: 1px solid #ccc; border-radius: 4px; white-space: pre-wrap; font-size: 12px; background: #fdfdfd;">
          ${clientNotes}
        </div>
      </div>
    ` : ''}

    <div style="margin-top: 3rem; text-align: center; font-size: 10px; color: #777; border-top: 1px solid #eee; padding-top: 1rem;">
      <p>Documento generado por el Sistema Administrativo de P&P Construye</p>
    </div>
  </div>
</body>
</html>`;
}
