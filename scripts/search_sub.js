const fs = require('fs');
const { google } = require('googleapis');

async function search() {
  const content = fs.readFileSync('credentials.json');
  const { client_secret, client_id } = JSON.parse(content).installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  
  const zullyId = '17q1geax9yApOcPEnQkgR8MABjvDgSyjm';
  const res = await drive.files.list({ q: `'${zullyId}' in parents and trashed = false`, fields: 'files(id, name, mimeType)' });
  
  for (const file of res.data.files) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
       console.log(`\n📁 Carpeta: ${file.name}`);
       const sub = await drive.files.list({ q: `'${file.id}' in parents and trashed = false`, fields: 'files(id, name, mimeType)' });
       for (const subFile of sub.data.files) {
           console.log(`  - ${subFile.name}`);
       }
       if (sub.data.files.length === 0) console.log('  (vacía)');
    }
  }
}
search();
