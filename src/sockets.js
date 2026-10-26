const { mozoKey } = require('./config');
const store = require('./store');
const push = require('./push');

const MESA_RE = /^[\w-]{1,20}$/;
const CLIENTE_RE = /^.{0,30}$/;
const MAX_PEDIDOS_ACTIVOS_POR_MESA = 15;

const salaMozos = (sucId) => `mozos:${sucId}`;
const salaMesa = (mesa) => `m:${mesa}`;

const ack = (cb, res) => { if (typeof cb === 'function') cb(res); };

// Resuelve el identificador que envía el cliente: código de mesa del QR
// (m5 → numero 5, sucursal s1) o número crudo (modo legacy /mesa/5).
function resolverMesa(valor) {
    const raw = String(valor ?? '').trim();
    if (!MESA_RE.test(raw)) return null;
    const mesa = store.getMesaByCode(raw);
    if (mesa) return { raw, numero: mesa.numero, sucursalId: mesa.sucursalId };
    const sucursal = store.getSucursales()[0];
    return sucursal ? { raw, numero: raw, sucursalId: sucursal.id } : null;
}

module.exports = function registerSockets(io) {
    // Mesa: se conecta sin auth. Mozo: auth { role: 'mozo', key } — clave
    // incorrecta rechaza la conexión para que el cliente pueda repreguntar.
    io.use((socket, next) => {
        const auth = socket.handshake.auth || {};
        if (auth.role === 'mozo') {
            if (auth.key !== mozoKey) return next(new Error('Clave de mozo incorrecta'));
            socket.data.isMozo = true;
        }
        next();
    });

    io.on('connection', (socket) => {
        if (socket.data.isMozo) {
            // El mozo se une a la sala de CADA sucursal (con multi-tenant
            // real se restringiría a las suyas) y recibe el estado completo.
            for (const suc of store.getSucursales()) {
                socket.join(salaMozos(suc.id));
            }
            socket.emit('llamados-pendientes', store.getPending());
            socket.emit('atendidos-recientes', store.getAtendidos());
            for (const suc of store.getSucursales()) {
                socket.emit('pedidos-activos', store.getPedidosActivos(suc.id));
            }
            console.log(`🟢 Mozo conectado (${socket.id})`);
        }

        socket.on('unirse-mesa', (mesaId) => {
            const info = resolverMesa(mesaId);
            if (info) socket.join(salaMesa(info.raw));
        });

        // ---------- Llamados ----------

        socket.on('cliente-llama', (data, cb) => {
            const info = resolverMesa(data && data.mesa);
            if (!info) return ack(cb, { ok: false, error: 'Mesa inválida' });

            // Anti-spam: una mesa solo puede tener un llamado pendiente
            const existente = store.getPendingByMesa(info.sucursalId, info.numero);
            if (existente) return ack(cb, { ok: false, yaPendiente: true, call: existente });

            const call = store.addCall({ mesa: info.raw, mesaNumero: info.numero, sucursalId: info.sucursalId });
            console.log(`🔔 Llamado nuevo: Mesa ${info.numero}`);
            io.to(salaMozos(info.sucursalId)).emit('llamado-nuevo', call);
            push.notificarLlamado(call);
            ack(cb, { ok: true, call });
        });

        socket.on('cliente-cancela', (data, cb) => {
            const info = resolverMesa(data && data.mesa);
            if (!info) return ack(cb, { ok: false, error: 'Mesa inválida' });

            const existente = store.getPendingByMesa(info.sucursalId, info.numero);
            if (!existente) return ack(cb, { ok: false, error: 'No hay llamado pendiente' });

            store.removeCall(existente.id);
            io.to(salaMozos(info.sucursalId)).emit('llamado-cancelado', { id: existente.id, mesa: existente.mesa });
            console.log(`🚫 Llamado cancelado: Mesa ${info.numero}`);
            ack(cb, { ok: true });
        });

        socket.on('mozo-atendio-llamado', (data, cb) => {
            if (!socket.data.isMozo) return ack(cb, { ok: false, error: 'No autorizado' });

            const call = store.atenderCall(String((data && data.id) ?? ''));
            if (!call) return ack(cb, { ok: false, error: 'Llamado inexistente' });

            console.log(`✅ Mozo en camino a la Mesa ${call.mesaNumero}`);
            io.to(salaMesa(call.mesa)).emit('mozo-en-camino', { mesa: call.mesaNumero });
            io.to(salaMozos(call.sucursalId)).emit('llamado-atendido', call);
            push.notificarMozoEnCamino(call);
            ack(cb, { ok: true });
        });

        socket.on('mozo-revirtio-llamado', (data, cb) => {
            if (!socket.data.isMozo) return ack(cb, { ok: false, error: 'No autorizado' });

            const call = store.getCallById(String((data && data.id) ?? ''));
            if (!call || call.estado !== 'atendido') {
                return ack(cb, { ok: false, error: 'Llamado inexistente' });
            }
            // La mesa pudo haber vuelto a llamar mientras tanto: no duplicar pendientes
            if (store.getPendingByMesa(call.sucursalId, call.mesaNumero)) {
                return ack(cb, { ok: false, error: 'La mesa ya tiene otro llamado pendiente' });
            }

            const revertido = store.revertirCall(call.id);
            console.log(`↩ Llamado revertido a pendiente: Mesa ${revertido.mesaNumero}`);
            io.to(salaMozos(revertido.sucursalId)).emit('llamado-revertido', revertido);
            io.to(salaMesa(revertido.mesa)).emit('llamado-reactivado', { mesa: revertido.mesaNumero });
            push.notificarLlamado(revertido);
            ack(cb, { ok: true });
        });

        // ---------- Pedidos ----------

        socket.on('cliente-pedido', (data, cb) => {
            const info = resolverMesa(data && data.mesa);
            if (!info) return ack(cb, { ok: false, error: 'Mesa inválida' });

            // Límite de pedidos activos por mesa (anti-abuso)
            const activos = store.getPedidosDeMesa(info.raw)
                .filter(p => p.estado !== 'entregado' && p.estado !== 'rechazado').length;
            if (activos >= MAX_PEDIDOS_ACTIVOS_POR_MESA) {
                return ack(cb, { ok: false, error: 'Demasiados pedidos activos, avisá al mozo' });
            }

            // Valida items contra el menú y calcula el total en el servidor
            const menu = store.getMenu(info.sucursalId);
            const porId = new Map(menu.map(i => [i.id, i]));
            const items = [];
            let total = 0;
            for (const it of Array.isArray(data && data.items) ? data.items : []) {
                const item = porId.get(String(it.id));
                const cantidad = Math.floor(Number(it.cantidad));
                if (!item || !Number.isFinite(cantidad) || cantidad < 1 || cantidad > 20) {
                    return ack(cb, { ok: false, error: 'Item inválido en el pedido' });
                }
                items.push({ id: item.id, nombre: item.nombre, precio: item.precio, cantidad, categoria: item.categoria });
                total += item.precio * cantidad;
            }
            if (!items.length) return ack(cb, { ok: false, error: 'Pedido vacío' });

            const cliente = String(data.cliente || '').trim().slice(0, 30);
            const nota = String(data.nota || '').trim().slice(0, 200);

            const pedido = store.addPedido({
                mesaCode: info.raw,
                mesaNumero: info.numero,
                sucursalId: info.sucursalId,
                cliente,
                clienteId: String(data.clienteId || '').slice(0, 64),
                items, nota, total
            });
            console.log(`🍽️ Pedido nuevo: Mesa ${info.numero} — ${items.length} items ($${total})`);
            io.to(salaMozos(info.sucursalId)).emit('pedido-nuevo', pedido);
            io.to(salaMesa(info.raw)).emit('pedido-actualizado', pedido);
            push.notificarPedido(pedido);
            ack(cb, { ok: true, pedido });
        });

        socket.on('pedidos-mesa', (data, cb) => {
            const info = resolverMesa(data && data.mesa);
            if (!info) return ack(cb, { ok: false, error: 'Mesa inválida' });
            ack(cb, { ok: true, pedidos: store.getPedidosDeMesa(info.raw) });
        });

        // Flujo: nuevo -(mozo)-> confirmado/rechazado. Después cada PARTIDA
        // avanza por estación: cocina/barra -> preparando -> listo -> entregado.
        // El estado del pedido es el agregado de sus partidas (ver store).
        const difundir = (pedido) => {
            io.to(salaMesa(pedido.mesaCode)).emit('pedido-actualizado', pedido);
            io.to(salaMozos(pedido.sucursalId)).emit('pedido-actualizado', pedido);
        };

        const avanzarPedido = (estado) => (data, cb) => {
            if (!socket.data.isMozo) return ack(cb, { ok: false, error: 'No autorizado' });
            const pedido = store.setPedidoEstado(String((data && data.id) ?? ''), estado);
            if (!pedido) return ack(cb, { ok: false, error: 'Pedido inexistente o transición inválida' });
            console.log(`🍽️ Pedido ${estado}: Mesa ${pedido.mesaNumero}`);
            difundir(pedido);
            if (estado === 'confirmado') push.notificarPedidoConfirmado(pedido);
            if (estado === 'rechazado') push.notificarPedidoRechazado(pedido);
            ack(cb, { ok: true, pedido });
        };

        // ref: 'cocina'/'barra' fijo, o null para tomarlo de data.estacion
        const avanzarPartida = (ref, estado) => (data, cb) => {
            if (!socket.data.isMozo) return ack(cb, { ok: false, error: 'No autorizado' });
            const destino = ref || String((data && (data.estacion || data.partidaId)) ?? '');
            const res = store.setPartidaEstado(String((data && data.id) ?? ''), destino, estado);
            if (!res) return ack(cb, { ok: false, error: 'Pedido inexistente o transición inválida' });
            const { pedido, partida } = res;
            console.log(`🍽️ Partida ${partida.estacion} ${estado}: Mesa ${pedido.mesaNumero}`);
            difundir(pedido);
            if (estado === 'preparando') push.notificarPartidaPreparando(pedido, partida);
            if (estado === 'listo') {
                push.notificarPartidaListo(pedido, partida);
                push.notificarPedidoListoMozo(pedido, partida);
            }
            ack(cb, { ok: true, pedido });
        };

        socket.on('mozo-pedido-confirmado', avanzarPedido('confirmado'));
        socket.on('mozo-pedido-rechazado', avanzarPedido('rechazado'));
        socket.on('mozo-pedido-entregado', avanzarPedido('entregado')); // entrega TODO el pedido
        // Estaciones: la pantalla de cocina usa los eventos históricos
        socket.on('cocina-pedido-preparando', avanzarPartida('cocina', 'preparando'));
        socket.on('mozo-pedido-listo', avanzarPartida('cocina', 'listo'));
        socket.on('barra-partida-preparando', avanzarPartida('barra', 'preparando'));
        socket.on('barra-partida-listo', avanzarPartida('barra', 'listo'));
        // El mozo entrega una partida puntual (p.ej. bebidas servidas por él)
        socket.on('mozo-partida-entregado', avanzarPartida(null, 'entregado'));

        // Control cruzado: el cliente confirma que recibió la partida
        // (p.ej. la bebida que el mozo ya le llevó).
        socket.on('cliente-partida-recibida', (data, cb) => {
            const info = resolverMesa(data && data.mesa);
            if (!info) return ack(cb, { ok: false, error: 'Mesa inválida' });
            const res = store.setPartidaRecibida(String((data && data.id) ?? ''),
                String((data && (data.estacion || data.partidaId)) ?? ''));
            if (!res) return ack(cb, { ok: false, error: 'Partida inexistente o aún no entregada' });
            const { pedido, partida } = res;
            console.log(`✓✓ Cliente confirmó recepción (${partida.estacion}): Mesa ${pedido.mesaNumero}`);
            io.to(salaMesa(pedido.mesaCode)).emit('pedido-actualizado', pedido);
            io.to(salaMozos(pedido.sucursalId)).emit('pedido-actualizado', pedido);
            ack(cb, { ok: true });
        });
    });
};
