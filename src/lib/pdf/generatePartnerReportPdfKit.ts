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

      const measureRowHeight = (cells: { text: string; width: number; fontSize: number; font?: string }[]) => {
        let maxH = 0;
        cells.forEach(c => {
          if (c.font) doc.font(c.font);
          doc.fontSize(c.fontSize);
          const h = doc.heightOfString(c.text || '', { width: c.width - 8 });
          if (h > maxH) maxH = h;
        });
        return Math.max(15, maxH + 8);
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
      ensureSpace(210);
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

      const drawKpiRow = (
        label: string,
        value: string,
        bg: string,
        fontBold = false,
        textColor = darkColor,
        borderCol = lightBorder,
        isIndent = false,
        height = 16
      ) => {
        const y = doc.y;
        doc.rect(doc.page.margins.left, y, pageWidth, height).fillAndStroke(bg, borderCol);
        doc
          .fontSize(isIndent ? 7.2 : 7.8)
          .font(fontBold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(textColor)
          .text(label, doc.page.margins.left + (isIndent ? 18 : 8), y + (height === 14 ? 3 : 4), { width: pageWidth * (isIndent ? 0.58 : 0.60) });
        if (value) {
          doc
            .fontSize(isIndent ? 7.8 : 8.5)
            .font('Helvetica-Bold')
            .fillColor(textColor)
            .text(value, doc.page.width - doc.page.margins.right - (pageWidth * 0.38) - 8, y + (height === 14 ? 3 : 4), { width: pageWidth * 0.38, align: 'right' });
        }
        doc.y = y + height;
      };

      const partnerShare = data.printEstimatedProfit / 2;
      const hAdv = data.henryAdvances ?? 0;
      const lAdv = data.losbersAdvances ?? 0;
      const henrySaldo = partnerShare - hAdv;
      const losbersSaldo = partnerShare - lAdv;

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
      drawKpiRow(
        '   ↳ Participación Base Estimada (50% por Socio):',
        `$${formatCurrency(partnerShare)} c/u`,
        '#F8FAFC',
        false,
        '#334155',
        lightBorder,
        true,
        14
      );

      drawKpiRow(
        '7. RETIROS / ADELANTOS REALIZADOS POR SOCIOS:',
        `-$${formatCurrency(data.printTotalAdvances)}`,
        '#FAF5FF',
        true,
        '#6B21A8',
        '#C084FC'
      );
      drawKpiRow(
        '   ↳ Retirado por Henry Peraza:',
        `-$${formatCurrency(hAdv)}`,
        '#FAF5FF',
        false,
        '#6B21A8',
        lightBorder,
        true,
        14
      );
      drawKpiRow(
        '   ↳ Retirado por Losbers Pérez:',
        `-$${formatCurrency(lAdv)}`,
        '#FAF5FF',
        false,
        '#6B21A8',
        lightBorder,
        true,
        14
      );

      const isNetPos = data.printNetProfit >= 0;
      drawKpiRow(
        '8. SALDO DE UTILIDAD DISPONIBLE INDIVIDUAL (50% Margen - Retiros):',
        '',
        '#F8FAFC',
        true,
        darkColor,
        lightBorder
      );
      drawKpiRow(
        '   • Saldo Disponible Henry Peraza:',
        `${henrySaldo >= 0 ? '$' : '-$'}${formatCurrency(Math.abs(henrySaldo))}${henrySaldo < 0 ? ' (Excedido)' : ''}`,
        henrySaldo >= 0 ? '#EFF6FF' : '#FEF2F2',
        true,
        henrySaldo >= 0 ? '#1D4ED8' : alertRed,
        lightBorder,
        true,
        15
      );
      drawKpiRow(
        '   • Saldo Disponible Losbers Pérez:',
        `${losbersSaldo >= 0 ? '$' : '-$'}${formatCurrency(Math.abs(losbersSaldo))}${losbersSaldo < 0 ? ' (Excedido)' : ''}`,
        losbersSaldo >= 0 ? '#EFF6FF' : '#FEF2F2',
        true,
        losbersSaldo >= 0 ? '#1D4ED8' : alertRed,
        lightBorder,
        true,
        15
      );
      drawKpiRow(
        'UTILIDAD NETA TOTAL REMANENTE EN CAJA / OBRA:',
        `$${formatCurrency(data.printNetProfit)}`,
        isNetPos ? '#EFF6FF' : '#FEF2F2',
        true,
        isNetPos ? '#1D4ED8' : alertRed,
        isNetPos ? '#3B82F6' : '#EF4444',
        false,
        16
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
        const pExtras = p.project_extras?.reduce((acc: number, e: any) => acc + Number(e.amount_usd), 0) || 0;
        const pTotal = Number(p.budget_usd) + pExtras;
        const isCompleted = p.status === 'completed';

        const titleText = `${p.proposal_number ? '#' + p.proposal_number + ' ' : ''}${p.title}`;
        const statusText = isCompleted ? 'Completado' : 'En Ejecución';
        const budgetText = `$${formatCurrency(p.budget_usd)}`;
        const totalText = `$${formatCurrency(pTotal)}`;

        const rowHeight = measureRowHeight([
          { text: titleText, width: projCols[0].width, fontSize: 7.5, font: 'Helvetica-Bold' },
          { text: statusText, width: projCols[1].width, fontSize: 7, font: 'Helvetica' },
          { text: budgetText, width: projCols[2].width, fontSize: 7.5, font: 'Helvetica' },
          { text: totalText, width: projCols[3].width, fontSize: 7.5, font: 'Helvetica-Bold' }
        ]);

        ensureSpace(rowHeight);
        const rowY = doc.y;

        doc.rect(doc.page.margins.left, rowY, pageWidth, rowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');

        let curX = doc.page.margins.left;

        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor(darkColor)
          .text(titleText, curX + 4, rowY + 4, { width: projCols[0].width - 8 });
        curX += projCols[0].width;

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor(isCompleted ? successColor : '#0284C7')
          .text(statusText, curX + 4, rowY + 4, { width: projCols[1].width - 8, align: 'center' });
        curX += projCols[1].width;

        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor(darkColor)
          .text(budgetText, curX + 4, rowY + 4, { width: projCols[2].width - 8, align: 'right' });
        curX += projCols[2].width;

        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor(darkColor)
          .text(totalText, curX + 4, rowY + 4, { width: projCols[3].width - 8, align: 'right' });

        doc.y = rowY + rowHeight;
      });
      doc.moveDown(0.8);

      // 5. TABLA 2: HISTORIAL DE PAGOS / COBROS
      if (data.printPayments.length > 0) {
        drawSectionHeader(`2. HISTORIAL DE PAGOS Y ABONOS DEL CLIENTE (${data.printPayments.length})`);
        const payCols = [
          { title: 'FECHA', width: pageWidth * 0.12 },
          { title: 'PROYECTO', width: pageWidth * 0.30 },
          { title: 'DESCRIPCIÓN / REFERENCIA', width: pageWidth * 0.40 },
          { title: 'MONTO (USD)', width: pageWidth * 0.18, align: 'right' as const },
        ];
        drawTableHeader(payCols);

        const sortedPayments = [...data.printPayments].sort((a: any, b: any) => {
          const dateA = new Date(a.date || a.payment_date || a.created_at).getTime();
          const dateB = new Date(b.date || b.payment_date || b.created_at).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });

        sortedPayments.forEach(pmt => {
          const dateText = pmt.date || pmt.payment_date || pmt.created_at?.split('T')[0] || '';
          const projectText = `${pmt.proposal_number ? '#' + pmt.proposal_number + ' ' : ''}${pmt.project_title || 'General'}`;
          const descText = `${pmt.description || 'Abono'} ${pmt.reference ? `(Ref: ${pmt.reference})` : ''}`;
          const amountText = `+$${formatCurrency(pmt.amount_usd)}`;

          const rowHeight = measureRowHeight([
            { text: dateText, width: payCols[0].width, fontSize: 7, font: 'Helvetica' },
            { text: projectText, width: payCols[1].width, fontSize: 7, font: 'Helvetica-Bold' },
            { text: descText, width: payCols[2].width, fontSize: 7, font: 'Helvetica' },
            { text: amountText, width: payCols[3].width, fontSize: 7.5, font: 'Helvetica-Bold' }
          ]);

          ensureSpace(rowHeight);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, rowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(dateText, curX + 4, rowY + 4, { width: payCols[0].width - 8 });
          curX += payCols[0].width;

          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(projectText, curX + 4, rowY + 4, { width: payCols[1].width - 8 });
          curX += payCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(descText, curX + 4, rowY + 4, { width: payCols[2].width - 8 });
          curX += payCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(successColor)
            .text(amountText, curX + 4, rowY + 4, { width: payCols[3].width - 8, align: 'right' });

          doc.y = rowY + rowHeight;
        });
        doc.moveDown(0.8);
      }

      // 6. TABLA 3: GASTOS Y COMPRAS EJECUTADAS
      if (data.printCosts.length > 0) {
        drawSectionHeader(`3. GASTOS Y COMPRAS EJECUTADAS (${data.printCosts.length})`);
        const costCols = [
          { title: 'FECHA', width: pageWidth * 0.11 },
          { title: 'PROVEEDOR / CONCEPTO', width: pageWidth * 0.39 },
          { title: 'PROYECTO', width: pageWidth * 0.32 },
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
          const totalCost = Number(c.quantity || 1) * Number(c.unit_price_usd || c.amount_usd || 0);
          const dateText = c.date || c.created_at?.split('T')[0] || '';
          const prov = c.provider || c.supplier;
          const descText = `${prov ? prov + ': ' : ''}${c.description || ''}`;
          const projText = `${c.proposal_number ? '#' + c.proposal_number + ' ' : ''}${c.project_title || 'General'}`;
          const amountText = `-$${formatCurrency(totalCost)}`;

          const rowHeight = measureRowHeight([
            { text: dateText, width: costCols[0].width, fontSize: 7, font: 'Helvetica' },
            { text: descText, width: costCols[1].width, fontSize: 7, font: 'Helvetica-Bold' },
            { text: projText, width: costCols[2].width, fontSize: 7, font: 'Helvetica' },
            { text: amountText, width: costCols[3].width, fontSize: 7.5, font: 'Helvetica-Bold' }
          ]);

          ensureSpace(rowHeight);
          const rowY = doc.y;

          doc.rect(doc.page.margins.left, rowY, pageWidth, rowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(dateText, curX + 4, rowY + 4, { width: costCols[0].width - 8 });
          curX += costCols[0].width;

          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(descText, curX + 4, rowY + 4, { width: costCols[1].width - 8 });
          curX += costCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(projText, curX + 4, rowY + 4, { width: costCols[2].width - 8 });
          curX += costCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#B91C1C')
            .text(amountText, curX + 4, rowY + 4, { width: costCols[3].width - 8, align: 'right' });

          doc.y = rowY + rowHeight;
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
          const provText = com.provider || 'Proveedor';
          const descText = com.description || '';
          const totalText = `$${formatCurrency(com.total_amount || 0)}`;
          const balText = `$${formatCurrency(com.balance || 0)}`;

          const rowHeight = measureRowHeight([
            { text: provText, width: comCols[0].width, fontSize: 7, font: 'Helvetica-Bold' },
            { text: descText, width: comCols[1].width, fontSize: 7, font: 'Helvetica' },
            { text: totalText, width: comCols[2].width, fontSize: 7, font: 'Helvetica' },
            { text: balText, width: comCols[3].width, fontSize: 7.5, font: 'Helvetica-Bold' }
          ]);

          ensureSpace(rowHeight);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, rowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(provText, curX + 4, rowY + 4, { width: comCols[0].width - 8 });
          curX += comCols[0].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(descText, curX + 4, rowY + 4, { width: comCols[1].width - 8 });
          curX += comCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(totalText, curX + 4, rowY + 4, { width: comCols[2].width - 8, align: 'right' });
          curX += comCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#C2410C')
            .text(balText, curX + 4, rowY + 4, { width: comCols[3].width - 8, align: 'right' });

          doc.y = rowY + rowHeight;
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
          const dateText = adv.date || adv.created_at?.split('T')[0] || '';
          const partnerText = adv.partner_name || 'Socio';
          const notesText = adv.notes || 'Retiro a cuenta de utilidad';
          const amountText = `$${formatCurrency(adv.amount_usd)}`;

          const rowHeight = measureRowHeight([
            { text: dateText, width: advCols[0].width, fontSize: 7, font: 'Helvetica' },
            { text: partnerText, width: advCols[1].width, fontSize: 7.5, font: 'Helvetica-Bold' },
            { text: notesText, width: advCols[2].width, fontSize: 7, font: 'Helvetica' },
            { text: amountText, width: advCols[3].width, fontSize: 7.5, font: 'Helvetica-Bold' }
          ]);

          ensureSpace(rowHeight);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, rowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(dateText, curX + 4, rowY + 4, { width: advCols[0].width - 8 });
          curX += advCols[0].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#6D28D9')
            .text(partnerText, curX + 4, rowY + 4, { width: advCols[1].width - 8 });
          curX += advCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(notesText, curX + 4, rowY + 4, { width: advCols[2].width - 8 });
          curX += advCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#6D28D9')
            .text(amountText, curX + 4, rowY + 4, { width: advCols[3].width - 8, align: 'right' });

          doc.y = rowY + rowHeight;
        });

        // Totales de retiros por socio
        const drawAdvSummaryRow = (label: string, val: string, isTotal = false) => {
          ensureSpace(16);
          const sY = doc.y;
          doc.rect(doc.page.margins.left, sY, pageWidth, 15).fillAndStroke(isTotal ? '#FAF5FF' : '#F8FAFC', isTotal ? '#C084FC' : '#E2E8F0');
          doc
            .fontSize(7.2)
            .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
            .fillColor(isTotal ? '#6D28D9' : darkColor)
            .text(label, doc.page.margins.left + 8, sY + 4, { width: pageWidth - 140, align: 'right' });
          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(isTotal ? '#6D28D9' : darkColor)
            .text(val, doc.page.width - doc.page.margins.right - 120, sY + 4, { width: 112, align: 'right' });
          doc.y = sY + 15;
        };

        drawAdvSummaryRow('Total Retiros Henry Peraza:', `$${formatCurrency(hAdv)}`);
        drawAdvSummaryRow('Total Retiros Losbers Pérez:', `$${formatCurrency(lAdv)}`);
        drawAdvSummaryRow('TOTAL RETIRADO POR SOCIOS:', `$${formatCurrency(data.printTotalAdvances)}`, true);
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
