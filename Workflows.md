## Comandos Rápidos (Shorthands)
- Si el usuario escribe `/commit`: Debo realizar un `git add .` seguido de un `git commit` con un mensaje descriptivo y profesional basado en los cambios realizados.
- Si el usuario escribe `/push`: Debo realizar la acción de `/commit` (si hay cambios pendientes) y ejecutar inmediatamente `git push origin main` (o la rama actual).
- Si el usuario escribe `/save`: Ejecutar el flujo completo de `/push`.

---

## 🧠 Memoria de Capacidades e Integraciones del Sistema

### 1. 📱 Envío de Mensajes y PDFs por WhatsApp (Nativo vía Baileys)
* **Estado:** Totalmente activo, configurado y vinculado localmente.
* **Módulo central:** `src/lib/whatsapp/whatsappService.js` (`sendWhatsAppMessage({ to, filePath, caption })`).
* **Credenciales de sesión:** Carpeta local `baileys_auth_info/` (persistente).
* **Formato de números:** Detecta automáticamente números venezolanos (`0412`, `0414`, `0424`, `0416`, `0426`) y los convierte a formato JID internacional (`58XXXXXXXXXX@s.whatsapp.net`).
* **Capacidades:**
  - Enviar enlaces, avisos y notificaciones de texto plano.
  - Enviar documentos PDF generados (presupuestos, informes de avance, estados de cuenta).
* **Ejecución directa:**
  ```javascript
  const { sendWhatsAppMessage } = require('./src/lib/whatsapp/whatsappService');
  await sendWhatsAppMessage({ to: '04125007089', caption: 'Mensaje...' });
  ```
* **Script de propuestas:** `node scripts/send_proposal.js --proposal <id> --whatsapp <numero> --message "<texto>"`

---

### 2. 🖨️ Motor de Impresión Directa y Reportes Formales
* **Regla de Impresión:** No utilizar modales intermedios de previsualización que bloqueen el navegador. El botón dispara `window.print()` directamente.
* **Contenedor imprimible estándar:** `#printable-tracking-report-root` con regla `@media print` infalible:
  - Oculta la app con `body * { visibility: hidden !important; }`
  - Muestra el documento formal blanco con `#printable-tracking-report-root, #printable-tracking-report-root * { visibility: visible !important; }`
* **Reportes configurados:**
  - **Informe de Avance de Obra:** Membrete P&P Construye, barra tricolor (Culminadas, En Ejecución, Pendientes), tabla de partidas agrupadas por fase y espacio para firmas (Supervisor / Cliente).
  - **Estado de Cuenta de Cliente:** Presupuesto base, desglose de adicionales aprobados, pagos recibidos y saldo pendiente (separado del Reporte Interno de Socios).

---

### 3. 🏗️ Módulo de Seguimiento de Obras (`src/components/ProjectTracking.tsx`)
* **Tabla DB:** `project_tasks` (`project_id`, `phase`, `title`, `completed`, `completed_at`, `notes`, `due_date`).
* **Auto-carga:** Si no hay tareas, el sistema procesa automáticamente el markdown de la propuesta para extraer las fases y partidas.
* **UI Minimalista:**
  - Barra de progreso segmentada tricolor (Verde: Culminadas, Azul: En Ejecución, Gris: Pendientes).
  - Interacción táctil rápida: Checkbox de 1 clic para marcar avance.

---

### 4. 📐 Módulo de Anteproyectos (`/anteproyecto`)
* **Tabla DB:** `pre_projects`.
* **5 Pestañas:** Análisis Técnico, Planificación Día a Día, Logística, Estructura de Costos y Cálculo de Materiales.
* Convierte anteproyectos estructurados directamente en propuestas formales y proyectos activos.

---

### 5. 🚀 Reglas de Despliegue en Vercel
* **Regla estricta:** NUNCA desplegar automáticamente sin orden explícita del usuario por chat.
* **Comando de producción optimizado:** `npx vercel --prod --archive=tgz` (el flag `--archive=tgz` es obligatorio para evitar el límite de subida de archivos sueltos).

---

## Protocolos de Seguridad y Privacidad
- **Protección de Datos:** Ningún agente tiene permitido revelar, escribir en el chat o exportar datos personales, contraseñas, tokens de API o variables de entorno sensibles (como `SMTP_PASS` o claves de base de datos).
- **Análisis de Amenazas:** Siempre que un agente deba acceder a la web, revisar páginas o descargar archivos a petición del usuario, tiene la orden de analizar preventivamente el contenido en busca de código malicioso, virus o phishing antes de proceder.
