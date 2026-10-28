const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir, atendidosTtlMin, barraCategorias } = require('./config');

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
    pedidos: [],
    // Mesas físicas unidas en una "mesa larga" (grupo grande de gente)
    gruposMesas: [],
    // Config por restaurante: estaciones.barra = categorías ruteadas a /barra
    config: { estaciones: { barra: [] } }
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

// --- Estaciones (cocina / barra) ---
// Las categorías configuradas van a la partida 'barra' (pantalla /barra);
// el resto a 'cocina'. Env BARRA_CATEGORIAS tiene prioridad sobre data.json.
function getEstaciones() {
    const conf = (state.config.estaciones && state.config.estaciones.barra) || [];
    return { barra: barraCategorias.length ? barraCategorias : conf };
}

const ORDEN_ESTADO = ['nuevo', 'confirmado', 'preparando', 'listo', 'entregado'];

// Estado del pedido = el menos avanzado de sus partidas (rechazado es nivel pedido)
function estadoAgregado(partidas) {
    if (partidas.every(pt => pt.estado === 'rechazado')) return 'rechazado';
    if (partidas.every(pt => pt.estado === 'entregado')) return 'entregado';
    const activos = partidas.filter(pt => pt.estado !== 'entregado' && pt.estado !== 'rechazado');
    return activos.reduce((min, pt) =>
        ORDEN_ESTADO.indexOf(pt.estado) < ORDEN_ESTADO.indexOf(min) ? pt.estado : min, 'entregado');
}

// Parte los items en partidas por estación según la config de categorías.
function armarPartidas(items) {
    const catsBarra = new Set(getEstaciones().barra.map(c => String(c).toLowerCase()));
    const porEstacion = {};
    for (const it of items) {
        const estacion = catsBarra.has(String(it.categoria || '').toLowerCase()) ? 'barra' : 'cocina';
        (porEstacion[estacion] = porEstacion[estacion] || []).push(it);
    }
    return Object.entries(porEstacion).map(([estacion, its]) => ({
        id: crypto.randomUUID(),
        estacion,
        items: its,
        estado: 'nuevo'
    }));
}

