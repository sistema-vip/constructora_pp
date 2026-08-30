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
7. **DELEGACIÓN POR DEFECTO (CERO ESPERA)**: Tú (el agente principal) actúas como el Director/Coordinador. Para **CUALQUIER** tarea operativa que te pida el usuario (ej. "registra un gasto", "crea un archivo", "modifica la base de datos"), **NO DEBES ejecutarla tú mismo paso a paso en el chat principal**. 
   - En tu **primer turno**, invoca de inmediato a un subagente (con `invoke_subagent`) pasándole las instrucciones.
   - Responde instantáneamente al usuario confirmando que la tarea fue asignada.
   - El objetivo es que NUNCA pongas al usuario en cola de espera; tu chat principal debe quedar libre en cuestión de segundos para atender otra solicitud, mientras el subagente hace el trabajo pesado en segundo plano.
8. **AUTONOMÍA TOTAL DE SUBAGENTES (CERO MODALES NI SOLICITUDES DE APROBACIÓN)**: Los subagentes tienen ESTRICTAMENTE PROHIBIDO lanzar diálogos, modales o solicitudes de confirmación interactiva en pantalla (como `RequestFeedback: true` o herramientas de preguntas interactivas) para tareas operativas normales (código, base de datos, consultas, correcciones). El usuario opera frecuentemente desde el móvil donde estas ventanas son difíciles de ver y bloquean el flujo. Todo el trabajo técnico y operativo se ejecuta con total autonomía de principio a fin. Únicamente si surgiera una acción de seguridad crítica (claves, vulneración de bloqueos, transferencias monetarias o datos sensibles), el subagente reportará de inmediato por mensaje interno al Agente Principal para que este lo gestione con el usuario. El Agente Principal supervisa constantemente el progreso de los subagentes.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

@Workflows.md

