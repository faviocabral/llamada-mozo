const https = require('https');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { vapid } = require('./config');
const store = require('./store');

webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

// En redes con inspección TLS (proxys/firewalls corporativos) el envío a FCM
// falla con SELF_SIGNED_CERT_IN_CHAIN. Opciones en .env, acotadas SOLO a push:
//   PUSH_TLS_INSECURE=true   -> no verifica el cert en requests a FCM
//   EXTRA_CA_CERT=./ca.pem   -> confía además en una CA propia
//   HTTPS_PROXY=http://...   -> sale a internet vía un proxy explícito
const pushOptions = {};
if (process.env.PUSH_TLS_INSECURE === 'true') {
    pushOptions.agent = new https.Agent({ rejectUnauthorized: false });
    console.log('⚠️  PUSH_TLS_INSECURE activo: TLS sin verificar solo en envíos push a FCM.');
} else if (process.env.EXTRA_CA_CERT) {
    pushOptions.agent = new https.Agent({
        ca: [...require('tls').rootCertificates, fs.readFileSync(path.resolve(process.env.EXTRA_CA_CERT))]
    });
}
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    pushOptions.proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
}

// Envía a una lista de suscripciones. Las inválidas (403/404/410) se eliminan
// solas vía `onExpirada(endpoint)` para que cada canal limpie su propio store.
function enviar(payload, subs, onExpirada) {
    const body = JSON.stringify(payload);
    for (const sub of subs) {
        webpush.sendNotification(sub, body, pushOptions).catch(err => {
            if (err.statusCode === 404 || err.statusCode === 410) {
                console.log(`🗑️ Suscripción expirada eliminada: ${sub.endpoint.slice(-30)}`);
                onExpirada(sub.endpoint);
            } else if (err.statusCode === 403) {
                console.error('❌ Push 403: la suscripción fue creada con otra llave VAPID. Hay que re-suscribir el dispositivo.');
                onExpirada(sub.endpoint);
            } else {
                console.error('❌ Error enviando push:', err.statusCode || err.message);
            }
        });
    }
}

const aMozos = (payload) =>
    enviar(payload, store.getSubscriptions(), e => store.removeSubscription(e));

const aMesa = (payload, mesaCode) =>
    enviar(payload, store.getMesaSubscriptions(mesaCode), e => store.removeMesaSubscription(e));

// Avisos de estado de UN pedido: solo al dispositivo que lo envió (clienteId).
// Fallback: subs sin clienteId (dispositivos con build viejo) reciben broadcast —
// en cuanto recarguen la app se re-suscriben con su clienteId y se filtran.
const aPedido = (payload, pedido) => {
    let subs = store.getMesaSubscriptions(pedido.mesaCode);
    if (pedido.clienteId) {
        subs = subs.filter(s => !s.clienteId || s.clienteId === pedido.clienteId);
    }
    enviar(payload, subs, e => store.removeMesaSubscription(e));
};

function notificarLlamado(call) {
    aMozos({
        title: `⚠️ Llamado — Mesa ${call.mesaNumero || call.mesa}`,
        body: 'Solicitan la presencia del mozo.',
        tag: `llamado-mesa-${call.mesa}`,
        url: '/mozo',
        call
    });
}

function notificarPedido(pedido) {
    const resumen = pedido.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
    aMozos({
        title: `🍽️ Pedido — Mesa ${pedido.mesaNumero}`,
        body: resumen.slice(0, 120),
        tag: `pedido-${pedido.id}`,
        url: '/mozo',
        pedido
    });
}

// ---------- Avisos al CLIENTE de la mesa (seguimiento del pedido) ----------

function notificarPedidoConfirmado(pedido) {
    aPedido({
        title: `✅ Pedido confirmado — Mesa ${pedido.mesaNumero}`,
        body: 'El mozo lo tomó y ya pasó a cocina.',
        tag: `pedido-ok-${pedido.id}`,
        url: `/m/${pedido.mesaCode}`
    }, pedido.mesaCode);
}

function notificarPedidoRechazado(pedido) {
    aPedido({
        title: `❌ Pedido rechazado — Mesa ${pedido.mesaNumero}`,
        body: 'No pudimos tomar tu pedido. Consultá con el mozo.',
        tag: `pedido-no-${pedido.id}`,
        url: `/m/${pedido.mesaCode}`
    }, pedido.mesaCode);
}

// Aviso al CLIENTE de la mesa: el mozo atendió su llamado y va en camino.
function notificarMozoEnCamino(call) {
    aMesa({
        title: `🙋 ¡El mozo va en camino! — Mesa ${call.mesaNumero || call.mesa}`,
        body: 'Ya vio tu llamado y está por llegar a tu mesa.',
        tag: `mozo-camino-${call.mesa}`,
        url: `/m/${call.mesa}`
    }, call.mesa);
}

// Aviso al CLIENTE de la mesa: cocina empezó a preparar su pedido.
function notificarPedidoPreparando(pedido) {
    aPedido({
        title: `👨‍🍳 Preparando tu pedido — Mesa ${pedido.mesaNumero}`,
        body: 'Cocina ya está trabajando en tu pedido.',
        tag: `pedido-prep-${pedido.id}`,
        url: `/m/${pedido.mesaCode}`
    }, pedido.mesaCode);
}

// Aviso al CLIENTE de la mesa: su pedido pasó a 'listo'.
function notificarPedidoListo(pedido) {
    aPedido({
        title: `🎉 ¡Tu pedido está listo! — Mesa ${pedido.mesaNumero}`,
        body: 'El mozo ya lo está por llevar a tu mesa.',
        tag: `pedido-listo-${pedido.id}`,
        url: `/m/${pedido.mesaCode}`
    }, pedido.mesaCode);
}

// Aviso a los MOZOS cuando cocina marca un pedido listo (para ir a buscarlo).
function notificarPedidoListoMozo(pedido) {
    aMozos({
        title: `✅ Listo para servir — Mesa ${pedido.mesaNumero}`,
        body: 'Cocina terminó el pedido, retirar y llevar a la mesa.',
        tag: `pedido-servir-${pedido.id}`,
        url: '/mozo',
        pedido
    });
}

// Diagnóstico: envía una notificación de prueba a TODAS las suscripciones
// (mozos y mesas) y devuelve el resultado real de FCM por endpoint.
async function testEnvio() {
    const body = JSON.stringify({
        title: '🧪 Test de push',
        body: 'Si ves esta notificación, el push funciona.',
        tag: 'test-' + Date.now(),
        url: '/'
    });
    const subs = [...store.getSubscriptions(), ...store.getAllMesaSubscriptions()];
    const resultados = await Promise.allSettled(
        subs.map(s => webpush.sendNotification(s, body, pushOptions))
    );
    return subs.map((s, i) => ({
        endpoint: '…' + s.endpoint.slice(-25),
        mesa: s.mesaCode || '(mozo)',
        resultado: resultados[i].status === 'fulfilled'
            ? resultados[i].value.statusCode
            : (resultados[i].reason.statusCode || resultados[i].reason.message)
    }));
}

module.exports = {
    notificarLlamado, notificarPedido, notificarMozoEnCamino, testEnvio,
    notificarPedidoConfirmado, notificarPedidoRechazado,
    notificarPedidoPreparando, notificarPedidoListo, notificarPedidoListoMozo
};
