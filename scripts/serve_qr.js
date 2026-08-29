const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/qr.png')) {
    const imgPath = path.join(__dirname, '..', 'output', 'whatsapp_qr.png');
    if (fs.existsSync(imgPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(imgPath).pipe(res);
    }
  }
  
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Vincular WhatsApp - P&P Construye</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="3">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #0B141A; color: #E9EDEF; margin: 0; }
        .card { background: #111B21; padding: 30px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; border: 1px solid #222E35; max-width: 350px; }
        h2 { margin-top: 0; color: #00A884; font-size: 22px; }
        p { color: #8696A0; font-size: 14px; margin-bottom: 20px; line-height: 1.4; }
        img { width: 260px; height: 260px; border-radius: 10px; background: white; padding: 10px; display: block; margin: 0 auto; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>📲 Vincular WhatsApp Web</h2>
        <p>Abre WhatsApp en tu teléfono > <b>Dispositivos vinculados</b> > <b>Vincular un dispositivo</b> y escanea:</p>
        <img src="/qr.png?t=${Date.now()}" alt="Código QR">
        <p style="font-size: 12px; margin-top: 15px; color: #00A884;">🔄 Actualizando en vivo cada 3 seg...</p>
      </div>
    </body>
    </html>
  `);
});

server.listen(3333, () => {
  console.log('Servidor QR activo en http://localhost:3333');
});
