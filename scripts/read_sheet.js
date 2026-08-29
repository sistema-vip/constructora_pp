const fs = require('fs');
const { google } = require('googleapis');

async function readSheet() {
  const content = fs.readFileSync('credentials.json');
  const { client_secret, client_id } = JSON.parse(content).installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  
  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
  const spreadsheetId = '1mamXM7HZ1ilVGGH9ulm2RAggR0N1S-AaGmhJPWUezDg';
  
  try {
    // First get the sheet names
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = meta.data.sheets[0].properties.title;
    
    // Then get the values
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:F20`,
    });
    
    console.log(`--- Contenido de la hoja: ${sheetName} ---`);
    if (!res.data.values || res.data.values.length === 0) {
      console.log('La hoja está vacía.');
    } else {
      res.data.values.forEach(row => {
        console.log(row.join(' | '));
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}
readSheet();
