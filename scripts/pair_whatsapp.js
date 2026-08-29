const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

async function connectToWhatsApp() {
  const authPath = path.join(process.cwd(), 'baileys_auth_info');
  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  let version = [2, 3000, 1015901307];
  try {
    const v = await fetchLatestBaileysVersion();
    if (v && v.version) version = v.version;
  } catch (_) {}

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    let rawPhone = process.argv[2] || '584241235268';
    let phone = rawPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '58' + phone.substring(1);
    }

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phone);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log(`\n========================================`);
        console.log(` 🔑 CÓDIGO DE VINCULACIÓN ACTIVO: `);
        console.log(` 👉👉👉  ${formattedCode}  👈👈👈`);
        console.log(`========================================\n`);
      } catch (err) {
        console.error('Error al pedir código:', err.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Sesión cerrada por el usuario.');
      } else {
        console.log('🔄 Reconectando para mantener la espera...');
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      console.log('\n🎉 ¡VINCULACIÓN EXITOSA! WhatsApp conectado correctamente.');
      setTimeout(() => process.exit(0), 3000);
    }
  });
}

connectToWhatsApp();
