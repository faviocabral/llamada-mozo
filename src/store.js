const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir, atendidosTtlMin } = require('./config');

const FILE = path.join(dataDir, 'data.json');

// El servidor es la fuente de verdad.
// Modelo multi-tenant: tenant -> sucursal -> mesas / menú / pedidos.
// calls:    [{id, mesa, mesaNumero, sucursalId, hora, estado, atendidaHora?}]
// pedidos:  [{id, mesaCode, mesaNumero, sucursalId, cliente, items, nota, total, estado, hora}]
let state = {
    calls: [],
    subscriptions: [],
    mesaSubscriptions: [],
    tenants: [],
    sucursales: [],
    mesas: [],
    menu: [],
    pedidos: []
};

const expirada = (c) =>
    c.estado === 'atendido' &&
    Date.now() - new Date(c.atendidaHora || c.hora).getTime() > atendidosTtlMin * 60000;

// Estados finales de un pedido (ya no requieren acción de nadie)
const PEDIDO_TERMINAL = ['entregado', 'rechazado'];

// Transiciones permitidas del flujo: nuevo -> confirmado/rechazado (mozo),
// confirmado -> preparando -> listo (cocina), listo -> entregado (mozo).
const PEDIDO_TRANSICIONES = {
    nuevo: ['confirmado', 'rechazado'],
    confirmado: ['preparando', 'rechazado'],
    preparando: ['listo'],
    listo: ['entregado'],
    entregado: [],
    rechazado: []
};

function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
}

function prune() {
    const antes = state.calls.length + state.pedidos.length;
    state.calls = state.calls.filter(c => !expirada(c));
    const hace24h = Date.now() - 24 * 3600 * 1000;
    state.pedidos = state.pedidos.filter(p =>
        !PEDIDO_TERMINAL.includes(p.estado) || new Date(p.entregadoHora || p.hora) > hace24h);
    if (state.calls.length + state.pedidos.length !== antes) persist();
}

// Datos demo: 1 tenant / 1 sucursal / 10 mesas / menú de ejemplo.
// Se crean solo en la primera corrida (data.json vacío).
function seed() {
    if (state.tenants.length) return;
    state.tenants = [{ id: 't1', nombre: 'Restaurante Demo' }];
    state.sucursales = [{ id: 's1', tenantId: 't1', nombre: 'Sucursal Centro' }];
    state.mesas = Array.from({ length: 10 }, (_, i) => ({
        id: 'm' + (i + 1),
        numero: String(i + 1),
        sucursalId: 's1'
    }));
    state.menu = [
        { id: 'e1', sucursalId: 's1', categoria: 'Entradas', nombre: 'Empanadas de carne', descripcion: 'Orden de 3 unidades, carne vacuna', precio: 15000, disponible: true },
        { id: 'e2', sucursalId: 's1', categoria: 'Entradas', nombre: 'Provoleta', descripcion: 'Queso provolone a la plancha con orégano', precio: 22000, disponible: true },
        { id: 'e3', sucursalId: 's1', categoria: 'Entradas', nombre: 'Papas rústicas', descripcion: 'Con salsa de la casa', precio: 18000, disponible: true },
        { id: 'p1', sucursalId: 's1', categoria: 'Platos', nombre: 'Lomito completo', descripcion: 'Jamón, queso, huevo y papas fritas', precio: 38000, disponible: true },
        { id: 'p2', sucursalId: 's1', categoria: 'Platos', nombre: 'Milanesa napolitana', descripcion: 'Con puré de papas o ensalada', precio: 42000, disponible: true },
        { id: 'p3', sucursalId: 's1', categoria: 'Platos', nombre: 'Pizza muzzarella', descripcion: 'Grande, 8 porciones', precio: 35000, disponible: true },
        { id: 'b1', sucursalId: 's1', categoria: 'Bebidas', nombre: 'Cerveza artesanal', descripcion: 'IPA de barril, 500ml', precio: 18000, disponible: true },
        { id: 'b2', sucursalId: 's1', categoria: 'Bebidas', nombre: 'Gaseosa', descripcion: 'Línea cola o lima, 500ml', precio: 8000, disponible: true },
        { id: 'b3', sucursalId: 's1', categoria: 'Bebidas', nombre: 'Agua mineral', descripcion: 'Con o sin gas, 500ml', precio: 6000, disponible: true },
        { id: 'd1', sucursalId: 's1', categoria: 'Postres', nombre: 'Flan casero', descripcion: 'Con dulce de leche y crema', precio: 14000, disponible: true }
    ];
    persist();
    console.log('🌱 Seed creado: tenant demo, sucursal Centro, mesas m1-m10, menú de ejemplo.');
}

function load() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        state.calls = (Array.isArray(parsed.calls) ? parsed.calls : []).map(c => ({
            ...c,
            estado: c.estado === 'atendido' ? 'atendido' : 'pendiente',
            sucursalId: c.sucursalId || 's1',
            mesaNumero: c.mesaNumero || c.mesa
        }));
        state.subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
        state.mesaSubscriptions = Array.isArray(parsed.mesaSubscriptions) ? parsed.mesaSubscriptions : [];
        state.tenants = Array.isArray(parsed.tenants) ? parsed.tenants : [];
        state.sucursales = Array.isArray(parsed.sucursales) ? parsed.sucursales : [];
        state.mesas = Array.isArray(parsed.mesas) ? parsed.mesas : [];
        state.menu = Array.isArray(parsed.menu) ? parsed.menu : [];
        state.pedidos = Array.isArray(parsed.pedidos) ? parsed.pedidos : [];
    } catch {
        // data.json inexistente o corrupto: arranca limpio
    }
    seed();
    prune();
}

