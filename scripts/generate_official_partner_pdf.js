const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tyafjhkdxuygnbejbymp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YWZqaGtkeHV5Z25iZWpieW1wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyMDUwNiwiZXhwIjoyMDkyODk2NTA2fQ.j5YZQVprCKUFncWpYuLJXQ1Vsw_afL0mzhGtyfr_Znw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const CLIENT_ID = '7f79d771-6274-45bb-9002-5b3616510a33';
const TARGET_PROJECT_ID = 'af1c8a02-7683-4515-9786-bb7d356d969e';
const RECIPIENT_HENRY = '584125007089@s.whatsapp.net';
const OUTPUT_PDF_PATH = path.join(process.cwd(), 'reporte_socios_oficial.pdf');

// Helpers for currency formatting matching src/lib/formatters.ts
function parseCurrency(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;

  let str = String(value).replace(/[^\d.,-]/g, '').trim();
  
  const commas = (str.match(/,/g) || []).length;
  const dots = (str.match(/\./g) || []).length;

  if (commas === 0 && dots === 1) {
    if (/\.\d{1,2}$/.test(str)) {
      return parseFloat(str) || 0;
    } else {
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
  }

  let cleanStr = str.replace(/\./g, '');
  const lastComma = cleanStr.lastIndexOf(',');
  if (lastComma !== -1) {
    cleanStr = cleanStr.substring(0, lastComma) + '.' + cleanStr.substring(lastComma + 1);
  }
  cleanStr = cleanStr.replace(/,/g, '');

  return parseFloat(cleanStr) || 0;
}

function formatCurrency(value) {
  if (value === '' || value === null || value === undefined) return '0,00';
  const num = parseCurrency(value);
  if (isNaN(num)) return '0,00';
  
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

// Find local browser executable
function getBrowserExecutablePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

async function fetchReportData() {
  console.log('🔍 Obteniendo datos de Supabase para cliente:', CLIENT_ID);

  // 1. Client data
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', CLIENT_ID)
    .single();

  if (clientErr) throw new Error('Error al obtener cliente: ' + clientErr.message);

  // 2. Projects data
  const { data: projects, error: projectsErr } = await supabase
    .from('projects')
    .select('*, project_payments(*), project_costs(*), project_extras(*), project_commitments(*, payable_accounts(id, status, payable_payments(amount_usd))), partner_advances(*)')
    .eq('client_id', CLIENT_ID)
    .order('created_at', { ascending: false });

  if (projectsErr) throw new Error('Error al obtener proyectos: ' + projectsErr.message);

  const activeProjects = (projects || []).filter(p => p.status === 'in_progress' || p.status === 'completed');
  
  // Filter for the target project specifically selected in the interface
  const printProjects = (projects || []).filter(p => p.id === TARGET_PROJECT_ID);

  if (printProjects.length === 0) {
    throw new Error(`Proyecto objetivo con ID ${TARGET_PROJECT_ID} no encontrado para este cliente.`);
  }

  // Calculations matching exactly src/app/clientes/[id]/page.tsx
  const printPayments = printProjects.flatMap(p => (p.project_payments || []).map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printCosts = printProjects.flatMap(p => (p.project_costs || []).map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  const printExtras = printProjects.flatMap(p => (p.project_extras || []).map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  
  const printCommitments = printProjects.flatMap(p => 
    (p.project_commitments || []).map(x => {
      const status = x.payable_accounts?.[0]?.status;
      const isPaidOrCancelled = status === 'paid' || status === 'cancelled';
      const paid = x.payable_accounts?.[0]?.payable_payments?.reduce((s, pm) => s + Number(pm.amount_usd), 0) || 0;
      const total = Number(x.amount_usd || (x.quantity * x.unit_price_usd));
      const balance = isPaidOrCancelled || paid >= total - 0.01 ? 0 : Math.max(0, total - paid);
      return {
        ...x,
        project_title: p.title,
        proposal_number: p.proposal_number,
        total_amount: total,
        paid_amount: paid,
        balance
      };
    })
  ).filter(c => c.balance > 0.01);

  const printAdvances = printProjects.flatMap(p => (p.partner_advances || []).map(x => ({ ...x, project_title: p.title, proposal_number: p.proposal_number })));
  
  const printTotalContracted = printProjects.reduce((s, p) => s + Number(p.budget_usd), 0) + printExtras.reduce((s, e) => s + Number(e.amount_usd), 0);
  const printTotalPaid = printPayments.reduce((s, p) => s + Number(p.amount_usd), 0);
  const printTotalCostsValue = printCosts.reduce((s, c) => s + (Number(c.quantity) * Number(c.unit_price_usd)), 0);
  const printTotalCommitted = printCommitments.reduce((s, c) => s + c.balance, 0);
  const printTotalAdvances = printAdvances.reduce((s, a) => s + Number(a.amount_usd), 0);
  const printBalanceDue = printTotalContracted - printTotalPaid;
  const printEstimatedProfit = printTotalContracted - printTotalCostsValue - printTotalCommitted;
  const printNetProfit = printEstimatedProfit - printTotalAdvances;

  const henryAdvances = printAdvances.filter(a => a.partner_name === 'Henry Peraza').reduce((s, a) => s + Number(a.amount_usd), 0);
  const losbersAdvances = printAdvances.filter(a => a.partner_name === 'Losbers Perez').reduce((s, a) => s + Number(a.amount_usd), 0);

  return {
    client,
    clientNotes: client.notes || '',
    activeProjects,
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
  };
}

function buildReportHtml(data) {
  const {
    client,
    clientNotes,
    activeProjects,
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
        <p style="margin: 0; font-size: 12px; color: #555;">Proyectos incluidos: ${printProjects.length} de ${activeProjects.length}</p>
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
          const pExtras = (p.project_extras || []).reduce((acc, e) => acc + Number(e.amount_usd), 0);
          const pTotal = Number(p.budget_usd) + pExtras;
          return `
            <tr>
              <td style="border: 1px solid #ccc; padding: 0.5rem;">${p.proposal_number ? '#' + p.proposal_number + ' - ' : ''}${p.title}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: center;">${new Date(p.created_at).toLocaleDateString('es-VE')}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(p.budget_usd)}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(pExtras)}</td>
              <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right; font-weight: bold;">$${formatCurrency(pTotal)}</td>
            </tr>
          `;
        }).join('')}
        <tr style="background: #f8f9fa; font-weight: bold;">
          <td colspan="2" style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">TOTALES GLOBALES:</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(printProjects.reduce((s, p) => s + Number(p.budget_usd), 0))}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem; text-align: right;">$${formatCurrency(printExtras.reduce((s, e) => s + Number(e.amount_usd), 0))}</td>
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

async function generatePdfWithPuppeteer(html, outputPath) {
  const executablePath = getBrowserExecutablePath();
  console.log('🚀 Iniciando navegador invisible Puppeteer...');
  console.log('🧭 Ruta de ejecutable detectada:', executablePath || 'Por defecto de Puppeteer');

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none'
    ]
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    console.log('📄 Renderizando reporte en formato PDF...');
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '12mm',
        left: '12mm'
      }
    });

    console.log('✅ PDF oficial generado exitosamente en:', outputPath);
  } finally {
    await browser.close();
  }
}