// Migración: pedidos viejos (sin partidas) → una sola partida 'cocina'
function migrarPartidas(p) {
    if (Array.isArray(p.partidas) && p.partidas.length) return p;
    return {
        ...p,
        partidas: [{
            id: crypto.randomUUID(),
            estacion: 'cocina',
            items: p.items || [],
            estado: p.estado || 'nuevo'
        }]
    };
}

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
    state.menu = require('./menu-demo');
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
        state.pedidos = (Array.isArray(parsed.pedidos) ? parsed.pedidos : []).map(migrarPartidas);
        state.gruposMesas = Array.isArray(parsed.gruposMesas) ? parsed.gruposMesas : [];
        if (parsed.config && parsed.config.estaciones) {
            state.config.estaciones = { ...state.config.estaciones, ...parsed.config.estaciones };
        }
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
    getMesas: (sucursalId) => state.mesas.filter(m => !sucursalId || m.sucursalId === sucursalId),
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
    getAllPedidos: () => [...state.pedidos],

    getPedidosDeMesa: (mesaCode) => {
        const limite = Date.now() - 2 * 3600 * 1000;
        return state.pedidos
            .filter(p => p.mesaCode === mesaCode && (!PEDIDO_TERMINAL.includes(p.estado) || new Date(p.entregadoHora) > limite))
            .sort((a, b) => new Date(b.hora) - new Date(a.hora));
    },

    addPedido({ mesaCode, mesaNumero, sucursalId, cliente, clienteId, items, nota, total, adelantar }) {
        const partidas = armarPartidas(items);
        // "Traeme la bebida ya": la partida elegida nace con prioridad
        if (adelantar) partidas.forEach(pt => {
            if (pt.estacion === adelantar) pt.urgente = true;
        });
        const pedido = {
            id: crypto.randomUUID(),
            mesaCode,
            mesaNumero,
            sucursalId,
            cliente: cliente || '',
            // Dispositivo que envió el pedido: los avisos push de estado van solo a él
            clienteId: clienteId || '',
            items,
            // Tickets por estación: cocina/barra avanzan independientes
            partidas,
            nota: nota || '',
            total,
            estado: 'nuevo',
            hora: new Date().toISOString()
        };
        state.pedidos.push(pedido);
        persist();
        return pedido;
    },

    // Transición a NIVEL PEDIDO: confirmar/rechazar (mozo) o entregar todo.
    setPedidoEstado(id, estado) {
        const p = state.pedidos.find(x => x.id === id);
        if (!p || !(PEDIDO_TRANSICIONES[p.estado] || []).includes(estado)) return null;
        if (estado === 'entregado') {
            p.partidas.forEach(pt => { if (pt.estado !== 'rechazado') pt.estado = 'entregado'; });
        } else {
            p.partidas.forEach(pt => {
                if ((PEDIDO_TRANSICIONES[pt.estado] || []).includes(estado)) pt.estado = estado;
            });
        }
        p.estado = estado;
        if (PEDIDO_TERMINAL.includes(estado)) p.entregadoHora = new Date().toISOString();
        persist();
        return p;
    },

    // Transición a NIVEL PARTIDA (por estación): preparando/listo/entregado.
    // `ref` puede ser partidaId o el nombre de la estación ('cocina'/'barra').
    setPartidaEstado(pedidoId, ref, estado) {
        const p = state.pedidos.find(x => x.id === pedidoId);
        if (!p) return null;
        const pt = (p.partidas || []).find(x => x.id === ref || x.estacion === ref);
        // 'entregado' permite saltear pasos a nivel partida: el mozo puede
        // servir una bebida directo sin forzarla por preparando/listo.
        const ok = estado === 'entregado'
            ? ['confirmado', 'preparando', 'listo'].includes(pt && pt.estado)
            : pt && (PEDIDO_TRANSICIONES[pt.estado] || []).includes(estado);
        if (!pt || !ok) return null;
        pt.estado = estado;
        if (estado === 'entregado') pt.entregadoEn = new Date().toISOString();
        p.estado = estadoAgregado(p.partidas);
        if (PEDIDO_TERMINAL.includes(p.estado)) p.entregadoHora = new Date().toISOString();
        persist();
        return { pedido: p, partida: pt };
    },

    // El cliente confirma que recibió una partida entregada (control cruzado).
    // `recibido` es un flag sobre la partida, no otro estado del flujo.
    // `por`: 'cliente' | 'mozo' | 'auto' (timeout sin confirmación).
    setPartidaRecibida(pedidoId, ref, por = 'cliente') {
        const p = state.pedidos.find(x => x.id === pedidoId);
        if (!p) return null;
        const pt = (p.partidas || []).find(x => x.id === ref || x.estacion === ref);
        if (!pt || pt.estado !== 'entregado' || pt.recibido) return null;
        pt.recibido = true;
        pt.recibidoPor = por;
        persist();
        return { pedido: p, partida: pt };
    },

    // Partidas entregadas hace más de `min` minutos sin que el cliente
    // confirme recepción — el barrido del server las cierra solo.
    partidasSinConfirmar(min) {
        const corte = Date.now() - min * 60000;
        const out = [];
        for (const p of state.pedidos) {
            for (const pt of p.partidas || []) {
                if (pt.estado === 'entregado' && !pt.recibido && pt.entregadoEn
                    && new Date(pt.entregadoEn).getTime() < corte) {
                    out.push({ pedido: p, partida: pt });
                }
            }
        }
        return out;
    },

    // El cliente pide adelantar una partida ("traeme la bebida ya"): queda
    // marcada urgente para que el mozo la sirva antes que la comida.
    setPartidaUrgente(pedidoId, ref) {
        const p = state.pedidos.find(x => x.id === pedidoId);
        if (!p) return null;
        const pt = (p.partidas || []).find(x => x.id === ref || x.estacion === ref);
        const activa = pt && !['entregado', 'rechazado'].includes(pt.estado);
        if (!activa || pt.urgente) return null;
        pt.urgente = true;
        persist();
        return { pedido: p, partida: pt };
    },

    // --- Suscripciones push (una por dispositivo de mozo) ---
    getSubscriptions: () => [...state.subscriptions],

    addSubscription(sub) {
        state.subscriptions = state.subscriptions.filter(s => s.endpoint !== sub.endpoint);
        // Igual que con las de mesa: acotar los fantasmas de mozo
        if (state.subscriptions.length >= 15) {
            state.subscriptions = state.subscriptions.slice(-14);
        }
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
        // Cota por mesa: si el cliente borra datos del browser, sus subs
        // viejas quedan "fantasma" (FCM las sigue entregando pero el teléfono
        // no puede desencriptar). Acotamos para que los fantasmas mueran.
        const MAX_POR_MESA = 6;
        const deLaMesa = state.mesaSubscriptions.filter(s => s.mesaCode === mesaCode);
        if (deLaMesa.length >= MAX_POR_MESA) {
            const aBorrar = new Set(deLaMesa.slice(0, deLaMesa.length - MAX_POR_MESA + 1).map(s => s.endpoint));
            state.mesaSubscriptions = state.mesaSubscriptions.filter(s => !aBorrar.has(s.endpoint));
        }
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
    },

    // --- Grupos de mesas: mesas físicas unidas en una "mesa larga" ---
    // Solo agrupan la vista del mozo; cada QR/pedido sigue con su mesa.
    getGruposMesas: (sucursalId) =>
        state.gruposMesas.filter(g => !sucursalId || g.sucursalId === sucursalId),

    getGrupoDeMesa: (mesaCode) =>
        state.gruposMesas.find(g => g.mesas.includes(mesaCode)),

    unirMesas(sucursalId, mesaCodes) {
        const validas = new Set(state.mesas.filter(m => m.sucursalId === sucursalId).map(m => m.id));
        const codes = [...new Set((mesaCodes || []).map(String))].filter(c => validas.has(c));
        if (codes.length < 2) return null;
        // Una mesa solo puede estar en un grupo: al unirla a otro se sale del anterior
        state.gruposMesas = state.gruposMesas
            .map(g => ({ ...g, mesas: g.mesas.filter(c => !codes.includes(c)) }))
            .filter(g => g.mesas.length >= 2);
        const grupo = { id: crypto.randomUUID(), sucursalId, mesas: codes.sort() };
        state.gruposMesas.push(grupo);
        persist();
        return grupo;
    },

    separarGrupoMesas(id) {
        const i = state.gruposMesas.findIndex(g => g.id === id);
        if (i === -1) return null;
        const [g] = state.gruposMesas.splice(i, 1);
        persist();
        return g;
    }
};
