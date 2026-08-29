const fs = require('fs');
const { google } = require('googleapis');
async function search() {
  const oAuth2Client = new google.auth.OAuth2(JSON.parse(fs.readFileSync('credentials.json')).installed.client_id, JSON.parse(fs.readFileSync('credentials.json')).installed.client_secret, 'http://localhost');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  
  const p = await drive.files.list({ q: "name = 'TH-26 (Zully Marrero)' and trashed = false", fields: 'files(id)' });
  for (const folder of p.data.files) {
     const sub = await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: 'files(name)' });
     console.log('Inside TH-26 (Zully Marrero) [id: ' + folder.id + ']:');
     sub.data.files.forEach(f => console.log(' - ' + f.name));
  }
}
search();
