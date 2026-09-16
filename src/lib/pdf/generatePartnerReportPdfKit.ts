import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { formatCurrency } from '@/lib/formatters';
import { PartnerReportData } from './generatePartnerReportHtml';

export function generatePartnerReportPdfKit(data: PartnerReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 45, left: 40, right: 40 },
        info: {
          Title: `Reporte de Socios - ${data.client?.name || 'Cliente'}`,
          Author: 'P&P Construye',
          Subject: 'Reporte Financiero y Control de Socios'
        },
        bufferPages: true
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const copperColor = '#B87333';
      const darkColor = '#1A1A1A';
      const grayColor = '#555555';
      const lightBorder = '#D0D0D0';
      const tableBg = '#F8FAFC';
      const successColor = '#166534';
      const alertRed = '#DC2626';
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const ensureSpace = (neededHeight: number) => {
        if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }
      };

      // 1. HEADER (Logo + Title & Date)
      const logoPath = path.join(process.cwd(), 'public', 'logo_3d.png');
      const startY = doc.y;

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, doc.page.margins.left, startY - 4, { width: 85, height: 50, fit: [85, 50] });
        } catch {
          doc.fontSize(15).font('Helvetica-Bold').fillColor(copperColor).text('P&P CONSTRUYE', doc.page.margins.left, startY);
        }
      } else {
        doc.fontSize(15).font('Helvetica-Bold').fillColor(copperColor).text('P&P CONSTRUYE', doc.page.margins.left, startY);
      }

      const headerRightX = doc.page.width - doc.page.margins.right - 260;
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text('REPORTE FINANCIERO DE SOCIOS', headerRightX, startY, { width: 260, align: 'right' });

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(alertRed)
        .text('USO INTERNO EXCLUSIVO DE SOCIOS', headerRightX, doc.y + 2, { width: 260, align: 'right' });

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(`Fecha: ${new Date().toLocaleDateString('es-VE')}  •  Proyectos: ${data.printProjects.length} de ${data.activeProjectsCount}`, headerRightX, doc.y + 2, { width: 260, align: 'right' });

      doc.y = Math.max(doc.y, startY + 52);

      // Línea divisoria
      doc
        .strokeColor(copperColor)
        .lineWidth(1.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();

      doc.moveDown(0.6);

      // 2. CLIENT DATA BOX
      const clientBoxY = doc.y;
      doc
        .rect(doc.page.margins.left, clientBoxY, pageWidth, 42)
        .fillAndStroke(tableBg, lightBorder);

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text(`CLIENTE: ${(data.client?.name || 'N/A').toUpperCase()}`, doc.page.margins.left + 8, clientBoxY + 6);

      const colW = (pageWidth - 16) / 3;
      const rowY = clientBoxY + 22;

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(`Empresa: ${data.client?.company_name || 'N/A'}`, doc.page.margins.left + 8, rowY, { width: colW, ellipsis: true })
        .text(`RIF: ${data.client?.tax_id || 'N/A'}`, doc.page.margins.left + 8 + colW, rowY, { width: colW, ellipsis: true })
        .text(`Tel: ${data.client?.phone || 'N/A'}`, doc.page.margins.left + 8 + colW * 2, rowY, { width: colW, ellipsis: true });

      doc.y = clientBoxY + 48;

      // 3. FINANCIAL KPI SUMMARY
      ensureSpace(120);
      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text('BALANCE FINANCIERO Y UTILIDADES DE SOCIOS', doc.page.margins.left, doc.y);

      doc
        .strokeColor(darkColor)
        .lineWidth(0.8)
        .moveTo(doc.page.margins.left, doc.y + 2)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
        .stroke();

      doc.y += 6;

      const drawKpiRow = (label: string, value: string, bg: string, fontBold = false, textColor = darkColor, borderCol = lightBorder) => {
        const y = doc.y;
        doc.rect(doc.page.margins.left, y, pageWidth, 16).fillAndStroke(bg, borderCol);
        doc
          .fontSize(7.8)
          .font(fontBold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(textColor)
          .text(label, doc.page.margins.left + 8, y + 4, { width: pageWidth * 0.60 });
        doc
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .fillColor(textColor)
          .text(value, doc.page.width - doc.page.margins.right - (pageWidth * 0.38) - 8, y + 4, { width: pageWidth * 0.38, align: 'right' });
        doc.y = y + 16;
      };

      drawKpiRow('1. Total Contratado (Presupuestos Base + Adicionales):', `$${formatCurrency(data.printTotalContracted)}`, '#FFFFFF');
      drawKpiRow('2. Total Cobrado / Abonado por el Cliente:', `$${formatCurrency(data.printTotalPaid)}`, '#F0FDF4', false, successColor);
      drawKpiRow('3. Saldo Pendiente por Cobrar al Cliente:', `$${formatCurrency(data.printBalanceDue)}`, '#FFFBEB', false, data.printBalanceDue > 0 ? '#B45309' : grayColor);
      drawKpiRow('4. Total Gastos Ejecutados (Materiales, Mano de Obra, etc.):', `-$${formatCurrency(data.printTotalCostsValue)}`, '#FEF2F2', false, '#991B1B');
      drawKpiRow('5. Compromisos Pendientes por Pagar (Cuentas por Pagar):', `-$${formatCurrency(data.printTotalCommitted)}`, '#FEF2F2', false, '#991B1B');

      const isProfitPos = data.printEstimatedProfit >= 0;
      drawKpiRow(
        '6. UTILIDAD ESTIMADA DE LA OBRA (Margen Bruto):',
        `$${formatCurrency(data.printEstimatedProfit)}`,
        isProfitPos ? '#ECFDF5' : '#FEF2F2',
        true,
        isProfitPos ? successColor : alertRed,
        isProfitPos ? '#10B981' : '#EF4444'
      );

      drawKpiRow('7. Total Adelantos / Retiros Realizados por Socios:', `-$${formatCurrency(data.printTotalAdvances)}`, '#FAF5FF', false, '#6B21A8');

      const isNetPos = data.printNetProfit >= 0;
      drawKpiRow(
        '8. UTILIDAD NETA DISPONIBLE POR REPARTIR:',
        `$${formatCurrency(data.printNetProfit)}`,
        isNetPos ? '#EFF6FF' : '#FEF2F2',
        true,
        isNetPos ? '#1D4ED8' : alertRed,
        isNetPos ? '#3B82F6' : '#EF4444'
      );

      doc.moveDown(0.8);

      // TABLAS
      const drawTableHeader = (cols: { title: string; width: number; align?: 'left' | 'center' | 'right' }[]) => {
        ensureSpace(18);
        const headerY = doc.y;
        doc.rect(doc.page.margins.left, headerY, pageWidth, 15).fillAndStroke('#F1F5F9', lightBorder);

        let curX = doc.page.margins.left;
        cols.forEach(c => {
          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(c.title, curX + 4, headerY + 4, { width: c.width - 8, align: c.align || 'left' });
          curX += c.width;
        });
        doc.y = headerY + 15;
      };

      const drawSectionHeader = (title: string) => {
        ensureSpace(28);
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(darkColor)
          .text(title, doc.page.margins.left, doc.y);
        doc
          .strokeColor(darkColor)
          .lineWidth(0.8)
          .moveTo(doc.page.margins.left, doc.y + 2)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
          .stroke();
        doc.y += 6;
      };

      // 4. TABLA 1: PROYECTOS Y RESUMEN
      drawSectionHeader(`1. PROYECTOS VINCULADOS (${data.printProjects.length})`);
      const projCols = [
        { title: 'PROYECTO', width: pageWidth * 0.46 },
        { title: 'ESTADO', width: pageWidth * 0.16, align: 'center' as const },
        { title: 'PRESUPUESTO', width: pageWidth * 0.19, align: 'right' as const },
        { title: 'TOTAL OBRA', width: pageWidth * 0.19, align: 'right' as const },
      ];
      drawTableHeader(projCols);

      data.printProjects.forEach(p => {
        ensureSpace(18);
        const rowY = doc.y;
        const pExtras = p.project_extras?.reduce((acc: number, e: any) => acc + Number(e.amount_usd), 0) || 0;
        const pTotal = Number(p.budget_usd) + pExtras;
        const isCompleted = p.status === 'completed';

        doc.rect(doc.page.margins.left, rowY, pageWidth, 16).fillAndStroke('#FFFFFF', '#E2E8F0');

        let curX = doc.page.margins.left;

        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor(darkColor)
          .text(`${p.proposal_number ? '#' + p.proposal_number + ' ' : ''}${p.title}`, curX + 4, rowY + 4, { width: projCols[0].width - 8, ellipsis: true });
        curX += projCols[0].width;

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor(isCompleted ? successColor : '#0284C7')
          .text(isCompleted ? 'Completado' : 'En Ejecución', curX + 4, rowY + 4, { width: projCols[1].width - 8, align: 'center' });
        curX += projCols[1].width;

        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor(darkColor)
          .text(`$${formatCurrency(p.budget_usd)}`, curX + 4, rowY + 4, { width: projCols[2].width - 8, align: 'right' });
        curX += projCols[2].width;

        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor(darkColor)
          .text(`$${formatCurrency(pTotal)}`, curX + 4, rowY + 4, { width: projCols[3].width - 8, align: 'right' });

        doc.y = rowY + 16;
      });
      doc.moveDown(0.8);

      // 5. TABLA 2: HISTORIAL DE PAGOS / COBROS
      if (data.printPayments.length > 0) {
        drawSectionHeader(`2. HISTORIAL DE PAGOS Y ABONOS DEL CLIENTE (${data.printPayments.length})`);
        const payCols = [
          { title: 'FECHA', width: pageWidth * 0.15 },
          { title: 'PROYECTO', width: pageWidth * 0.35 },
          { title: 'DESCRIPCIÓN / REFERENCIA', width: pageWidth * 0.32 },
          { title: 'MONTO (USD)', width: pageWidth * 0.18, align: 'right' as const },
        ];
        drawTableHeader(payCols);

        data.printPayments.forEach(pmt => {
          ensureSpace(16);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, 15).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(pmt.payment_date || pmt.created_at?.split('T')[0] || '', curX + 4, rowY + 4, { width: payCols[0].width - 8 });
          curX += payCols[0].width;

          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(`${pmt.proposal_number ? '#' + pmt.proposal_number + ' ' : ''}${pmt.project_title || 'General'}`, curX + 4, rowY + 4, { width: payCols[1].width - 8, ellipsis: true });
          curX += payCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(`${pmt.description || 'Abono'} ${pmt.reference ? `(Ref: ${pmt.reference})` : ''}`, curX + 4, rowY + 4, { width: payCols[2].width - 8, ellipsis: true });
          curX += payCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(successColor)
            .text(`+$${formatCurrency(pmt.amount_usd)}`, curX + 4, rowY + 4, { width: payCols[3].width - 8, align: 'right' });

          doc.y = rowY + 15;
        });
        doc.moveDown(0.8);
      }

      // 6. TABLA 3: GASTOS Y COMPRAS EJECUTADAS
      if (data.printCosts.length > 0) {
        drawSectionHeader(`3. GASTOS Y COMPRAS EJECUTADAS (${data.printCosts.length})`);
        const costCols = [
          { title: 'FECHA', width: pageWidth * 0.14 },
          { title: 'PROVEEDOR / CONCEPTO', width: pageWidth * 0.44 },
          { title: 'PROYECTO', width: pageWidth * 0.24 },
          { title: 'MONTO (USD)', width: pageWidth * 0.18, align: 'right' as const },
        ];
        drawTableHeader(costCols);

        const sortedCosts = [...data.printCosts].sort((a: any, b: any) => {
          const dateA = new Date(a.date || a.created_at).getTime();
          const dateB = new Date(b.date || b.created_at).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });

        sortedCosts.slice(0, 50).forEach(c => {
          ensureSpace(16);
          const rowY = doc.y;
          const totalCost = Number(c.quantity || 1) * Number(c.unit_price_usd || c.amount_usd || 0);

          doc.rect(doc.page.margins.left, rowY, pageWidth, 15).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(c.date || c.created_at?.split('T')[0] || '', curX + 4, rowY + 4, { width: costCols[0].width - 8 });
          curX += costCols[0].width;

          const prov = c.provider || c.supplier;
          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(`${prov ? prov + ': ' : ''}${c.description || ''}`, curX + 4, rowY + 4, { width: costCols[1].width - 8, ellipsis: true });
          curX += costCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(`${c.proposal_number ? '#' + c.proposal_number + ' ' : ''}${c.project_title || 'General'}`, curX + 4, rowY + 4, { width: costCols[2].width - 8, ellipsis: true });
          curX += costCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#B91C1C')
            .text(`-$${formatCurrency(totalCost)}`, curX + 4, rowY + 4, { width: costCols[3].width - 8, align: 'right' });

          doc.y = rowY + 15;
        });
        doc.moveDown(0.8);
      }

      // 7. TABLA 4: COMPROMISOS PENDIENTES (CxP)
      if (data.printCommitments.length > 0) {
        drawSectionHeader(`4. COMPROMISOS PENDIENTES POR PAGAR - CxP (${data.printCommitments.length})`);
        const comCols = [
          { title: 'PROVEEDOR / ACREEDOR', width: pageWidth * 0.35 },
          { title: 'CONCEPTO / DESCRIPCIÓN', width: pageWidth * 0.33 },
          { title: 'TOTAL CxP', width: pageWidth * 0.16, align: 'right' as const },
          { title: 'SALDO PEND.', width: pageWidth * 0.16, align: 'right' as const },
        ];
        drawTableHeader(comCols);

        data.printCommitments.forEach(com => {
          ensureSpace(16);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, 15).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(com.provider || 'Proveedor', curX + 4, rowY + 4, { width: comCols[0].width - 8, ellipsis: true });
          curX += comCols[0].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(com.description || '', curX + 4, rowY + 4, { width: comCols[1].width - 8, ellipsis: true });
          curX += comCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(`$${formatCurrency(com.total_amount || 0)}`, curX + 4, rowY + 4, { width: comCols[2].width - 8, align: 'right' });
          curX += comCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#C2410C')
            .text(`$${formatCurrency(com.balance || 0)}`, curX + 4, rowY + 4, { width: comCols[3].width - 8, align: 'right' });

          doc.y = rowY + 15;
        });
        doc.moveDown(0.8);
      }

      // 8. TABLA 5: ADELANTOS A SOCIOS
      if (data.printAdvances.length > 0) {
        drawSectionHeader(`5. DETALLE DE ADELANTOS A SOCIOS (${data.printAdvances.length})`);
        const advCols = [
          { title: 'FECHA', width: pageWidth * 0.15 },
          { title: 'SOCIO', width: pageWidth * 0.35 },
          { title: 'CONCEPTO / NOTA', width: pageWidth * 0.32 },
          { title: 'MONTO (USD)', width: pageWidth * 0.18, align: 'right' as const },
        ];
        drawTableHeader(advCols);

        data.printAdvances.forEach(adv => {
          ensureSpace(16);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, 15).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(adv.date || adv.created_at?.split('T')[0] || '', curX + 4, rowY + 4, { width: advCols[0].width - 8 });
          curX += advCols[0].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#6D28D9')
            .text(adv.partner_name || 'Socio', curX + 4, rowY + 4, { width: advCols[1].width - 8 });
          curX += advCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(adv.notes || 'Retiro a cuenta de utilidad', curX + 4, rowY + 4, { width: advCols[2].width - 8, ellipsis: true });
          curX += advCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#6D28D9')
            .text(`$${formatCurrency(adv.amount_usd)}`, curX + 4, rowY + 4, { width: advCols[3].width - 8, align: 'right' });

          doc.y = rowY + 15;
        });
      }

      // FOOTER ON ALL PAGES
      const range = doc.bufferedPageRange();
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(p);
        const footerY = doc.page.height - doc.page.margins.bottom + 12;

        doc
          .strokeColor(lightBorder)
          .lineWidth(0.5)
          .moveTo(doc.page.margins.left, footerY - 4)
          .lineTo(doc.page.width - doc.page.margins.right, footerY - 4)
          .stroke();

        doc
          .fontSize(7)
          .font('Helvetica-Bold')
          .fillColor(grayColor)
          .text('P&P CONSTRUYE • Control Financiero y Gerencial de Obras', doc.page.margins.left, footerY, { width: pageWidth / 2, align: 'left' });

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor(grayColor)
          .text(`Página ${p + 1} de ${range.count}`, doc.page.width - doc.page.margins.right - (pageWidth / 2), footerY, { width: pageWidth / 2, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
