const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

/**
 * Formatea un número de teléfono al JID estándar de WhatsApp en Baileys (xxxxxxxxxxx@s.whatsapp.net)
 * @param {string} phone 
 * @returns {string}
 */
function formatWhatsAppNumber(phone) {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0414') || cleaned.startsWith('0424') || cleaned.startsWith('0412') || cleaned.startsWith('0416') || cleaned.startsWith('0426')) {
    cleaned = '58' + cleaned.substring(1);
  } else if (cleaned.length === 10 && (cleaned.startsWith('414') || cleaned.startsWith('424') || cleaned.startsWith('412') || cleaned.startsWith('416') || cleaned.startsWith('426'))) {
    cleaned = '58' + cleaned;
  }

  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Envía un documento PDF y/o mensaje de texto a través de WhatsApp sin usar navegadores.
 * @param {Object} options
 * @param {string} options.to - Número de teléfono destino
 * @param {string} [options.filePath] - Ruta absoluta o relativa al PDF
 * @param {string} [options.caption] - Mensaje / texto que acompaña al PDF o mensaje directo
 * @returns {Promise<boolean>}
 */
async function sendWhatsAppMessage({ to, filePath, caption }) {
  const authPath = path.join(process.cwd(), 'baileys_auth_info');
  
  if (!fs.existsSync(authPath) || !fs.existsSync(path.join(authPath, 'creds.json'))) {
    throw new Error('WhatsApp no está vinculado todavía. Ejecuta primero: node scripts/pair_whatsapp.js');
  }

  const recipientJid = formatWhatsAppNumber(to);

  console.log(`\n========================================`);
  console.log(` 💬 Iniciando Servicio de WhatsApp `);
  console.log(`========================================`);
  console.log(`📱 Destinatario: ${to} (JID: ${recipientJid})`);

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
      browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log('✅ Conexión con WhatsApp lista y verificada.');
        try {
          if (filePath && fs.existsSync(filePath)) {
            console.log(`📎 Adjuntando archivo PDF: ${path.basename(filePath)}...`);
            const fileBuffer = fs.readFileSync(filePath);
            await sock.sendMessage(recipientJid, {
              document: fileBuffer,
              mimetype: 'application/pdf',
              fileName: path.basename(filePath),
              caption: caption || '📄 Propuesta Técnica y Económica'
            });
            console.log(`🚀 ¡PDF enviado con éxito por WhatsApp a ${to}!`);
          } else if (caption) {
            console.log(`💬 Enviando mensaje de texto...`);
            await sock.sendMessage(recipientJid, { text: caption });
            console.log(`🚀 ¡Mensaje enviado con éxito por WhatsApp a ${to}!`);
          } else {
            throw new Error('No se especificó ni archivo adjunto ni mensaje para enviar.');
          }

          setTimeout(() => {
            sock.end();
            resolve(true);
          }, 1500);
        } catch (err) {
          console.error('❌ Error enviando mensaje:', err.message || err);
          sock.end();
          reject(err);
        }
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('La sesión de WhatsApp fue cerrada en el teléfono. Vuelve a vincular con: node scripts/pair_whatsapp.js'));
        }
      }
    });
  });
}

module.exports = {
  sendWhatsAppMessage,
  formatWhatsAppNumber
};
