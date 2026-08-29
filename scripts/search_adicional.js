const fs = require('fs');
const { google } = require('googleapis');

async function getClient() {
  const content = fs.readFileSync('credentials.json');
  const { client_secret, client_id } = JSON.parse(content).installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  return oAuth2Client;
}

async function search() {
  const auth = await getClient();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name contains 'adicional' and trashed = false",
    fields: 'files(id, name, parents)',
  });
  console.log(res.data.files);
}
search();
