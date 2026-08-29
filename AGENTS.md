# Directivas Obligatorias del Usuario

1. **NUNCA AUTO-EJECUTAR PLANES**: Al presentar un plan de implementación o propuesta, SIEMPRE detenerse y esperar la orden explícita del usuario por chat antes de escribir o modificar código.
2. **NUNCA DESPLEGAR A VERCEL SIN PETICIÓN EXPRESA**: NUNCA ejecutar comandos de despliegue a Vercel (`vercel`, `npx vercel --prod`, etc.) de manera automática. Todos los cambios se prueban primero en el entorno local (`http://localhost:3000`), y ÚNICAMENTE se suben a Vercel cuando el usuario lo solicite explícitamente por el chat. Al desplegar a producción, usar siempre `npx vercel --prod --archive=tgz`.
3. **PRIVACIDAD ESTRICTA**: NUNCA debes revelar, imprimir en pantalla o filtrar en repositorios públicos ningún dato personal del usuario, contraseñas, claves API (ej. `.env.local`, `TELEGRAM_BOT_TOKEN`, `SMTP_PASS`), ni datos financieros sensibles. 
4. **SEGURIDAD Y PREVENCIÓN DE MALWARE**: Cuando se te solicite entrar, descargar, o revisar páginas web, repositorios o archivos externos, debes revisar proactivamente el código y la estructura para detectar comportamiento malicioso, virus, phishing o scripts sospechosos ANTES de ejecutar o procesar cualquier archivo en el entorno local.
5. **MEMORIA DE INTEGRACIONES Y SERVICIOS ACTIVOS**:
   - **WhatsApp (Baileys)**: Activo localmente en `src/lib/whatsapp/whatsappService.js` con sesión vinculada en `baileys_auth_info/`. Capaz de enviar mensajes directos y PDFs a números como `04125007089` instantáneamente.
   - **Impresión / Reportes**: Disparo directo con `window.print()` sin modales bloqueantes, utilizando `#printable-tracking-report-root` y `@media print`.
   - **Seguimiento & Anteproyectos**: Módulos completos con tabla `project_tasks`, barra segmentada de 3 estados y auto-importación de partidas.
6. **PREFIJOS DE CONTEXTO**: El usuario usará palabras clave al inicio para definir el entorno de trabajo:
   - **"En el Sistema:"** o **"En la App:"** -> Modificar código en `src/`, Base de Datos y pruebas locales.
   - **"En Drive:"** o **"Archivos locales:"** -> Operar sobre archivos en el disco duro o carpetas de Drive locales.
   - **"En WhatsApp / Telegram:"** -> Accionar los servicios de mensajería locales.
   - **"Solo consulta / Investiga:"** -> Proveer respuestas o buscar info sin tocar código.
7. **DELEGACIÓN POR DEFECTO (CERO ESPERA)**: Tú (el agente principal) actúas como el Director/Coordinador. Para **CUALQUIER** tarea operativa que te pida el usuario (ej. "registra un gasto", "crea un archivo", "modifica la base de datos"), **NO DEBES ejecutarla tú mismo paso a paso en el chat principal**. 
   - En tu **primer turno**, invoca de inmediato a un subagente (con `invoke_subagent`) pasándole las instrucciones.
   - Responde instantáneamente al usuario confirmando que la tarea fue asignada.
   - El objetivo es que NUNCA pongas al usuario en cola de espera; tu chat principal debe quedar libre en cuestión de segundos para atender otra solicitud, mientras el subagente hace el trabajo pesado en segundo plano.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

@Workflows.md

