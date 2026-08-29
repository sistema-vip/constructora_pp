/**
 * Script de Generación y Despacho de Propuestas en PDF
 *
 * Uso:
 *   node scripts/send_proposal.js --proposal 100117
 *   node scripts/send_proposal.js --proposal 100117 --telegram 123456789
 *   node scripts/send_proposal.js --proposal 100117 --email cliente@correo.com
 *   node scripts/send_proposal.js --proposal 100117 --whatsapp +584141234567 --message "Hola, te adjunto el presupuesto"
 *   node scripts/send_proposal.js --proposal 100117 --output ./propuesta.pdf
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Cargar variables de .env.local manualmente si no están en process.env
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tyafjhkdxuygnbejbymp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Parser de argumentos
const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].substring(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      params[key] = next;
      i++;
    } else {
      params[key] = true;
    }
  }
}

async function getProposalData(proposalNumberOrId) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  };

  let url = `${SUPABASE_URL}/rest/v1/projects?select=*,clients(*)`;
  const isNumber = !isNaN(Number(proposalNumberOrId));

  if (isNumber) {
    url += `&proposal_number=eq.${proposalNumberOrId}`;
  } else {
    url += `&id=eq.${proposalNumberOrId}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Error consultando Supabase: ${res.statusText}`);
  }

  const projects = await res.json();
  if (!projects || projects.length === 0) {
    throw new Error(`No se encontró ninguna propuesta con identificador: ${proposalNumberOrId}`);
  }

  const project = projects[0];
  const client = project.clients || {};

  return {
    proposal_number: project.proposal_number,
    date: project.start_date || (project.created_at ? project.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    title: project.title,
    client_name: client.name || 'Cliente',
    client_tax_id: client.tax_id || '',
    client_phone: client.phone || '',
    client_email: client.email || '',
    client_address: client.address || '',
    budget_usd: project.budget_usd || 0,
    budget_ves: project.budget_ves || 0,
    description: project.description || ''
  };
}

function generateProposalPdf(data, outputPath) {
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

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const copperColor = '#B87333';
      const darkColor = '#1A1A1A';
      const grayColor = '#555555';
      const lightBorder = '#D0D0D0';
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // 1. HEADER (Logo + Proposal Number & Date)
      const logoPath = path.join(__dirname, '..', 'public', 'logo_3d.png');
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

      const headerRightX = doc.page.width - doc.page.margins.right - 220;
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(copperColor)
        .text(
          data.proposal_number ? `PROPUESTA N° ${data.proposal_number}` : 'PROPUESTA TÉCNICA',
          headerRightX,
          startY,
          { width: 220, align: 'right' }
        );

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(grayColor)
        .text(
          `Fecha: ${data.date || new Date().toLocaleDateString('es-VE')}`,
          headerRightX,
          doc.y + 3,
          { width: 220, align: 'right' }
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
        if (doc.y > doc.page.height - doc.page.margins.bottom - 75) {
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
            // Highlight box for Inversión Total
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
      if (doc.y > doc.page.height - doc.page.margins.bottom - 95) {
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

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

async function sendTelegramDocument(chatId, filePath, caption) {
  if (!TELEGRAM_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN no configurado en el entorno.');
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption || '📄 Propuesta Técnica y Económica');

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('document', blob, path.basename(filePath));

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Error de Telegram: ${data.description}`);
  }

  return data;
}

async function sendEmailDocument(toEmail, filePath, proposalData) {
  const nodemailer = require('nodemailer');

  // Transporter config (revisa si hay variables de SMTP configuradas)
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.log('\n⚠️ Nota: No hay credenciales SMTP configuradas en .env.local (SMTP_USER / SMTP_PASS).');
    console.log(`Para habilitar el envío directo por email, agrega SMTP_USER y SMTP_PASS a .env.local.`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const mailOptions = {
    from: `"P&P Construye" <${user}>`,
    to: toEmail,
    subject: `Propuesta Técnica N° ${proposalData.proposal_number || ''} - ${proposalData.title}`,
    text: `Adjunto encontrará la propuesta técnica y económica correspondiente a "${proposalData.title}" para ${proposalData.client_name}.\n\nAtentamente,\nP&P Construye`,
    attachments: [
      {
        filename: path.basename(filePath),
        path: filePath
      }
    ]
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

async function main() {
  const proposalArg = params.proposal || params.id || '100117';

  console.log(`\n========================================`);
  console.log(` 📋 Generador de PDF de Propuestas P&P `);
  console.log(`========================================\n`);
  console.log(`Consultando datos de la propuesta ${proposalArg}...`);

  const data = await getProposalData(proposalArg);
  console.log(`✅ Propuesta encontrada: "${data.title}"`);
  console.log(`   Cliente: ${data.client_name}`);
  console.log(`   Presupuesto: $${data.budget_usd} USD`);

  // Crear directorio de salida
  const outputDir = path.join(process.cwd(), 'output', 'proposals');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `Propuesta_${data.proposal_number || 'draft'}_${(data.client_name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const outputPath = params.output ? path.resolve(params.output) : path.join(outputDir, fileName);

  console.log(`\nGenerando documento PDF...`);
  await generateProposalPdf(data, outputPath);
  console.log(`✅ PDF generado exitosamente en:`);
  console.log(`   👉 ${outputPath}`);

  // Enviar por Telegram si se solicita
  if (params.telegram) {
    let targetChatId = params.telegram;
    if (targetChatId === true) {
      // Buscar el chat ID del admin en Supabase
      try {
        const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&select=telegram_chat_id&limit=1`, { headers });
        const profiles = await res.json();
        if (profiles && profiles.length > 0 && profiles[0].telegram_chat_id) {
          targetChatId = profiles[0].telegram_chat_id;
        } else {
          targetChatId = 1225967322; // Fallback al ID de Henry Daniel Peraza
        }
      } catch {
        targetChatId = 1225967322;
      }
    }

    console.log(`\nEnviando por Telegram al Chat ID ${targetChatId}...`);
    try {
      const caption = `📄 *Propuesta N° ${data.proposal_number || ''}*\n🏗 *Proyecto:* ${data.title}\n👤 *Cliente:* ${data.client_name}\n💵 *Inversión:* $${data.budget_usd} USD`;
      await sendTelegramDocument(targetChatId, outputPath, caption);
      console.log(`✅ Documento enviado exitosamente a Telegram (Chat ID: ${targetChatId})!`);
    } catch (err) {
      console.error(`❌ Error enviando a Telegram: ${err.message}`);
    }
  }

  // Enviar por Email si se solicita
  if (params.email) {
    console.log(`\nEnviando por Email a ${params.email}...`);
    try {
      const sent = await sendEmailDocument(params.email, outputPath, data);
      if (sent) {
        console.log(`✅ Email enviado exitosamente a ${params.email}!`);
      }
    } catch (err) {
      console.error(`❌ Error enviando por Email: ${err.message}`);
    }
  }

  // Enviar por WhatsApp si se solicita
  if (params.whatsapp) {
    const targetPhone = params.whatsapp === true ? (data.client_phone || '584141234567') : params.whatsapp;
    const defaultCaption = `Hola ${data.client_name}, te adjunto la propuesta técnica y económica formal para el proyecto *"${data.title}"*.\n\n📄 *Propuesta N° ${data.proposal_number || ''}*\n💵 *Inversión:* $${data.budget_usd} USD\n\nQuedo muy atento a cualquier consulta o ajuste que desees realizar.`;
    const caption = params.message || defaultCaption;

    console.log(`\nEnviando por WhatsApp al número ${targetPhone}...`);
    try {
      const { sendWhatsAppMessage } = require('../src/lib/whatsapp/whatsappService');
      await sendWhatsAppMessage({
        to: targetPhone,
        filePath: outputPath,
        caption: caption
      });
    } catch (err) {
      console.error(`❌ Error enviando por WhatsApp: ${err.message}`);
    }
  }

  console.log(`\n========================================\n`);
}

main().catch(err => {
  console.error('\n❌ Ocurrió un error:', err.message);
  process.exit(1);
});
