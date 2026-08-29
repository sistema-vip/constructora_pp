const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const LOSBERS_PHONE = '584241729592@s.whatsapp.net';
const USER_PHONE = '584125007089@s.whatsapp.net';

const REPORT_BASE = `📊 *P&P CONSTRUYE - REPORTE DE SOCIOS*
📍 *Proyecto:* Zully Marrero (TH 25) - Adecuación y Demolición (100-119)
📅 *Fecha:* 29/08/2026

*RESUMEN FINANCIERO CONSOLIDADO:*
━━━━━━━━━━━━━━━━━━━━━
💼 *Presupuesto Total:* $2,840.00
💵 *Total Cobrado:* $2,004.00
⏳ *Saldo x Cobrar Cliente:* $836.00
🛠️ *Total Gastos Ejecutados:* $1,971.00 *(incluye nómina de hoy Wilder $75 y Jesús $75)*
📈 *Ganancia Total Estimada:* $869.00 (30.6%)

*DISTRIBUCIÓN DE GANANCIAS (50% / 50%):*
━━━━━━━━━━━━━━━━━━━━━
👤 *Ganancia correspondiente x Socio:* $434.50 c/u

📌 *Estado Socio: Losbers Perez*
• Ganancia Asignada: $434.50
• Total Retiros Realizados: -$374.00
👉 *Saldo Pendiente por Retirar:* *$60.50*

📌 *Estado Socio: Henry Peraza*
• Ganancia Asignada: $434.50
• Retiros Realizados: $0.00
👉 *Saldo Pendiente por Retirar:* *$434.50*
━━━━━━━━━━━━━━━━━━━━━
💰 *Ganancia Neta Global por Liquidar:* $495.00`;

const MSG_LOSBERS = `Revisa, cualquier detalle, avísame. Ya te envío los demás.

${REPORT_BASE}`;

const MSG_USER = `Hola Henry, la exportación en PDF de la vista detallada del proyecto está actualmente disponible de forma directa en pantalla (frontend). Te dejo aquí el reporte financiero consolidado en texto como respaldo de la misma información:

${REPORT_BASE}`;

async function main() {
  const authPath = path.join(process.cwd(), 'baileys_auth_info');
  if (!fs.existsSync(authPath) || !fs.existsSync(path.join(authPath, 'creds.json'))) {
    console.error('❌ Error: WhatsApp no está vinculado.');
    process.exit(1);
  }

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  let version = [2, 3000, 1015901307];
  try {
    const v = await fetchLatestBaileysVersion();
    if (v && v.version) version = v.version;
  } catch (_) {}

  console.log('🔄 Conectando a WhatsApp (Baileys)...');
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
      console.log('✅ Conexión establecida con éxito con WhatsApp.');

      try {
        console.log(`\n📤 [1/2] Enviando reporte a Losbers Perez (${LOSBERS_PHONE})...`);
        await sock.sendMessage(LOSBERS_PHONE, { text: MSG_LOSBERS });
        console.log('✅ Mensaje enviado a Losbers Perez.');

        console.log('⏳ Esperando 2 segundos...');
        await new Promise(r => setTimeout(r, 2000));

        console.log(`\n📤 [2/2] Enviando reporte al Usuario Henry Peraza (${USER_PHONE})...`);
        await sock.sendMessage(USER_PHONE, { text: MSG_USER });
        console.log('✅ Mensaje enviado al Usuario Henry Peraza.');

        console.log('\n🎉 ¡Ambos envíos completados con éxito!');
        setTimeout(() => {
          sock.end();
          process.exit(0);
        }, 2000);
      } catch (err) {
        console.error('❌ Error al enviar mensajes:', err);
        sock.end();
        process.exit(1);
      }
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('❌ La sesión de WhatsApp fue cerrada en el teléfono.');
      } else {
        console.log('ℹ️ Conexión cerrada:', lastDisconnect?.error?.message || statusCode);
      }
    }
  });
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
