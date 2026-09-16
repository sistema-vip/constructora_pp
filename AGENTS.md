# Directivas Obligatorias del Usuario

1. **EJECUCIÓN DIRECTA Y AUTÓNOMA**: Ejecuta de inmediato las modificaciones de código, base de datos, correcciones y tareas operativas solicitadas por el usuario SIN detenerte a pedir confirmación o autorización previa. La ÚNICA restricción donde se requiere consultar al usuario es para acciones de alto riesgo o seguridad crítica: manejo/exposición de contraseñas, vulneración de bloqueos, filtración o exposición de información confidencial/sensible, transferencias de dinero o despliegues a producción en Vercel.
2. **NUNCA DESPLEGAR A VERCEL SIN PETICIÓN EXPRESA**: NUNCA ejecutar comandos de despliegue a Vercel (`vercel`, `npx vercel --prod`, etc.) de manera automática. Todos los cambios se prueban primero en el entorno local (`http://localhost:3000`), y ÚNICAMENTE se suben a Vercel cuando el usuario lo solicite explícitamente por el chat. Al desplegar a producción, usar siempre `npx vercel --prod --archive=tgz`.
3. **PRIVACIDAD Y SEGURIDAD ESTRICTA (CERO FUGAS Y CERO ACCIONES EXTERNAS SIN PERMISO)**: NUNCA revelar, imprimir en pantalla ni subir a repositorios o logs datos personales, contraseñas, claves bancarias, credenciales de Vercel, correos o redes sociales. **PROHIBICIÓN ABSOLUTA**: Ningún agente o subagente puede realizar transferencias de dinero, modificar infraestructura en Vercel, publicar en redes sociales, ni enviar correos electrónicos/mensajes a personas no indicadas sin que el usuario lo haya autorizado explícitamente a través del Agente Principal. El Agente Principal es el único guardián de estas acciones de alto riesgo.
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
7. **DELEGACIÓN POR DEFECTO (CERO ESPERA)**: Tú (el agente principal) actúas como el Director/Coordinador. Para **CUALQUIER** tarea operativa que te pida el usuario (ej. "registra un gasto", "crea un archivo", "modifica la base de datos", "registra un pago"):
   - En tu **primer turno**, invoca de inmediato a un subagente (con `invoke_subagent`, indicando `Model: "flash"` para máxima velocidad de respuesta y menor latencia) pasándole la instrucción exacta y el comando directo a ejecutar.
   - Responde instantáneamente al usuario confirmando que la tarea fue asignada.
   - El objetivo es que NUNCA pongas al usuario en cola de espera; tu chat principal queda libre en segundos para atender la siguiente solicitud mientras el subagente ejecuta en paralelo.
8. **VELOCIDAD EXTREMA Y CERO RODEOS EN SUBAGENTES (ATAJOS DIRECTOS)**:
   - Los subagentes NO deben perder tiempo explorando carpetas ni haciendo búsquedas a ciegas de tablas o esquemas en `src/`.
   - Para operaciones comunes de Base de Datos (gastos, cobros de clientes, compromisos, consulta de estados de proyectos), los subagentes deben usar DIRECTAMENTE el CLI de alta velocidad:
     * **Buscar Proyecto:** `node scripts/quick_db.js find-project --query "<nombre o cliente>"`
     * **Registrar Gasto:** `node scripts/quick_db.js record-cost --project "<obra o id>" --amount <monto> --provider "<proveedor>" --description "<concepto>"`
     * **Registrar Cobro/Pago:** `node scripts/quick_db.js record-payment --project "<obra o id>" --amount <monto> --reference "<ref>" --description "<concepto>"`
     * **Registrar Compromiso (CxP):** `node scripts/quick_db.js record-commitment --project "<obra o id>" --amount <monto> --provider "<proveedor>" --description "<concepto>"`
     * **Consultar Balance de Obra:** `node scripts/quick_db.js project-status --project "<obra o id>"`
   - Con este CLI, la tarea se completa en **1 solo comando y menos de 2 segundos**.
   - Tras ejecutar el comando, el subagente notifica inmediatamente al Agente Principal vía `send_message` con el resultado y finaliza.
9. **AUTONOMÍA TOTAL DE SUBAGENTES (CERO MODALES NI PREGUNTAS BLOQUEANTES)**: Los subagentes tienen ESTRICTAMENTE PROHIBIDO lanzar diálogos interactivos (`ask_question`), modales o solicitudes de confirmación en pantalla (`RequestFeedback: true`). El trabajo operativo se resuelve de principio a fin de forma 100% autónoma. Solo en caso de riesgo de seguridad crítica (exposición de claves, transferencias bancarias reales, etc.) reportarán internamente al Agente Principal.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

@Workflows.md

