const fs = require('fs');
const { google } = require('googleapis');
async function search() {
  const oAuth2Client = new google.auth.OAuth2(JSON.parse(fs.readFileSync('credentials.json')).installed.client_id, JSON.parse(fs.readFileSync('credentials.json')).installed.client_secret, 'http://localhost');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  
  const p = await drive.files.list({ q: "name = 'PROPUESTAS' and trashed = false", fields: 'files(id)' });
  if (p.data.files.length > 0) {
     const sub = await drive.files.list({ q: `'${p.data.files[0].id}' in parents and trashed = false`, fields: 'files(name)' });
     console.log('Inside PROPUESTAS:');
     sub.data.files.forEach(f => console.log(' - ' + f.name));
  }
}
search();
