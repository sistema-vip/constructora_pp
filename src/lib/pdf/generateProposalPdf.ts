import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface ProposalData {
  proposal_number?: number | string;
  date?: string;
  title: string;
  client_name?: string;
  client_tax_id?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  budget_usd?: number;
  budget_ves?: number;
  description?: string;
}

export function generateProposalPdfBuffer(data: ProposalData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        info: {
          Title: `Propuesta ${data.proposal_number ? 'N° ' + data.proposal_number : ''} - ${data.title}`,
          Author: 'P&P Construye',
          Subject: 'Propuesta Técnica y Económica'
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
      const lightBorder = '#E0E0E0';
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // 1. HEADER (Logo + Proposal Number & Date)
      const logoPath = path.join(process.cwd(), 'public', 'logo_3d.png');
      const startY = doc.y;

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, doc.page.margins.left, startY - 10, { width: 90, height: 65, fit: [90, 65] });
        } catch {
          doc.fontSize(16).fillColor(copperColor).text('P&P CONSTRUYE', doc.page.margins.left, startY);
        }
      } else {
        doc.fontSize(16).fillColor(copperColor).text('P&P CONSTRUYE', doc.page.margins.left, startY);
      }

      const headerRightX = doc.page.width - doc.page.margins.right - 200;
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(copperColor)
        .text(
          data.proposal_number ? `PROPUESTA N° ${data.proposal_number}` : 'PROPUESTA TÉCNICA',
          headerRightX,
          startY,
          { width: 200, align: 'right' }
        );

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(
          `Fecha: ${data.date || new Date().toLocaleDateString('es-VE')}`,
          headerRightX,
          doc.y + 3,
          { width: 200, align: 'right' }
        );

      doc.y = Math.max(doc.y, startY + 60);

      // Copper divider line
      doc
        .strokeColor(copperColor)
        .lineWidth(2)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();

      doc.moveDown(0.8);

      // 2. PARSE CONTENT LINES
      const lines = (data.description || '').split('\n');

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
        'resumen financiero y ejecución'
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
        const rawLine = lines[i].trim();
        if (!rawLine) {
          doc.moveDown(0.3);
          continue;
        }

        const cleanLine = rawLine
          .replace(/^\*{1,2}|\*{1,2}$/g, '')
          .replace(/^#+\s*/, '')
          .trim();
        const lowerLine = cleanLine.toLowerCase();
        const isCustomHeader =
          (rawLine.startsWith('**') && rawLine.endsWith('**') && cleanLine.length > 0 && cleanLine.length < 60 && !cleanLine.includes(':')) ||
          (rawLine.startsWith('#') && cleanLine.length < 60);

        // Check if page break is needed
        if (doc.y > doc.page.height - doc.page.margins.bottom - 70) {
          doc.addPage();
        }

        // Check Section Header
        if (headers.includes(lowerLine) || isCustomHeader) {
          doc.moveDown(0.6);
          const currentY = doc.y;

          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(cleanLine, doc.page.margins.left, currentY);

          doc.moveDown(0.2);
          doc
            .strokeColor(lightBorder)
            .lineWidth(0.75)
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right, doc.y)
            .stroke();

          doc.moveDown(0.4);
          continue;
        }

        // Check Key-Value pair
        const colonIdx = rawLine.indexOf(':');
        if (colonIdx > 0 && colonIdx < 35) {
          const possibleLabel = rawLine.substring(0, colonIdx).replace(/\*\*/g, '').trim();
          const value = rawLine.substring(colonIdx + 1).replace(/\*\*/g, '').trim();
          const lowerLabel = possibleLabel.toLowerCase();

          if (
            labels.includes(lowerLabel) ||
            lowerLabel.includes('inversión total') ||
            lowerLabel.includes('proyecto') ||
            lowerLabel.includes('para') ||
            lowerLabel.includes('fecha') ||
            lowerLabel.includes('área')
          ) {
            // Check if it is the Total Investment highlight
            if (lowerLabel.includes('inversión total')) {
              doc.moveDown(0.4);
              const boxY = doc.y;
              doc
                .rect(doc.page.margins.left, boxY, pageWidth, 28)
                .fillAndStroke('#FBF7F2', copperColor);

              doc
                .fontSize(11)
                .font('Helvetica-Bold')
                .fillColor(copperColor)
                .text(`${possibleLabel.toUpperCase()}: ${value}`, doc.page.margins.left + 12, boxY + 8, {
                  width: pageWidth - 24,
                  align: 'center'
                });

              doc.y = boxY + 34;
              continue;
            }

            doc
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .fillColor(darkColor)
              .text(`${possibleLabel}: `, doc.page.margins.left, doc.y, { continued: true })
              .font('Helvetica')
              .fillColor(grayColor)
              .text(value);

            doc.moveDown(0.2);
            continue;
          }
        }

        // Check List items or Price Breakdowns
        const isListItem = /^[-\*•\d]+[\s\.-]/.test(rawLine);
        if (isListItem) {
          const match = rawLine.match(/^([-\*•\d]+[\s\.-]*)(.*)/);
          const bullet = match ? match[1].replace(/\*\*/g, '') : '•';
          const content = match ? match[2].replace(/\*\*/g, '') : rawLine.replace(/\*\*/g, '');

          if (content.includes('.... $')) {
            const parts = content.split('.... $');
            const desc = parts[0].trim();
            const price = `$${parts[1].trim()}`;

            const itemY = doc.y;
            const priceWidth = 80;
            const textWidth = pageWidth - priceWidth - 20;

            doc
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .fillColor(darkColor)
              .text(bullet, doc.page.margins.left + 5, itemY, { width: 15 });

            doc
              .fontSize(9.5)
              .font('Helvetica')
              .fillColor(darkColor)
              .text(desc, doc.page.margins.left + 22, itemY, { width: textWidth });

            doc
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .fillColor(copperColor)
              .text(price, doc.page.width - doc.page.margins.right - priceWidth, itemY, {
                width: priceWidth,
                align: 'right'
              });

            doc.moveDown(0.3);
            continue;
          }

          const itemY = doc.y;
          doc
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .fillColor(darkColor)
            .text(bullet, doc.page.margins.left + 5, itemY, { width: 15 });

          doc
            .fontSize(9.5)
            .font('Helvetica')
            .fillColor(darkColor)
            .text(content, doc.page.margins.left + 22, itemY, {
              width: pageWidth - 25,
              align: 'justify',
              lineGap: 2
            });

          doc.moveDown(0.3);
          continue;
        }

        // Regular Paragraph
        const cleanParagraph = rawLine.replace(/\*\*/g, '');
        doc
          .fontSize(9.5)
          .font('Helvetica')
          .fillColor(darkColor)
          .text(cleanParagraph, doc.page.margins.left, doc.y, {
            width: pageWidth,
            align: 'justify',
            lineGap: 2.5
          });

        doc.moveDown(0.3);
      }

      // 3. SIGNATURE & APPROVAL BLOCK
      if (doc.y > doc.page.height - doc.page.margins.bottom - 90) {
        doc.addPage();
      }

      doc.moveDown(1.5);
      const signY = doc.y;
      const colWidth = (pageWidth - 40) / 2;

      // Contractor Signature
      doc
        .strokeColor(lightBorder)
        .lineWidth(1)
        .moveTo(doc.page.margins.left, signY + 35)
        .lineTo(doc.page.margins.left + colWidth, signY + 35)
        .stroke();

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text('P&P CONSTRUYE', doc.page.margins.left, signY + 40, { width: colWidth, align: 'center' });
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text('Firma y Sello Autorizado', doc.page.margins.left, signY + 52, { width: colWidth, align: 'center' });

      // Client Signature
      const rightColX = doc.page.width - doc.page.margins.right - colWidth;
      doc
        .strokeColor(lightBorder)
        .lineWidth(1)
        .moveTo(rightColX, signY + 35)
        .lineTo(rightColX + colWidth, signY + 35)
        .stroke();

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(darkColor)
        .text(data.client_name || 'CLIENTE CONFORME', rightColX, signY + 40, { width: colWidth, align: 'center' });
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(grayColor)
        .text('Aceptación de Presupuesto / Firma', rightColX, signY + 52, { width: colWidth, align: 'center' });

      // 4. FOOTER ON ALL PAGES
      const range = doc.bufferedPageRange();
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(p);
        const footerY = doc.page.height - doc.page.margins.bottom + 10;

        doc
          .strokeColor(lightBorder)
          .lineWidth(0.5)
          .moveTo(doc.page.margins.left, footerY - 5)
          .lineTo(doc.page.width - doc.page.margins.right, footerY - 5)
          .stroke();

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(grayColor)
          .text(
            'P&P Construye • Del Plano a la Realidad',
            doc.page.margins.left,
            footerY,
            { align: 'left', width: pageWidth / 2 }
          );

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(grayColor)
          .text(
            `Página ${p + 1} de ${range.count}`,
            doc.page.width - doc.page.margins.right - (pageWidth / 2),
            footerY,
            { align: 'right', width: pageWidth / 2 }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
