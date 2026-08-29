const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const REPORT_MESSAGE = `📊 *P&P CONSTRUYE - REPORTE DE SOCIOS*
📍 *Proyecto:* Zully Marrero (TH 25) - Adecuación y Demolición
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

  const contactsMap = new Map();
  const chatsMap = new Map();

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      contactsMap.set(c.id, { ...contactsMap.get(c.id), ...c });
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const u of updates) {
      contactsMap.set(u.id, { ...contactsMap.get(u.id), ...u });
    }
  });

  sock.ev.on('chats.upsert', (chats) => {
    for (const c of chats) {
      chatsMap.set(c.id, { ...chatsMap.get(c.id), ...c });
    }
  });

  sock.ev.on('messaging-history.set', ({ contacts, chats }) => {
    if (contacts) {
      for (const c of contacts) {
        contactsMap.set(c.id, { ...contactsMap.get(c.id), ...c });
      }
    }
    if (chats) {
      for (const ch of chats) {
        chatsMap.set(ch.id, { ...chatsMap.get(ch.id), ...ch });
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;
    if (connection === 'open') {
      console.log('✅ Conexión establecida. Sincronizando contactos y chats...');

      setTimeout(async () => {
        console.log(`📦 Contactos recibidos: ${contactsMap.size}`);
        console.log(`💬 Chats recibidos: ${chatsMap.size}`);

        const candidates = [];

        // Buscar en contactos
        for (const [id, c] of contactsMap.entries()) {
          const name = (c.name || c.notify || c.verifiedName || '').trim();
          if (/losber/i.test(name) || /perez.*nvo/i.test(name)) {
            candidates.push({ id, name, type: 'contact', details: c });
          }
        }

        // Buscar en chats
        for (const [id, ch] of chatsMap.entries()) {
          const name = (ch.name || '').trim();
          if (/losber/i.test(name) || /perez.*nvo/i.test(name)) {
            if (!candidates.some(c => c.id === id)) {
              candidates.push({ id, name, type: 'chat', details: ch });
            }
          }
        }

        console.log('\n--- RESULTADOS DE BÚSQUEDA ---');
        console.log(JSON.stringify(candidates, null, 2));

        // Buscar coincidencia exacta o más cercana
        const exactMatch = candidates.find(c => /losbers?\s+p[eé]rez\s+nvo/i.test(c.name))
          || candidates.find(c => /losbers?\s+p[eé]rez/i.test(c.name))
          || candidates.find(c => /losber/i.test(c.name));

        if (exactMatch) {
          console.log(`\n🎯 Contacto seleccionado: "${exactMatch.name}" (${exactMatch.id})`);
          console.log('🚀 Despachando mensaje de reporte...');
          try {
            await sock.sendMessage(exactMatch.id, { text: REPORT_MESSAGE });
            console.log('✅ ¡Mensaje enviado con éxito por WhatsApp!');
          } catch (err) {
            console.error('❌ Error al enviar mensaje:', err);
          }
        } else {
          console.log('\n⚠️ No se encontró ningún contacto que contenga "Losber".');
          console.log('Lista de todos los contactos con nombre disponibles:');
          const allWithNames = [];
          for (const [id, c] of contactsMap.entries()) {
            if (c.name || c.notify) {
              allWithNames.push({ id, name: c.name || c.notify });
            }
          }
          console.log(JSON.stringify(allWithNames, null, 2));
        }

        setTimeout(() => {
          sock.end();
          process.exit(0);
        }, 1500);
      }, 7000);
    }
  });
}

main().catch(err => {
  console.error('Error general:', err);
  process.exit(1);
});
