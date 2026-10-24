// Smoke test del flujo completo sin navegador.
// Levantá el servidor con  PORT=3011 node server.js  y corré  PORT=3011 npm run smoke
// Habla el protocolo Socket.IO v4 / Engine.IO v4 directo sobre WebSocket (paquete 'ws').
const http = require('http');
const WebSocket = require('ws');
const config = require('../src/config');

const PORT = config.port;
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/socket.io/?EIO=4&transport=websocket`;

// ---------- Cliente Socket.IO mínimo ----------
class MiniSocket {
    constructor(auth) {
        this.auth = auth || {};
        this.ws = new WebSocket(WS_URL);
        this.handlers = new Map();
        this.acks = new Map();
        this.received = [];
        this.nextAckId = 0;
        this.ready = new Promise((resolve, reject) => {
            const onMsg = (raw) => {
                const msg = raw.toString();
                if (msg[0] === '0') { // handshake Engine.IO → enviar CONNECT con auth
                    this.ws.send('40' + JSON.stringify(this.auth));
                    return;
                }
                if (msg.startsWith('40')) { // CONNECT ok
                    this.ws.off('message', onMsg);
                    this.ws.on('message', (r) => this._onMessage(r.toString()));
                    return resolve(this);
                }
                if (msg.startsWith('44')) { // CONNECT_ERROR
                    return reject(new Error('connect_error: ' + msg.slice(2)));
                }
            };
            this.ws.on('message', onMsg);
            this.ws.on('error', reject);
            setTimeout(() => reject(new Error('timeout en handshake')), 5000);
        });
    }

    _onMessage(msg) {
        if (msg === '2') { this.ws.send('3'); return; } // ping → pong
        if (msg.startsWith('43')) { // ACK: 43<id>[payload]
            const rest = msg.slice(2);
            const idx = rest.indexOf('[');
            const id = rest.slice(0, idx);
            const data = JSON.parse(rest.slice(idx));
            const cb = this.acks.get(id);
            this.acks.delete(id);
            if (cb) cb(data[0]);
            return;
        }
        if (msg.startsWith('42')) { // EVENT: 42["evento", data]
            const [event, data] = JSON.parse(msg.slice(2));
            this.received.push({ event, data });
            (this.handlers.get(event) || []).forEach(fn => fn(data));
        }
    }

    emit(event, data, cb) {
        if (cb) {
            const id = String(this.nextAckId++);
            this.acks.set(id, cb);
            this.ws.send(`42${id}${JSON.stringify([event, data])}`);
        } else {
            this.ws.send(`42${JSON.stringify([event, data])}`);
        }
    }

    emitAck(event, data, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`timeout esperando ack de '${event}'`)), timeoutMs);
            this.emit(event, data, (res) => { clearTimeout(t); resolve(res); });
        });
    }

    waitFor(event, timeoutMs = 5000, pred = null) {
        const ya = this.received.find(r => r.event === event && (!pred || pred(r.data)));
        if (ya) return Promise.resolve(ya.data);
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`timeout esperando '${event}'`)), timeoutMs);
            this.on(event, (data) => {
                if (pred && !pred(data)) return;
                clearTimeout(t); resolve(data);
            });
        });
    }

    on(event, fn) {
        if (!this.handlers.has(event)) this.handlers.set(event, []);
        this.handlers.get(event).push(fn);
    }

    close() { try { this.ws.close(); } catch {} }
}

// ---------- HTTP POST mínimo ----------
function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => resolve({ status: res.statusCode, body: b }));
        });
        req.on('error', reject);
        req.end(data);
    });
}

// ---------- HTTP GET mínimo ----------
function httpGet(url, headers) {
    return new Promise((resolve, reject) => {
        http.get(url, { headers }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

// ---------- Test ----------
const assert = (cond, msg) => { if (!cond) throw new Error('FALLO: ' + msg); };
let pasados = 0;
const ok = (msg) => { pasados++; console.log('  ✓', msg); };

async function main() {
    console.log(`\nProbando contra ${BASE}\n`);

    // 1. Endpoints protegidos por clave
    const sinAuth = await httpGet(`${BASE}/api/key`);
    assert(sinAuth.status === 401, '/api/key sin clave debe dar 401');
    ok('/api/key rechaza sin clave (401)');

    const conAuth = await httpGet(`${BASE}/api/key`, { Authorization: `Bearer ${config.mozoKey}` });
    assert(conAuth.status === 200, '/api/key con clave debe dar 200');
    assert(JSON.parse(conAuth.body).publicKey, 'debe devolver publicKey');
    ok('/api/key devuelve la llave VAPID pública');

    // 2. Mozo con clave incorrecta → conexión rechazada
    let rechazado = false;
    try { await new MiniSocket({ role: 'mozo', key: 'clave-mala' }).ready; }
    catch { rechazado = true; }
    assert(rechazado, 'clave incorrecta debe rechazar la conexión');
    ok('mozo con clave incorrecta es rechazado');

    // 3. Mozo correcto → recibe lista de pendientes al conectar
    const mozo = await new MiniSocket({ role: 'mozo', key: config.mozoKey }).ready;
    const pend = await mozo.waitFor('llamados-pendientes');
    assert(Array.isArray(pend), 'llamados-pendientes debe ser un array');
    ok('mozo conectado recibe llamados-pendientes');

    // 4. Mesa llama → mozo recibe en tiempo real
    const mesa = await new MiniSocket({}).ready;
    mesa.emit('unirse-mesa', '99');
    const esperaNuevo = mozo.waitFor('llamado-nuevo');
    const resLlama = await mesa.emitAck('cliente-llama', { mesa: '99' });
    assert(resLlama.ok === true && resLlama.call.id, 'cliente-llama debe responder ok con el llamado');
    const call = await esperaNuevo;
    assert(call.mesa === '99', 'llamado-nuevo debe traer la mesa correcta');
    ok('llamado llega al mozo por socket en tiempo real');

    // 5. Anti-spam: segundo llamado de la misma mesa → yaPendiente
    const dup = await mesa.emitAck('cliente-llama', { mesa: '99' });
    assert(dup.ok === false && dup.yaPendiente === true, 'segundo llamado debe dar yaPendiente');
    ok('llamado duplicado se rechaza (yaPendiente)');

    // 6. Mesa sin clave NO puede atender
    const noAuth = await mesa.emitAck('mozo-atendio-llamado', { id: call.id });
    assert(noAuth.ok === false, 'mesa no debe poder atender llamados');
    ok('mozo-atendio-llamado rechazado desde socket sin clave');

    // 7. Mozo atiende → mesa recibe mozo-en-camino, mozos reciben llamado-atendido
    const esperaCamino = mesa.waitFor('mozo-en-camino');
    const esperaAtendido = mozo.waitFor('llamado-atendido');
    const resAtender = await mozo.emitAck('mozo-atendio-llamado', { id: call.id });
    assert(resAtender.ok === true, 'atender debe responder ok');
    await esperaCamino;
    const atendido = await esperaAtendido;
    assert(atendido.id === call.id && atendido.estado === 'atendido', 'llamado-atendido debe traer el llamado con estado atendido');
    ok('mozo atiende → mesa recibe "mozo-en-camino" y llamado pasa a atendido');

    // 8. Un segundo mozo conecta → recibe pendientes + historial de atendidas
    const mozo2 = await new MiniSocket({ role: 'mozo', key: config.mozoKey }).ready;
    const atRec = await mozo2.waitFor('atendidos-recientes');
    assert(Array.isArray(atRec) && atRec.some(c => c.id === call.id), 'atendidos-recientes debe incluir el llamado atendido');
    ok('mozo que conecta recibe historial de atendidas recientes');

    // 9. Revertir sin clave → rechazado
    const revNoAuth = await mesa.emitAck('mozo-revirtio-llamado', { id: call.id });
    assert(revNoAuth.ok === false, 'mesa no debe poder revertir');
    ok('mozo-revirtio-llamado rechazado desde socket sin clave');

    // 10. Mozo revierte → vuelve a pendiente y mesa recibe llamado-reactivado
    const esperaRevert = mozo.waitFor('llamado-revertido');
    const esperaReactivada = mesa.waitFor('llamado-reactivado');
    const resRevert = await mozo2.emitAck('mozo-revirtio-llamado', { id: call.id });
    assert(resRevert.ok === true, 'revertir debe responder ok');
    const revertido = await esperaRevert;
    assert(revertido.id === call.id && revertido.estado === 'pendiente', 'llamado-revertido debe volver a pendiente');
    await esperaReactivada;
    ok('mozo revierte → llamado vuelve a pendiente y mesa recibe "llamado-reactivado"');

    // 11. Revertir algo que no está atendido → error
    const revInvalido = await mozo.emitAck('mozo-revirtio-llamado', { id: 'id-inexistente' });
    assert(revInvalido.ok === false, 'revertir llamado inexistente debe fallar');
    ok('revertir llamado inexistente da error');

    // 12. Mesa cancela el llamado reactivado → mozos reciben llamado-cancelado
    const esperaCancel = mozo.waitFor('llamado-cancelado');
    const resCancel = await mesa.emitAck('cliente-cancela', { mesa: '99' });
    assert(resCancel.ok === true, 'cancelar debe responder ok');
    await esperaCancel;
    ok('mesa cancela → mozos reciben "llamado-cancelado"');

    // ---------- Pedidos ----------

    // 13. Info de mesa por API
    const resMesa = await httpGet(`${BASE}/api/mesa/m5`);
    assert(resMesa.status === 200, '/api/mesa/m5 debe existir');
    const infoMesa = JSON.parse(resMesa.body);
    assert(infoMesa.mesa.numero === '5' && infoMesa.menu.length > 0, 'debe devolver mesa + menú');
    ok('/api/mesa/:code devuelve mesa, sucursal y menú');

    const resMesaMala = await httpGet(`${BASE}/api/mesa/noexiste`);
    assert(resMesaMala.status === 404, 'mesa inexistente debe dar 404');
    ok('/api/mesa/:code inválido da 404');

    // 13b. Push del cliente: llave VAPID pública en la info de la mesa
    assert(infoMesa.vapidKey, '/api/mesa debe incluir la llave VAPID pública');
    ok('/api/mesa devuelve la llave VAPID para suscribir al cliente');

    // 13c. Suscripción push del cliente (aviso "pedido listo")
    const subFalsa = { endpoint: 'https://push.example/sub-test', keys: { p256dh: 'x', auth: 'y' } };
    const resSub = await httpPost(`${BASE}/api/mesa/m5/push-sub`, subFalsa);
    assert(resSub.status === 201, 'push-sub válido debe dar 201');
    ok('cliente puede suscribirse a los avisos de su mesa');

    const resSubMala = await httpPost(`${BASE}/api/mesa/m5/push-sub`, { endpoint: '' });
    assert(resSubMala.status === 400, 'push-sub inválido debe dar 400');
    const resSub404 = await httpPost(`${BASE}/api/mesa/noexiste/push-sub`, subFalsa);
    assert(resSub404.status === 404, 'push-sub en mesa inexistente debe dar 404');
    ok('push-sub rechaza body inválido y mesa inexistente');

    // La mesa se une también a la sala del código m5 para recibir updates de pedido
    mesa.emit('unirse-mesa', 'm5');

    // 14. Pedido con item inválido → rechazado (nunca confiar en el cliente)
    const pedMalo = await mesa.emitAck('cliente-pedido', { mesa: 'm5', items: [{ id: 'trucho', cantidad: 1 }] });
    assert(pedMalo.ok === false, 'item inexistente debe rechazarse');
    ok('pedido con item inválido es rechazado');

    // 15. Pedido válido → mozo recibe pedido-nuevo, total calculado en server
    const esperaPedido = mozo.waitFor('pedido-nuevo');
    const resPedido = await mesa.emitAck('cliente-pedido', {
        mesa: 'm5', cliente: 'Juan', nota: 'sin cebolla',
        items: [{ id: 'p1', cantidad: 2 }, { id: 'b2', cantidad: 1 }]
    });
    assert(resPedido.ok === true, 'pedido válido debe responder ok');
    assert(resPedido.pedido.total === 2 * 38000 + 8000, 'el total lo calcula el servidor');
    const pedido = await esperaPedido;
    assert(pedido.mesaNumero === '5' && pedido.cliente === 'Juan', 'pedido-nuevo debe traer mesa y cliente');
    ok('pedido llega al mozo en tiempo real con total calculado en server');

    // 16. La mesa consulta sus pedidos
    const resLista = await mesa.emitAck('pedidos-mesa', { mesa: 'm5' });
    assert(resLista.ok && resLista.pedidos.some(p => p.id === pedido.id), 'pedidos-mesa debe listar el pedido');
    ok('pedidos-mesa devuelve los pedidos de la mesa');

    // 17. Transición inválida: nuevo -> listo salteando la confirmación falla
    const salto = await mozo.emitAck('mozo-pedido-listo', { id: pedido.id });
    assert(salto.ok === false, 'nuevo->listo sin confirmar debe fallar');
    ok('transición inválida (salteando confirmación) es rechazada');

    // 18. Mozo confirma → mesa recibe pedido-actualizado 'confirmado'
    const esperaConf = mesa.waitFor('pedido-actualizado', 5000, p => p.estado === 'confirmado');
    const resConf = await mozo.emitAck('mozo-pedido-confirmado', { id: pedido.id });
    assert(resConf.ok === true && resConf.pedido.estado === 'confirmado', 'confirmar debe responder ok');
    await esperaConf;
    ok('mozo confirma → mesa recibe "pedido-actualizado" (confirmado)');

    // 19. Cocina empieza a preparar → mesa recibe 'preparando'
    const esperaPrep = mesa.waitFor('pedido-actualizado', 5000, p => p.estado === 'preparando');
    const resPrep = await mozo.emitAck('cocina-pedido-preparando', { id: pedido.id });
    assert(resPrep.ok === true && resPrep.pedido.estado === 'preparando', 'preparando debe responder ok');
    await esperaPrep;
    ok('cocina marca preparando → mesa recibe el avance');

    // 20. Cocina marca listo → mesa recibe 'listo'
    const esperaListoM = mesa.waitFor('pedido-actualizado', 5000, p => p.estado === 'listo');
    const resListo = await mozo.emitAck('mozo-pedido-listo', { id: pedido.id });
    assert(resListo.ok === true && resListo.pedido.estado === 'listo', 'marcar listo debe responder ok');
    const actListo = await esperaListoM;
    assert(actListo.estado === 'listo', 'la mesa debe recibir estado listo');
    ok('cocina marca listo → mesa recibe "pedido-actualizado" (listo)');

    // 20b. Partidas: el pedido trae su ticket por estación; entregar una
    // estación inexistente en este pedido ('barra') debe fallar
    assert(Array.isArray(resListo.pedido.partidas) && resListo.pedido.partidas.length === 1
        && resListo.pedido.partidas[0].estacion === 'cocina',
        'sin categorías de barra todo cae en la partida cocina');
    const entMala = await mozo.emitAck('mozo-partida-entregado', { id: pedido.id, estacion: 'barra' });
    assert(entMala.ok === false, 'entregar partida inexistente debe fallar');
    ok('pedido lleva partidas por estación + entrega de partida inválida falla');

    // 21. Mozo marca entregado → estado final
    const resEntregado = await mozo.emitAck('mozo-pedido-entregado', { id: pedido.id });
    assert(resEntregado.ok === true && resEntregado.pedido.estado === 'entregado', 'entregar debe responder ok');
    ok('mozo marca entregado → estado final');

    // 22. Rechazo: segundo pedido, el mozo lo rechaza → mesa recibe 'rechazado'
    const resPed2 = await mesa.emitAck('cliente-pedido', { mesa: 'm5', items: [{ id: 'b1', cantidad: 1 }] });
    assert(resPed2.ok === true, 'segundo pedido debe responder ok');
    const esperaRech = mesa.waitFor('pedido-actualizado', 5000, p => p.estado === 'rechazado');
    const resRech = await mozo.emitAck('mozo-pedido-rechazado', { id: resPed2.pedido.id });
    assert(resRech.ok === true && resRech.pedido.estado === 'rechazado', 'rechazar debe responder ok');
    await esperaRech;
    ok('mozo rechaza → mesa recibe "pedido-actualizado" (rechazado)');

    // 23. Mesa sin clave no puede avanzar pedidos
    const pedAuth = await mesa.emitAck('mozo-pedido-listo', { id: pedido.id });
    assert(pedAuth.ok === false, 'mesa no debe poder avanzar pedidos');
    ok('avance de pedido rechazado desde socket sin clave');

    mozo.close();
    mozo2.close();
    mesa.close();
    console.log(`\n✅ ${pasados} chequeos pasaron\n`);
    process.exit(0);
}

main().catch((err) => {
    console.error('\n❌', err.message, '\n');
    process.exit(1);
});
