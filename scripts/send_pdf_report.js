/**
 * Script de Generación de Reporte PDF y Despacho vía WhatsApp
 * P&P CONSTRUYE C.A.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const RECIPIENT_LOSBERS = '584241729592@s.whatsapp.net';
const RECIPIENT_HENRY = '584125007089@s.whatsapp.net';

const CAPTION_LOSBERS = 'Revisa, cualquier detalle, avísame. Ya te envío los demás.';
const CAPTION_HENRY = '📊 *P&P CONSTRUYE* - Adjunto reporte financiero de socios (Proyecto Zully Marrero).';

/**
 * Genera el reporte en PDF con diseño ejecutivo formal
 * @param {string} outputPath 
 * @returns {Promise<string>}
 */
function generatePdfReport(outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 35, bottom: 35, left: 40, right: 40 },
        info: {
          Title: 'Reporte de Socios - Zully Marrero (TH 25)',
          Author: 'P&P Construye C.A.',
          Subject: 'Distribución Financiera y Ganancias de Socios'
        }
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const copper = '#B87333';
      const navy = '#0F172A';
      const slateDark = '#1E293B';
      const textGray = '#475569';
      const lightBg = '#F8FAFC';
      const cardBorder = '#E2E8F0';
      const greenProfit = '#15803D';
      const greenBg = '#DCFCE7';
      const amberBg = '#FEF3C7';
      const amberText = '#B45309';

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const pageWidth = right - left;

      // 1. LOGO & HEADER
      const logoPath = path.join(process.cwd(), 'public', 'logo_3d.png');
      const headerY = 35;

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, left, headerY, { width: 75, height: 55, fit: [75, 55] });
        } catch {
          doc.fontSize(16).font('Helvetica-Bold').fillColor(copper).text('P&P CONSTRUYE', left, headerY + 10);
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(copper).text('P&P CONSTRUYE', left, headerY + 10);
      }

      // Títulos
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('REPORTE FINANCIERO DE SOCIOS', left + 85, headerY + 5);

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(copper)
        .text('P&P CONSTRUYE C.A. • CONTROL DE OBRAS Y LIQUIDACIONES', left + 85, headerY + 25);

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textGray)
        .text('Fecha de Emisión: 29/08/2026   |   Ref: 100-119', left + 85, headerY + 39);

      // Línea divisoria elegante
      doc
        .strokeColor(copper)
        .lineWidth(1.5)
        .moveTo(left, 98)
        .lineTo(right, 98)
        .stroke();

      // 2. DETALLES DEL PROYECTO (Caja de información)
      const projectBoxY = 108;
      doc
        .roundedRect(left, projectBoxY, pageWidth, 42, 6)
        .fillAndStroke(lightBg, cardBorder);

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(textGray)
        .text('PROYECTO:', left + 12, projectBoxY + 8);

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('Zully Marrero (TH 25) - Adecuación y Demolición', left + 75, projectBoxY + 7);

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textGray)
        .text('Alcance: Trabajos de albañilería, demolición, retiro de escombros y adecuaciones generales.', left + 12, projectBoxY + 24);

      // 3. RESUMEN FINANCIERO CONSOLIDADO (Tabla / Tarjeta de métricas)
      const finY = 158;
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('1. RESUMEN FINANCIERO DE LA OBRA', left, finY);

      const tableY = finY + 16;
      const tableHeight = 112;

      // Marco de la tabla
      doc
        .roundedRect(left, tableY, pageWidth, tableHeight, 6)
        .fillAndStroke('#FFFFFF', cardBorder);

      // Filas de la tabla de resumen
      const metrics = [
        { label: 'Presupuesto Total de la Obra', value: '$2,840.00', note: 'Monto total contratado con cliente', color: navy, isBold: true },
        { label: 'Total Cobrado a la Fecha', value: '$2,004.00', note: 'Anticipos y abonos recibidos del cliente', color: '#0369A1', isBold: true },
        { label: 'Saldo por Cobrar al Cliente', value: '$836.00', note: 'Pendiente para culminación y entrega', color: '#D97706', isBold: true },
        { label: 'Total Gastos Ejecutados', value: '$1,971.00', note: 'Materiales, fletes y nómina (Wilder $75 + Jesús $75)', color: '#DC2626', isBold: true },
        { label: 'Ganancia Total Estimada del Proyecto', value: '$869.00', note: 'Margen estimado de ganancia: 30.6%', color: greenProfit, isBold: true }
      ];

      metrics.forEach((m, idx) => {
        const rowY = tableY + (idx * 22);
        
        if (idx % 2 === 0) {
          doc.rect(left + 1, rowY + 1, pageWidth - 2, 21).fill(lightBg);
        }

        doc
          .fontSize(9)
          .font(m.isBold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(navy)
          .text(m.label, left + 12, rowY + 6);

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(textGray)
          .text(m.note, left + 210, rowY + 6.5);

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(m.color)
          .text(m.value, right - 110, rowY + 5.5, { width: 98, align: 'right' });

        if (idx < metrics.length - 1) {
          doc
            .strokeColor('#F1F5F9')
            .lineWidth(1)
            .moveTo(left, rowY + 22)
            .lineTo(right, rowY + 22)
            .stroke();
        }
      });

      // 4. DISTRIBUCIÓN DE GANANCIAS ENTRE SOCIOS (50% / 50%)
      const distY = 282;
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('2. DISTRIBUCIÓN Y ESTADO DE SOCIOS (50% / 50%)', left, distY);

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(textGray)
        .text('Ganancia correspondiente estimada por socio: $434.50 c/u (50% de $869.00)', left + 280, distY + 1.5, { align: 'right', width: pageWidth - 280 });

      const cardWidth = (pageWidth - 14) / 2;
      const cardHeight = 160;
      const cardsY = distY + 18;

      // TARJETA SOCIO 1: LOSBERS PEREZ
      const card1X = left;
      doc
        .roundedRect(card1X, cardsY, cardWidth, cardHeight, 6)
        .fillAndStroke('#FFFFFF', cardBorder);

      // Header Tarjeta 1
      doc
        .roundedRect(card1X, cardsY, cardWidth, 30, 6)
        .fill('#0F172A');
      doc.rect(card1X, cardsY + 20, cardWidth, 10).fill('#0F172A'); // fix bottom corners of header

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#FFFFFF')
        .text('SOCIO: LOSBERS PEREZ', card1X + 12, cardsY + 9);

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text('Participación: 50.0%', card1X + cardWidth - 85, cardsY + 10, { width: 75, align: 'right' });

      // Contenido Tarjeta 1
      const c1ContentY = cardsY + 38;
      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(textGray)
        .text('• Ganancia Asignada (50%):', card1X + 12, c1ContentY);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('$434.50', card1X + cardWidth - 80, c1ContentY, { width: 68, align: 'right' });

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(textGray)
        .text('• Total Retiros Realizados:', card1X + 12, c1ContentY + 20);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#DC2626')
        .text('-$374.00', card1X + cardWidth - 80, c1ContentY + 20, { width: 68, align: 'right' });

      doc
        .strokeColor('#F1F5F9')
        .lineWidth(1)
        .moveTo(card1X + 10, c1ContentY + 42)
        .lineTo(card1X + cardWidth - 10, c1ContentY + 42)
        .stroke();

      // Saldo Box Tarjeta 1
      doc
        .roundedRect(card1X + 10, c1ContentY + 50, cardWidth - 20, 56, 4)
        .fillAndStroke(greenBg, '#86EFAC');

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(greenProfit)
        .text('SALDO PENDIENTE POR RETIRAR', card1X + 16, c1ContentY + 58);

      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor(greenProfit)
        .text('$60.50 USD', card1X + 16, c1ContentY + 76);

      // TARJETA SOCIO 2: HENRY PERAZA
      const card2X = left + cardWidth + 14;
      doc
        .roundedRect(card2X, cardsY, cardWidth, cardHeight, 6)
        .fillAndStroke('#FFFFFF', cardBorder);

      // Header Tarjeta 2
      doc
        .roundedRect(card2X, cardsY, cardWidth, 30, 6)
        .fill(copper);
      doc.rect(card2X, cardsY + 20, cardWidth, 10).fill(copper); // fix bottom corners of header

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#FFFFFF')
        .text('SOCIO: HENRY PERAZA', card2X + 12, cardsY + 9);

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#FEF3C7')
        .text('Participación: 50.0%', card2X + cardWidth - 85, cardsY + 10, { width: 75, align: 'right' });

      // Contenido Tarjeta 2
      const c2ContentY = cardsY + 38;
      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(textGray)
        .text('• Ganancia Asignada (50%):', card2X + 12, c2ContentY);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(navy)
        .text('$434.50', card2X + cardWidth - 80, c2ContentY, { width: 68, align: 'right' });

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor(textGray)
        .text('• Total Retiros Realizados:', card2X + 12, c2ContentY + 20);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(textGray)
        .text('$0.00', card2X + cardWidth - 80, c2ContentY + 20, { width: 68, align: 'right' });

      doc
        .strokeColor('#F1F5F9')
        .lineWidth(1)
        .moveTo(card2X + 10, c2ContentY + 42)
        .lineTo(card2X + cardWidth - 10, c2ContentY + 42)
        .stroke();

      // Saldo Box Tarjeta 2
      doc
        .roundedRect(card2X + 10, c2ContentY + 50, cardWidth - 20, 56, 4)
        .fillAndStroke(greenBg, '#86EFAC');

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(greenProfit)
        .text('SALDO PENDIENTE POR RETIRAR', card2X + 16, c2ContentY + 58);

      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor(greenProfit)
        .text('$434.50 USD', card2X + 16, c2ContentY + 76);

      // 5. RESUMEN GLOBAL DE LIQUIDACIÓN
      const bannerY = cardsY + cardHeight + 12;
      doc
        .roundedRect(left, bannerY, pageWidth, 56, 6)
        .fillAndStroke('#0F172A', '#1E293B');

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#94A3B8')
        .text('GANANCIA NETA GLOBAL POR LIQUIDAR (TOTAL DISPONIBLE)', left + 16, bannerY + 12);

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#38BDF8')
        .text('$495.00 USD', left + 16, bannerY + 28);

      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor('#E2E8F0')
        .text('Distribución: Saldo Losbers ($60.50) + Saldo Henry ($434.50)', right - 280, bannerY + 22, { width: 265, align: 'right' });

      // 6. NOTAS Y FIRMA / PIE DE PÁGINA
      const notesY = bannerY + 68;
      doc
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .fillColor(slateDark)
        .text('NOTAS IMPORTANTES:', left, notesY);

      doc
        .fontSize(7.5)
        .font('Helvetica')
        .fillColor(textGray)
        .text('• Los gastos incluyen el pago de nómina ejecutado el 29/08/2026 para Wilder ($75.00) y Jesús ($75.00).\n• La liquidación final de saldos se completará al recibir el cobro restante del cliente ($836.00).\n• Documento generado automáticamente para el control administrativo de socios.', left, notesY + 10, { width: pageWidth });

      // Pie de página
      const footerY = 728;
      doc
        .strokeColor(cardBorder)
        .lineWidth(1)
        .moveTo(left, footerY)
        .lineTo(right, footerY)
        .stroke();

      doc
        .fontSize(7.5)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text('P&P Construye C.A. • Sistema de Gestión y Control Financiero de Obras', left, footerY + 6);

      doc
        .fontSize(7.5)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text('Página 1 de 1', right - 80, footerY + 6, { width: 80, align: 'right' });

      doc.end();

      writeStream.on('finish', () => {
        resolve(outputPath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });

    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Envia el PDF a los destinatarios mediante Baileys
 * @param {string} pdfFilePath 
 */
async function sendPdfToRecipients(pdfFilePath) {
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

  console.log('🔄 Conectando a WhatsApp con Baileys...');
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log('✅ Conexión con WhatsApp abierta exitosamente.');

        try {
          const pdfBuffer = fs.readFileSync(pdfFilePath);
          const fileName = 'Reporte_Socios_Zully_Marrero.pdf';

          // 1. Envío a Losbers
          console.log(`\n📤 [1/2] Enviando documento PDF a Losbers Perez (${RECIPIENT_LOSBERS})...`);
          await sock.sendMessage(RECIPIENT_LOSBERS, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: fileName,
            caption: CAPTION_LOSBERS
          });
          console.log('✅ PDF entregado exitosamente a Losbers Perez.');

          console.log('⏳ Pausa de seguridad (2 seg)...');
          await new Promise(r => setTimeout(r, 2000));

          // 2. Envío a Henry
          console.log(`\n📤 [2/2] Enviando documento PDF a Henry Peraza (${RECIPIENT_HENRY})...`);
          await sock.sendMessage(RECIPIENT_HENRY, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: fileName,
            caption: CAPTION_HENRY
          });
          console.log('✅ PDF entregado exitosamente a Henry Peraza.');

          console.log('\n🎉 ¡Ambos PDFs han sido entregados con éxito!');
          setTimeout(() => {
            sock.end();
            resolve(true);
          }, 1500);

        } catch (err) {
          console.error('❌ Error al despachar PDFs vía WhatsApp:', err);
          sock.end();
          reject(err);
        }

      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('La sesión de WhatsApp fue cerrada en el teléfono.'));
        }
      }
    });
  });
}

async function main() {
  console.log('====================================================');
  console.log(' 📑 GENERADOR Y DESPACHO DE REPORTE PDF DE SOCIOS ');
  console.log('====================================================\n');

  const outputDir = path.join(process.cwd(), 'output', 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pdfPath = path.join(outputDir, 'reporte_socios_zully.pdf');

  console.log(`1. Generando archivo PDF en: ${pdfPath}...`);
  await generatePdfReport(pdfPath);
  console.log('✅ Archivo PDF generado exitosamente.');

  console.log('\n2. Despachando archivo PDF a WhatsApp...');
  await sendPdfToRecipients(pdfPath);
  console.log('\n✅ Proceso completado exitosamente.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Error durante la ejecución:', err.message || err);
      process.exit(1);
    });
}

module.exports = {
  generatePdfReport,
  sendPdfToRecipients
};