load();

module.exports = {
    // --- Estructura ---
    getSucursales: () => [...state.sucursales],
    getMesaByCode: (code) => state.mesas.find(m => m.id === code),
    getSucursal: (id) => state.sucursales.find(s => s.id === id),
    getTenant: (id) => state.tenants.find(t => t.id === id),
    getMenu: (sucursalId) => state.menu.filter(i => i.sucursalId === sucursalId && i.disponible),
    getMenuItem: (id) => state.menu.find(i => i.id === id),

    // --- Llamados ---
    getPending() {
        prune();
        return state.calls.filter(c => c.estado === 'pendiente');
    },

    getAtendidos() {
        prune();
        return state.calls
            .filter(c => c.estado === 'atendido')
            .sort((a, b) => new Date(b.atendidaHora) - new Date(a.atendidaHora));
    },

    getCallById: (id) => state.calls.find(c => c.id === id),
    getPendingByMesa: (sucursalId, mesaNumero) =>
        state.calls.find(c => c.sucursalId === sucursalId && c.mesaNumero === mesaNumero && c.estado === 'pendiente'),

    addCall({ mesa, mesaNumero, sucursalId }) {
        const call = {
            id: crypto.randomUUID(),
            mesa,
            mesaNumero,
            sucursalId,
            hora: new Date().toISOString(),
            estado: 'pendiente'
        };
        state.calls.push(call);
        persist();
        return call;
    },

    atenderCall(id) {
        const call = state.calls.find(c => c.id === id && c.estado === 'pendiente');
        if (!call) return null;
        call.estado = 'atendido';
        call.atendidaHora = new Date().toISOString();
        persist();
        return call;
    },

    revertirCall(id) {
        const call = state.calls.find(c => c.id === id && c.estado === 'atendido');
        if (!call) return null;
        call.estado = 'pendiente';
        delete call.atendidaHora;
        persist();
        return call;
    },

    removeCall(id) {
        const i = state.calls.findIndex(c => c.id === id);
        if (i === -1) return null;
        const [call] = state.calls.splice(i, 1);
        persist();
        return call;
    },

    // --- Pedidos ---
    getPedidoById: (id) => state.pedidos.find(p => p.id === id),

    // Pedidos activos de una sucursal (todo lo no terminal)
    getPedidosActivos: (sucursalId) =>
        state.pedidos
            .filter(p => p.sucursalId === sucursalId && !PEDIDO_TERMINAL.includes(p.estado))
            .sort((a, b) => new Date(a.hora) - new Date(b.hora)),

    // Historial visible para la mesa: activos + terminales de las últimas 2h
    getPedidosDeMesa: (mesaCode) => {
        const limite = Date.now() - 2 * 3600 * 1000;
        return state.pedidos
            .filter(p => p.mesaCode === mesaCode && (!PEDIDO_TERMINAL.includes(p.estado) || new Date(p.entregadoHora) > limite))
            .sort((a, b) => new Date(b.hora) - new Date(a.hora));
    },

    addPedido({ mesaCode, mesaNumero, sucursalId, cliente, clienteId, items, nota, total }) {
        const pedido = {
            id: crypto.randomUUID(),
            mesaCode,
            mesaNumero,
            sucursalId,
            cliente: cliente || '',
            // Dispositivo que envió el pedido: los avisos push de estado van solo a él
            clienteId: clienteId || '',
            items,
            nota: nota || '',
            total,
            estado: 'nuevo',
            hora: new Date().toISOString()
        };
        state.pedidos.push(pedido);
        persist();
        return pedido;
    },

    setPedidoEstado(id, estado) {
        const p = state.pedidos.find(x => x.id === id);
        if (!p || !(PEDIDO_TRANSICIONES[p.estado] || []).includes(estado)) return null;
        p.estado = estado;
        if (PEDIDO_TERMINAL.includes(estado)) p.entregadoHora = new Date().toISOString();
        persist();
        return p;
    },

    // --- Suscripciones push (una por dispositivo de mozo) ---
    getSubscriptions: () => [...state.subscriptions],

    addSubscription(sub) {
        state.subscriptions = state.subscriptions.filter(s => s.endpoint !== sub.endpoint);
        state.subscriptions.push({
            endpoint: sub.endpoint,
            keys: sub.keys,
            createdAt: new Date().toISOString()
        });
        persist();
    },

    removeSubscription(endpoint) {
        state.subscriptions = state.subscriptions.filter(s => s.endpoint !== endpoint);
        persist();
    },

    // --- Suscripciones push de clientes (por mesa, aviso de pedido listo) ---
    getMesaSubscriptions: (mesaCode) =>
        state.mesaSubscriptions.filter(s => s.mesaCode === mesaCode),

    getAllMesaSubscriptions: () => [...state.mesaSubscriptions],

    addMesaSubscription(mesaCode, sub, clienteId) {
        // Un endpoint solo puede estar ligado a una mesa a la vez (p.ej. si el
        // mismo celular escanea otro QR, la última suscripción gana)
        state.mesaSubscriptions = state.mesaSubscriptions.filter(s => s.endpoint !== sub.endpoint);
        state.mesaSubscriptions.push({
            endpoint: sub.endpoint,
            keys: sub.keys,
            mesaCode,
            // Dispositivo dueño de la sub: filtra los avisos de pedido por persona
            clienteId: clienteId || '',
            createdAt: new Date().toISOString()
        });
        persist();
    },

    removeMesaSubscription(endpoint) {
        state.mesaSubscriptions = state.mesaSubscriptions.filter(s => s.endpoint !== endpoint);
        persist();
    }
};
