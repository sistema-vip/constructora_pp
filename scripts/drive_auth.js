const fs = require('fs');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function getClient() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id } = credentials.installed;
  
  // Create client
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3001'
  );

  // Check if we have previously stored a token.
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } else {
    return await getNewToken(oAuth2Client);
  }
}

function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('\n======================================================');
    console.log('NECESITAMOS AUTENTICARNOS CON GOOGLE');
    console.log('1. Abre este enlace en tu navegador:');
    console.log(authUrl);
    console.log('2. Inicia sesión y autoriza la aplicación.');
    console.log('======================================================\n');

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/') > -1) {
          const qs = new url.URL(req.url, 'http://localhost:3001').searchParams;
          const code = qs.get('code');
          if (code) {
            console.log('Código recibido. Obteniendo token...');
            res.end('Autenticacion exitosa! Puedes cerrar esta pestana y volver a tu chat.');
            
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
            console.log('Token guardado exitosamente.');
            resolve(oAuth2Client);
            setTimeout(() => {
                server.close();
                process.exit(0); // Forzamos salir en este paso para continuar el flujo
            }, 1000);
          }
        }
      } catch (e) {
        reject(e);
      }
    });
    
    server.listen(3001, () => {
      console.log('Esperando que completes el login (escuchando en el puerto 3001)...');
    });
  });
}

async function listFiles() {
  try {
    const auth = await getClient();
    const drive = google.drive({ version: 'v3', auth });
    
    console.log('Buscando carpeta "P&P Construye"...');
    const folderRes = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name contains 'P&P Construye' and trashed = false",
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    
    if (folderRes.data.files.length === 0) {
      console.log('No se encontro la carpeta "P&P Construye".');
      return;
    }
    
    const folderId = folderRes.data.files[0].id;
    console.log(`\nCarpeta encontrada: ${folderRes.data.files[0].name}`);
    console.log('Archivos dentro de la carpeta:');
    console.log('------------------------------------------------------');
    
    const filesRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      spaces: 'drive',
    });
    
    if (filesRes.data.files.length === 0) {
      console.log('(La carpeta está vacía)');
    } else {
      filesRes.data.files.forEach((file) => {
        let tipo = file.mimeType.replace('application/vnd.google-apps.', '');
        console.log(`- ${file.name} [${tipo}]`);
      });
    }
    console.log('------------------------------------------------------\n');
    process.exit(0);
  } catch (err) {
    console.error('Error al listar archivos:', err.message);
    process.exit(1);
  }
}

listFiles();
