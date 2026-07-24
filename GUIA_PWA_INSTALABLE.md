# Guia para volver una app web instalable en celular y computador

Este documento sirve como instruccion para que otra IA implemente soporte de instalacion tipo PWA en cualquier proyecto web parecido a este.

## Objetivo

Hacer que una app web pueda:

- instalarse en Android desde Chrome o navegadores compatibles
- instalarse en escritorio desde Chrome, Edge u otros navegadores compatibles
- agregarse a la pantalla de inicio en iPhone y iPad
- abrirse como app independiente, no como una pestaña normal

## Requisitos minimos

La otra IA debe implementar estas piezas:

1. Un archivo `manifest.json`
2. Referencias al manifest e iconos dentro del HTML principal
3. Iconos reales de 192x192 y 512x512
4. Un `service worker`
5. El registro del `service worker` en el frontend
6. Sitio servido por HTTPS en produccion
7. Si es SPA, configuracion de rutas para que cualquier URL cargue la app

Sin `service worker`, muchos navegadores no marcaran la app como instalable aunque exista el manifest.

## Paso 1. Crear el manifest

Crear un archivo publico como `public/manifest.json` con algo equivalente a esto:

```json
{
  "name": "Nombre completo de la app",
  "short_name": "Nombre corto",
  "description": "Descripcion breve",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#111111",
  "orientation": "any",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

## Paso 2. Enlazar el manifest en el HTML principal

En el `index.html` o HTML base, agregar dentro de `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#111111" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Nombre corto" />
<link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />
```

Esto cubre Android, escritorio e instalacion manual en dispositivos Apple.

## Paso 3. Crear y publicar los iconos

Agregar al directorio publico:

- `icon-192.png`
- `icon-512.png`
- opcionalmente `favicon.svg` o `favicon.ico`

Los iconos deben ser reales, cuadrados y legibles en tamaño pequeno. Si se puede, usar versiones `maskable` bien centradas para Android.

## Paso 4. Crear el service worker

Crear un archivo como `public/sw.js` con al menos cache basico del shell de la app.

Ejemplo simple:

```js
const CACHE_NAME = 'app-shell-v1';
const URLS_TO_CACHE = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

Si el proyecto usa Vite, Next, React, Vue o similar, la otra IA puede optar por una solucion mas robusta con plugin PWA, pero el objetivo minimo es el mismo: registrar un `service worker` funcional.

## Paso 5. Registrar el service worker en el frontend

Registrar el archivo en el entrypoint principal, por ejemplo `main.ts`, `index.tsx` o equivalente:

```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('No se pudo registrar el service worker:', error);
    });
  });
}
```

Sin este paso, el `service worker` existe pero no se instala.

## Paso 6. Agregar un boton de instalacion opcional

Para mejorar UX en Android y escritorio, capturar el evento `beforeinstallprompt` y mostrar un boton propio.

Ejemplo:

```ts
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  // Aqui mostrar un boton "Instalar app"
});

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
}
```

En iPhone no existe `beforeinstallprompt`; ahi normalmente solo se muestra una guia tipo: "Usa Compartir > Agregar a pantalla de inicio".

## Paso 7. Configurar rutas si es SPA

Si la app es SPA, cualquier ruta debe devolver el HTML principal. Si no, al abrir la app instalada en una ruta interna puede fallar.

Ejemplos segun hosting:

- Vercel: rewrite de todas las rutas hacia `index.html`
- Netlify: archivo `_redirects`
- Cloudflare Pages: reglas de rutas o configuracion SPA
- Nginx: `try_files` hacia `index.html`

## Paso 8. Verificar que sea realmente instalable

La otra IA debe validar esto en navegador:

1. El sitio abre por HTTPS en produccion o por `localhost` en desarrollo.
2. `manifest.json` carga sin error.
3. Los iconos responden con estado 200.
4. El `service worker` aparece como registrado en DevTools.
5. La app cumple condiciones para mostrar "Instalar".
6. En movil y escritorio se abre en modo `standalone`.

## Checklist final

- manifest enlazado en el HTML
- `name` y `short_name` definidos
- `display: standalone`
- `start_url` correcto
- `theme_color` y `background_color` definidos
- iconos 192 y 512 disponibles
- iconos `maskable` declarados
- `service worker` creado
- `service worker` registrado
- rutas SPA configuradas si aplica
- prueba en HTTPS
- boton de instalacion opcional si el navegador lo soporta

## Instruccion breve para pasar a otra IA

Implementa soporte PWA completo en este proyecto para que la app pueda instalarse en Android, escritorio e iPhone. Necesito que:

1. crees o ajustes `manifest.json`
2. enlaces el manifest, theme-color e iconos en el HTML principal
3. agregues iconos instalables de 192 y 512
4. crees un `service worker` funcional
5. registres el `service worker` en el entrypoint del frontend
6. agregues un boton de instalacion si el navegador soporta `beforeinstallprompt`
7. configures fallback de rutas si el proyecto es SPA
8. verifiques que la app cumpla condiciones de instalacion en navegador

No quiero solo el manifest. Quiero la implementacion completa para que el navegador la considere instalable de verdad.

## Nota importante

Tener solo `manifest.json` no basta. Para instalacion real en la mayoria de navegadores modernos, el proyecto tambien necesita `service worker`, HTTPS y una experiencia base valida de PWA.