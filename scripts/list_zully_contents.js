const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';
const FOLDER_ID = '17q1geax9yApOcPEnQkgR8MABjvDgSyjm';

async function getClient() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001');
  const token = fs.readFileSync(TOKEN_PATH);
  oAuth2Client.setCredentials(JSON.parse(token));
  return oAuth2Client;
}

async function listFolderContents() {
  try {
    const auth = await getClient();
    const drive = google.drive({ version: 'v3', auth });
    
    console.log('Listando el contenido de TH-26 (Zully Marrero)...');
    
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      spaces: 'drive',
    });
    
    if (res.data.files.length === 0) {
      console.log('La carpeta está vacía.');
    } else {
      console.log('Archivos y subcarpetas encontradas:');
      console.log('------------------------------------------------------');
      res.data.files.forEach((file) => {
        let type = file.mimeType === 'application/vnd.google-apps.folder' ? '📁 Carpeta' : 
                   file.mimeType.replace('application/vnd.google-apps.', '📄 ');
        console.log(`- ${file.name} [${type}]`);
      });
      console.log('------------------------------------------------------');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

listFolderContents();
