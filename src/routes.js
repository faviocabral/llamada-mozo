const express = require('express');
const path = require('path');
const fs = require('fs');
const { publicDir, vapid, mozoKey } = require('./config');
const store = require('./store');

const router = express.Router();
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

// Requiere Authorization: Bearer <MOZO_KEY>  (o ?key= para probar desde el browser)
function requireMozo(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.key;
    if (token !== mozoKey) return res.status(401).json({ error: 'No autorizado' });
    next();
}

// --- App del cliente (React) por código público de mesa: /m/m5 ---
router.get('/m/:code', (req, res) => {
    const index = path.join(CLIENT_DIST, 'index.html');
    if (!fs.existsSync(index)) {
        return res.status(503).send('La app del cliente no está compilada. Corré: npm run build');
    }
    res.sendFile(index);
});

// --- Info pública de la mesa para la app (nombre del local, nro, menú) ---
router.get('/api/mesa/:code', (req, res) => {
    const mesa = store.getMesaByCode(req.params.code);
    if (!mesa) return res.status(404).json({ error: 'Mesa inexistente' });
    const suc = store.getSucursal(mesa.sucursalId);
    const tenant = suc && store.getTenant(suc.tenantId);
    res.json({
        mesa: { code: mesa.id, numero: mesa.numero },
        sucursal: suc ? { id: suc.id, nombre: suc.nombre } : null,
        tenant: tenant ? { id: tenant.id, nombre: tenant.nombre } : null,
        menu: store.getMenu(mesa.sucursalId),
        vapidKey: vapid.publicKey
    });
});

// --- Suscripción push del cliente de la mesa (aviso "pedido listo") ---
// Pública: cualquier cliente con el QR puede suscribirse a los avisos de su mesa.
router.post('/api/mesa/:code/push-sub', (req, res) => {
    const mesa = store.getMesaByCode(req.params.code);
    if (!mesa) return res.status(404).json({ error: 'Mesa inexistente' });
    const sub = req.body;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint || typeof sub.keys !== 'object' || !sub.keys) {
        return res.status(400).json({ error: 'Suscripción inválida' });
    }
    store.addMesaSubscription(mesa.id, { endpoint: sub.endpoint, keys: sub.keys });
    res.status(201).json({ ok: true });
});

// --- Rutas legacy ---
router.get('/mesa/:id', (req, res) => {
    res.sendFile(path.join(publicDir, 'mesa.html'));
});

router.get('/mozo', (req, res) => {
    res.sendFile(path.join(publicDir, 'mozo.html'));
});

router.get('/cocina', (req, res) => {
    res.sendFile(path.join(publicDir, 'cocina.html'));
});

router.get('/api/key', requireMozo, (req, res) => {
    res.json({ publicKey: vapid.publicKey });
});

router.post('/api/suscribir', requireMozo, (req, res) => {
    const sub = req.body;
    if (!sub || typeof sub.endpoint !== 'string' || typeof sub.keys !== 'object' || !sub.keys) {
        return res.status(400).json({ error: 'Suscripción inválida' });
    }
    store.addSubscription(sub);
    console.log('✅ Dispositivo de mozo suscripto a push.');
    res.status(201).json({ ok: true });
});

// --- Diagnóstico de push (solo mozo): conteo + envío de prueba a todos ---
router.get('/api/push-debug', requireMozo, (req, res) => {
    res.json({
        mozos: store.getSubscriptions().length,
        mesas: store.getAllMesaSubscriptions().length
    });
});

const push = require('./push');
router.get('/api/push-test', requireMozo, async (req, res) => {
    try {
        res.json(await push.testEnvio());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
