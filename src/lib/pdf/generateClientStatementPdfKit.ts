import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { formatCurrency } from '@/lib/formatters';
import { parseProjectRelation } from '@/lib/projectRelationsHelper';

export interface ClientStatementData {
  client: any;
  dateStr?: string;
  activeProjectsCount: number;
  printProjects: any[];
  printPayments: any[];
  printExtras: any[];
  printTotalContracted: number;
  printTotalPaid: number;
  printBalanceDue: number;
}

export function generateClientStatementPdfKit(data: ClientStatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 45, left: 40, right: 40 },
        info: {
          Title: `Estado de Cuenta - ${data.client?.name || 'Cliente'}`,
          Author: 'P&P Construye',
          Subject: 'Estado de Cuenta y Balance Financiero'
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
          doc.fontSize(16).font('Helvetica-Bold').fillColor(copperColor).text('P&P CONSTRUYE', doc.page.margins.left, startY);
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(copperColor).text('P&P CONSTRUYE', doc.page.margins.left, startY);
      }

      const headerRightX = doc.page.width - doc.page.margins.right - 260;
      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text('ESTADO DE CUENTA', headerRightX, startY, { width: 260, align: 'right' });

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(grayColor)
        .text('Ingeniería, Arquitectura y Construcción', headerRightX, doc.y + 2, { width: 260, align: 'right' });

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(`Fecha de Emisión: ${data.dateStr || new Date().toLocaleDateString('es-VE')}`, headerRightX, doc.y + 2, { width: 260, align: 'right' });

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(`Proyectos incluidos: ${data.printProjects.length} de ${data.activeProjectsCount}`, headerRightX, doc.y + 2, { width: 260, align: 'right' });

      doc.y = Math.max(doc.y, startY + 54);

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
        .rect(doc.page.margins.left, clientBoxY, pageWidth, 48)
        .fillAndStroke(tableBg, lightBorder);

      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text(`CLIENTE: ${(data.client?.name || 'N/A').toUpperCase()}`, doc.page.margins.left + 10, clientBoxY + 7);

      const colW = (pageWidth - 20) / 3;
      const row1Y = clientBoxY + 22;
      const row2Y = clientBoxY + 34;

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(`Empresa: ${data.client?.company_name || 'N/A'}`, doc.page.margins.left + 10, row1Y, { width: colW, ellipsis: true })
        .text(`RIF / CI: ${data.client?.tax_id || 'N/A'}`, doc.page.margins.left + 10 + colW, row1Y, { width: colW, ellipsis: true })
        .text(`Teléfono: ${data.client?.phone || 'N/A'}`, doc.page.margins.left + 10 + colW * 2, row1Y, { width: colW, ellipsis: true })
        .text(`Email: ${data.client?.email || 'N/A'}`, doc.page.margins.left + 10, row2Y, { width: colW * 2, ellipsis: true })
        .text(`Dirección: ${data.client?.address || 'N/A'}`, doc.page.margins.left + 10 + colW * 2, row2Y, { width: colW, ellipsis: true });

      doc.y = clientBoxY + 56;

      // 3. FINANCIAL SUMMARY (RESUMEN GENERAL)
      ensureSpace(95);
      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text('RESUMEN GENERAL', doc.page.margins.left, doc.y);

      doc
        .strokeColor(darkColor)
        .lineWidth(0.8)
        .moveTo(doc.page.margins.left, doc.y + 2)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
        .stroke();

      doc.y += 6;

      const baseBudgets = data.printProjects.reduce((s: number, p: any) => s + Number(p.budget_usd || 0), 0);
      const totalExtras = data.printExtras.reduce((s: number, e: any) => s + Number(e.amount_usd || 0), 0);

      const drawSummaryRow = (label: string, value: string, bg: string, fontBold = false, textColor = darkColor, borderCol = lightBorder) => {
        const y = doc.y;
        doc.rect(doc.page.margins.left, y, pageWidth, 17).fillAndStroke(bg, borderCol);
        doc
          .fontSize(8)
          .font(fontBold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(textColor)
          .text(label, doc.page.margins.left + 8, y + 4, { width: pageWidth * 0.60 });
        doc
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .fillColor(textColor)
          .text(value, doc.page.width - doc.page.margins.right - (pageWidth * 0.38) - 8, y + 4, { width: pageWidth * 0.38, align: 'right' });
        doc.y = y + 17;
      };

      drawSummaryRow('Presupuestos Base Acordados:', `$${formatCurrency(baseBudgets)}`, '#FFFFFF');
      if (data.printExtras.length > 0) {
        drawSummaryRow(`Total Trabajos Adicionales Aprobados (${data.printExtras.length}):`, `+$${formatCurrency(totalExtras)}`, '#FFFFFF', false, '#0369A1');
      }
      drawSummaryRow('TOTAL CONTRATADO / INVERSIÓN:', `$${formatCurrency(data.printTotalContracted)}`, '#F1F5F9', true, darkColor, '#94A3B8');
      drawSummaryRow('TOTAL ABONADO / PAGADO:', `-$${formatCurrency(data.printTotalPaid)}`, '#F0FDF4', true, successColor, '#86EFAC');

      const isDebt = data.printBalanceDue > 0.01;
      drawSummaryRow(
        'SALDO PENDIENTE POR PAGAR:',
        `$${formatCurrency(data.printBalanceDue)}`,
        isDebt ? '#FFFBEB' : '#F0FDF4',
        true,
        isDebt ? '#B45309' : successColor,
        isDebt ? '#F59E0B' : '#10B981'
      );

      doc.moveDown(0.9);

      // HELPER TABLE FUNCTIONS CON ALINEACIÓN PERFECTA
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

      // 4. TABLA 1: PROYECTOS Y PRESUPUESTOS CONTRATADOS
      drawSectionHeader(`1. PROYECTOS Y PRESUPUESTOS CONTRATADOS (${data.printProjects.length})`);
      const projCols = [
        { title: 'PROYECTO / CONTRATO', width: pageWidth * 0.44 },
        { title: 'ESTADO', width: pageWidth * 0.14, align: 'center' as const },
        { title: 'FECHA', width: pageWidth * 0.12, align: 'center' as const },
        { title: 'BASE (USD)', width: pageWidth * 0.15, align: 'right' as const },
        { title: 'TOTAL CONTRATO', width: pageWidth * 0.15, align: 'right' as const },
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
          .text(`${p.proposal_number ? '#' + p.proposal_number + ' - ' : ''}${p.title}`, curX + 4, rowY + 4, { width: projCols[0].width - 8, ellipsis: true });
        curX += projCols[0].width;

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor(isCompleted ? successColor : '#0284C7')
          .text(isCompleted ? 'Completado' : 'En Ejecución', curX + 4, rowY + 4, { width: projCols[1].width - 8, align: 'center' });
        curX += projCols[1].width;

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor(grayColor)
          .text(p.start_date || p.created_at?.split('T')[0] || '-', curX + 4, rowY + 4, { width: projCols[2].width - 8, align: 'center' });
        curX += projCols[2].width;

        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor(darkColor)
          .text(`$${formatCurrency(p.budget_usd)}`, curX + 4, rowY + 4, { width: projCols[3].width - 8, align: 'right' });
        curX += projCols[3].width;

        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor(darkColor)
          .text(`$${formatCurrency(pTotal)}`, curX + 4, rowY + 4, { width: projCols[4].width - 8, align: 'right' });

        doc.y = rowY + 16;
      });
      doc.moveDown(0.8);

      // 5. TABLA 2: TRABAJOS ADICIONALES (SI HAY)
      if (data.printExtras.length > 0) {
        drawSectionHeader(`2. TRABAJOS ADICIONALES APROBADOS (${data.printExtras.length})`);
        const extraCols = [
          { title: 'DESCRIPCIÓN DEL TRABAJO ADICIONAL', width: pageWidth * 0.52 },
          { title: 'PROYECTO', width: pageWidth * 0.28 },
          { title: 'MONTO (USD)', width: pageWidth * 0.20, align: 'right' as const },
        ];
        drawTableHeader(extraCols);

        data.printExtras.forEach(e => {
          ensureSpace(16);
          const rowY = doc.y;
          doc.rect(doc.page.margins.left, rowY, pageWidth, 15).fillAndStroke('#FFFFFF', '#E2E8F0');

          let curX = doc.page.margins.left;

          doc
            .fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(e.description || 'Trabajo adicional', curX + 4, rowY + 4, { width: extraCols[0].width - 8, ellipsis: true });
          curX += extraCols[0].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(`${e.proposal_number ? '#' + e.proposal_number + ' - ' : ''}${e.project_title || 'General'}`, curX + 4, rowY + 4, { width: extraCols[1].width - 8, ellipsis: true });
          curX += extraCols[1].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor('#0369A1')
            .text(`+$${formatCurrency(e.amount_usd)}`, curX + 4, rowY + 4, { width: extraCols[2].width - 8, align: 'right' });

          doc.y = rowY + 15;
        });
        doc.moveDown(0.8);
      }

      // 6. TABLA 3: HISTORIAL DE ABONOS Y PAGOS REALIZADOS
      const paySectionNum = data.printExtras.length > 0 ? '3' : '2';
      drawSectionHeader(`${paySectionNum}. HISTORIAL DE ABONOS Y PAGOS REALIZADOS (${data.printPayments.length})`);
      const payCols = [
        { title: 'FECHA', width: pageWidth * 0.14 },
        { title: 'PROYECTO AFECTADO', width: pageWidth * 0.32 },
        { title: 'DETALLE / REFERENCIA', width: pageWidth * 0.36 },
        { title: 'MONTO ABONADO', width: pageWidth * 0.18, align: 'right' as const },
      ];
      drawTableHeader(payCols);

      if (data.printPayments.length === 0) {
        ensureSpace(16);
        const rowY = doc.y;
        doc.rect(doc.page.margins.left, rowY, pageWidth, 15).fillAndStroke('#FFFFFF', '#E2E8F0');
        doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(grayColor).text('No se registran abonos en el período.', doc.page.margins.left + 8, rowY + 4);
        doc.y = rowY + 15;
      } else {
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
            .text(`${pmt.proposal_number ? '#' + pmt.proposal_number + ' - ' : ''}${pmt.project_title || 'General'}`, curX + 4, rowY + 4, { width: payCols[1].width - 8, ellipsis: true });
          curX += payCols[1].width;

          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(grayColor)
            .text(`${pmt.description || 'Abono recibido'} ${pmt.reference ? `(Ref: ${pmt.reference})` : ''}`, curX + 4, rowY + 4, { width: payCols[2].width - 8, ellipsis: true });
          curX += payCols[2].width;

          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(successColor)
            .text(`+$${formatCurrency(pmt.amount_usd)}`, curX + 4, rowY + 4, { width: payCols[3].width - 8, align: 'right' });

          doc.y = rowY + 15;
        });
      }
      doc.moveDown(0.9);

      // 7. PAYMENT METHODS BOX
      ensureSpace(50);
      const bankBoxY = doc.y;
      doc.rect(doc.page.margins.left, bankBoxY, pageWidth, 42).fillAndStroke('#F8FAFC', lightBorder);

      doc
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .fillColor(copperColor)
        .text('DATOS PARA TRANSFERENCIAS Y PAGOS:', doc.page.margins.left + 8, bankBoxY + 6);

      const bankColW = (pageWidth - 16) / 3;
      const bRowY = bankBoxY + 18;

      doc
        .fontSize(6.8)
        .font('Helvetica')
        .fillColor(darkColor)
        .text('Zelle (USD):\nlosberspp@gmail.com\nTitular: Losbers Perez', doc.page.margins.left + 8, bRowY, { width: bankColW })
        .text('Banesco Panamá (USD):\nCta: 0101-0023-4567\nP&P Construye C.A.', doc.page.margins.left + 8 + bankColW, bRowY, { width: bankColW })
        .text('Pago Móvil / Bs:\nBanesco (0134) - CI 19.876.543\n0412-5007089 (Tasa BCV)', doc.page.margins.left + 8 + bankColW * 2, bRowY, { width: bankColW });

      doc.y = bankBoxY + 50;

      // 8. SIGNATURE SECTION
      ensureSpace(45);
      const signY = doc.y + 15;
      const signColW = 180;

      // Left signature (P&P)
      doc
        .strokeColor(lightBorder)
        .lineWidth(1)
        .moveTo(doc.page.margins.left + 20, signY + 15)
        .lineTo(doc.page.margins.left + 20 + signColW, signY + 15)
        .stroke();

      doc
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text('P&P CONSTRUYE', doc.page.margins.left + 20, signY + 20, { width: signColW, align: 'center' });
      doc
        .fontSize(6.8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text('Gerencia de Operaciones y Finanzas', doc.page.margins.left + 20, signY + 29, { width: signColW, align: 'center' });

      // Right signature (Client)
      const rightSignX = doc.page.width - doc.page.margins.right - signColW - 20;
      doc
        .strokeColor(lightBorder)
        .lineWidth(1)
        .moveTo(rightSignX, signY + 15)
        .lineTo(rightSignX + signColW, signY + 15)
        .stroke();

      doc
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text((data.client?.name || 'CLIENTE CONFORME').toUpperCase(), rightSignX, signY + 20, { width: signColW, align: 'center' });
      doc
        .fontSize(6.8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text('Aceptación de Estado de Cuenta / Firma', rightSignX, signY + 29, { width: signColW, align: 'center' });

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
          .text('P&P CONSTRUYE • Del Plano a la Realidad • Estado de Cuenta Oficial', doc.page.margins.left, footerY, { width: pageWidth / 2, align: 'left' });

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
