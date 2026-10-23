# Llamador de Mozos + Pedidos QR

Sistema cliente → mozo por QR con menú y pedidos en tiempo real (Socket.IO),
notificaciones push (Web Push/FCM), y modelo multi-tenant
(`tenant → sucursal → mesas/mozos/menú`).

## Flujo

1. El cliente escanea el QR de su mesa → abre `/m/<code>` (app React) → ve el
   home, el menú, arma su pedido o llama al mozo.
2. Cada integrante de la mesa puede pedir con su propio celular: los pedidos
   quedan agrupados por mesa y cada quien puede poner su nombre.
3. El pedido llega **en tiempo real** al panel del mozo (sala `mozos:<sucursal>`)
   y como **notificación push** si la pantalla está cerrada.
4. Flujo del pedido: `nuevo` → el mozo **confirma o rechaza** (la mesa recibe
   aviso) → pasa al panel de **cocina** (`/cocina`) que marca *preparando* →
   *listo* → la mesa recibe `pedido-actualizado` (🎉 + vibración) y **push** si
   activó los avisos (botón 🔔 en la pestaña Estado). El mozo lo marca
   **entregado** al llevarlo a la mesa.
5. Llamados: la mesa toca 🔔 → el mozo recibe la alerta → **✓ En camino** →
   la mesa recibe `mozo-en-camino`. Historial + **↩ Deshacer** disponibles.

## Datos demo (seed)

En la primera corrida se crea: tenant *Restaurante Demo*, sucursal *Centro*,
mesas `m1`–`m10` y un menú de ejemplo en `data/data.json`.

QR de cada mesa → `https://TU-DOMINIO/m/m5` (probá `http://localhost:3010/m/m5`).

## Arranque

```bash
npm install        # una sola vez
npm run build      # compila la app React a client/dist
npm start          # http://localhost:3010
npm run dev:client # re-build automático de React al editar (dejar corriendo)
```

Para desarrollo con hot-reload: `npx vite` (puerto 5173, proxy al 3010).

Al primer arranque se generan en `.env`: `MOZO_KEY` y las llaves VAPID.

## HTTPS (obligatorio para push en producción)

La Push API solo funciona en `localhost` o `https`. Para el celular del mozo
hace falta: reverse proxy con certificado, túnel (ngrok/Cloudflare), o
`SSL_KEY`/`SSL_CERT` en `.env`.

## Redes con inspección TLS / proxy

`PUSH_TLS_INSECURE=true`, `EXTRA_CA_CERT=./ca.pem`, `HTTPS_PROXY=http://ip:port`
en `.env` — afectan solo a las requests de push.

## Estructura

```
server.js            Entrada: express + http(s) + socket.io + dist de React
src/config.js        .env (parser propio), VAPID, MOZO_KEY, SSL
src/store.js         Entidades + seed: tenants, sucursales, mesas, menú,
                     llamados, pedidos, suscripciones (data/data.json)
src/push.js          Web Push genérico (llamados y pedidos) + limpieza de subs
src/routes.js        /m/:code (SPA), /api/mesa/:code, /mozo, /api/*
src/sockets.js       Salas (mozos:<suc>, m:<code>), llamados, pedidos, acks
public/mozo.html     Panel del mozo (llamados + pedidos + historial)
public/mesa.html     Legacy (reemplazada por la app React)
public/sw.js         Service Worker: push → notificación → abre /mozo
client/              App React (Vite): Home / Menú / Pedido+Estado
test/smoke.js        Test E2E del protocolo socket.io (21 chequeos)
```

## Test

```bash
PORT=3011 node server.js   # en una terminal
PORT=3011 npm run smoke    # en otra
```

## Deploy (Render)

El servidor necesita un proceso persistente (Socket.IO) → Render/Railway/Fly
sirven; Vercel/Netlify NO (serverless, sin WebSockets persistentes).

1. Subí el repo a GitHub.
2. En Render: **New → Blueprint** → elegí el repo (usa `render.yaml`), o
   **New → Web Service** con:
   - Build: `npm install && npm run build`
   - Start: `npm start`
3. Definí como env vars: `MOZO_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   (copialas de tu `.env` local — así no cambian entre deploys).
   `PORT` la setea Render sola. `SSL_*` no hace falta (Render termina TLS).
   `PUSH_TLS_INSECURE` no hace falta (era por tu red local).
4. Listo: `https://tu-app.onrender.com/m/m5`, `/mozo?key=...`, `/cocina?key=...`

Notas del plan free: se duerme a los ~15 min sin tráfico (la primera carga
tarda en despertar) y el filesystem es efímero — `data.json` se resetea en
cada deploy (el seed vuelve a crear las mesas automáticamente).

## Eventos socket principales

| Evento | Quién | Descripción |
|---|---|---|
| `unirse-mesa` / `cliente-llama` / `cliente-cancela` | mesa | llamados |
| `cliente-pedido` / `pedidos-mesa` | mesa | pedidos (validados, total en server) |
| `llamado-nuevo/atendido/cancelado/revertido` | server → mozos | sync de llamados |
| `pedido-nuevo` / `pedido-actualizado` | server → mozos + mesa | sync de pedidos |
| `mozo-atendio-llamado` / `mozo-revirtio-llamado` | mozo (auth) | llamados |
| `mozo-pedido-confirmado` / `mozo-pedido-rechazado` | mozo (auth) | aceptar/rechazar |
| `cocina-pedido-preparando` / `mozo-pedido-listo` | cocina (auth) | trabajo de cocina |
| `mozo-pedido-entregado` | mozo (auth) | cierre del pedido |

## Próximos pasos posibles

- Migrar el panel del mozo a React (misma codebase `client/`).
- Admin de menú/mesas/mozos por sucursal (hoy se editan en `data/data.json`).
- Auth por sucursal para mozos (hoy `MOZO_KEY` única global).
- Panel de cocina separado del de mozos.
- Pasar el store a SQLite/Postgres cuando haya volumen real.
