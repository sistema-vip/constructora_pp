const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

async function main() {
  const authPath = path.join(process.cwd(), 'baileys_auth_info');
  if (!fs.existsSync(authPath) || !fs.existsSync(path.join(authPath, 'creds.json'))) {
    console.error('WhatsApp no está vinculado.');
    process.exit(1);
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
      console.log('Connected. Waiting 6s for contacts sync...');
      setTimeout(async () => {
        console.log(`Total contacts received: ${contactsMap.size}`);
        console.log(`Total chats received: ${chatsMap.size}`);

        const results = [];
        for (const [id, c] of contactsMap.entries()) {
          const name = c.name || c.notify || c.verifiedName || '';
          if (/losber/i.test(name) || /losber/i.test(id)) {
            results.push({ type: 'contact', id, name, details: c });
          }
        }

        for (const [id, ch] of chatsMap.entries()) {
          const name = ch.name || '';
          if (/losber/i.test(name) || /losber/i.test(id)) {
            results.push({ type: 'chat', id, name, details: ch });
          }
        }

        console.log('=== MATCHES ===');
        console.log(JSON.stringify(results, null, 2));

        if (results.length === 0) {
          console.log('No direct "losber" matches found. Printing all contacts with names:');
          const allNamed = [];
          for (const [id, c] of contactsMap.entries()) {
            if (c.name || c.notify) {
              allNamed.push({ id, name: c.name, notify: c.notify });
            }
          }
          console.log('Sample named contacts (first 40):', JSON.stringify(allNamed.slice(0, 40), null, 2));
        }

        sock.end();
        process.exit(0);
      }, 6000);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