async function sendPdfToHenryViaWhatsApp(pdfPath) {
  console.log('\n📲 Preparando envío por WhatsApp vía Baileys a Henry Peraza...');
  const authPath = path.join(process.cwd(), 'baileys_auth_info');
  
  if (!fs.existsSync(authPath) || !fs.existsSync(path.join(authPath, 'creds.json'))) {
    throw new Error('WhatsApp no está vinculado. Falta sesión en baileys_auth_info.');
  }

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  let version = [2, 3000, 1015901307];
  try {
    const v = await fetchLatestBaileysVersion();
    if (v && v.version) version = v.version;
  } catch (_) {}

  return new Promise((resolve, reject) => {
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log('✅ Conexión con WhatsApp lista.');
        try {
          console.log(`📎 Leyendo PDF (${pdfPath})...`);
          const fileBuffer = fs.readFileSync(pdfPath);
          
          console.log(`🚀 Despachando PDF oficial a Henry Peraza (${RECIPIENT_HENRY})...`);
          await sock.sendMessage(RECIPIENT_HENRY, {
            document: fileBuffer,
            mimetype: 'application/pdf',
            fileName: 'Reporte_Financiero_Socios_Oficial.pdf',
            caption: '📊 *P&P CONSTRUYE* - Reporte Financiero de Socios Oficial (Proyecto Zully Marrero / Adecuación con Demolición) capturado exactamente desde la plataforma.'
          });

          console.log('🎉 ¡PDF enviado exitosamente por WhatsApp a Henry Peraza!');
          
          setTimeout(() => {
            sock.end();
            resolve(true);
          }, 2000);
        } catch (err) {
          console.error('❌ Error enviando PDF por WhatsApp:', err);
          sock.end();
          reject(err);
        }
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('Sesión cerrada en WhatsApp.'));
        }
      }
    });
  });
}

async function main() {
  console.log('=====================================================');
  console.log('🏛️ GENERADOR OFICIAL DE REPORTE DE SOCIOS EN PDF (PUPPETEER)');
  console.log('=====================================================');

  const reportData = await fetchReportData();
  console.log(`📊 Datos cargados: Cliente: ${reportData.client.name}, Proyecto: ${reportData.printProjects[0].title}`);
  console.log(`   - Contratado: $${formatCurrency(reportData.printTotalContracted)}`);
  console.log(`   - Cobrado: $${formatCurrency(reportData.printTotalPaid)}`);
  console.log(`   - Gastos: $${formatCurrency(reportData.printTotalCostsValue)}`);
  console.log(`   - Ganancia Neta: $${formatCurrency(reportData.printNetProfit)}`);

  const html = buildReportHtml(reportData);
  await generatePdfWithPuppeteer(html, OUTPUT_PDF_PATH);

  // Send ONLY to Henry Peraza as requested by user
  await sendPdfToHenryViaWhatsApp(OUTPUT_PDF_PATH);

  console.log('\n🌟 ¡TODO EL PROCESO FUE COMPLETADO EXITOSAMENTE!');
}

main().catch(err => {
  console.error('\n❌ ERROR FATAL:', err);
  process.exit(1);
});
