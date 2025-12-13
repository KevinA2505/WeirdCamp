<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

Generador interactivo de terrenos low poly en 3D. Ajusta parámetros como tamaño del mundo, densidad de bosques, relieve, estaciones y efectos ambientales para explorar diferentes biomas en tiempo real usando Three.js y React.

View your app in AI Studio: https://ai.studio/apps/temp/1

## Requisitos
- Node.js 18+
- npm 9+

## Configuración rápida
1. Instala dependencias: `npm install`
2. (Opcional) Crea `.env.local` y define tu clave de Gemini si la usas para integraciones: `GEMINI_API_KEY=tu_api_key`
3. Inicia el entorno de desarrollo: `npm run dev`
4. Abre el enlace indicado por Vite (generalmente http://localhost:5173) en tu navegador.

## Comandos disponibles
- `npm run dev`: inicia el servidor de desarrollo con recarga en caliente.
- `npm run build`: genera la versión optimizada para producción.
- `npm run preview`: sirve la build de producción localmente para revisión.

## Notas del proyecto
- Los controles de simulación se encuentran en el menú inicial; al iniciar la simulación puedes volver al menú para ajustar parámetros y regenerar el mundo.
- Si cambias el puerto o la ruta base en `vite.config.ts`, actualiza tus scripts de despliegue en consecuencia.
