const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const config = require('./src/config');
const routes = require('./src/routes');
const registerSockets = require('./src/sockets');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(config.publicDir));
app.use(express.static(path.join(__dirname, 'client', 'dist'))); // app React compilada
app.use(routes);

// HTTPS opcional vía SSL_KEY + SSL_CERT en .env.
// Las notificaciones push SOLO funcionan en contextos seguros (https o localhost):
// para el celular del mozo en la red del local hace falta HTTPS (ver README).
let server;
if (config.ssl.key && config.ssl.cert) {
    server = https.createServer({
        key: fs.readFileSync(config.ssl.key),
        cert: fs.readFileSync(config.ssl.cert)
    }, app);
} else {
    server = http.createServer(app);
}

const io = new Server(server);
registerSockets(io);

server.listen(config.port, () => {
    const proto = config.ssl.cert ? 'https' : 'http';
    console.log(`� Servidor activo en ${proto}://localhost:${config.port}`);
    console.log(`🍽️  Ejemplo de mesa:  ${proto}://localhost:${config.port}/mesa/5`);
    console.log(`🧑‍🍳 Panel del mozo: ${proto}://localhost:${config.port}/mozo?key=${config.mozoKey}`);
    if (!config.ssl.cert) {
        console.log('⚠️  HTTP plano: el push solo funciona en localhost. Para el celular del mozo configurá HTTPS (SSL_KEY/SSL_CERT en .env).');
    }
});
