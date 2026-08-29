const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';

async function getClient() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001');
  const token = fs.readFileSync(TOKEN_PATH);
  oAuth2Client.setCredentials(JSON.parse(token));
  return oAuth2Client;
}

async function searchFolder() {
  try {
    const auth = await getClient();
    const drive = google.drive({ version: 'v3', auth });
    
    console.log('Buscando carpeta relacionada con "Zully"...');
    
    // Usamos 'contains' ignorando mayúsculas/minúsculas mediante la API
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name contains 'Zully' and trashed = false",
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });
    
    if (res.data.files.length === 0) {
      console.log('No se encontró ninguna carpeta con el nombre "Zully".');
    } else {
      console.log(`Se encontraron ${res.data.files.length} carpeta(s):`);
      res.data.files.forEach((file) => {
        console.log(`- Nombre: ${file.name} | ID: ${file.id}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

searchFolder();
