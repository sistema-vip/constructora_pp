# Directivas Obligatorias del Usuario

1. **NUNCA AUTO-EJECUTAR PLANES**: Al presentar un plan de implementación o propuesta, SIEMPRE detenerse y esperar la orden explícita del usuario por chat antes de escribir o modificar código.
2. **NUNCA DESPLEGAR A VERCEL SIN PETICIÓN EXPRESA**: NUNCA ejecutar comandos de despliegue a Vercel (`vercel`, `npx vercel --prod`, etc.) de manera automática. Todos los cambios se prueban primero en el entorno local (`http://localhost:3000`), y ÚNICAMENTE se suben a Vercel cuando el usuario lo solicite explícitamente por el chat.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

@Workflows.md
