// Verificación rápida del flujo por estaciones (server debe correr con BARRA_CATEGORIAS=Bebidas)
const { io } = require('socket.io-client');
const config = require('../src/config');
const BASE = `http://localhost:${process.env.PORT || 3010}`;

const s = (auth) => io(BASE, { auth, transports: ['websocket'] });
const emitAck = (sock, ev, data) => new Promise(r => sock.emit(ev, data, r));

(async () => {
    const mozo = s({ role: 'mozo', key: config.mozoKey });
    const mesa = s({});
    await new Promise(r => setTimeout(r, 800));
    mesa.emit('unirse-mesa', 'm5');

    // Pedido con comida + bebida adelantada → 2 partidas, barra urgente
    const res = await emitAck(mesa, 'cliente-pedido', {
        mesa: 'm5', cliente: 'Test', adelantar: 'barra',
        items: [{ id: 'm1', cantidad: 1 }, { id: 'b2', variante: 'v500', cantidad: 2 }]
    });
    const p = res.pedido;
    console.log('partidas:', p.partidas.map(pt => `${pt.estacion}[${pt.items.length} items, ${pt.estado}]`));
    console.assert(p.partidas.length === 2, 'DEBE tener 2 partidas');
    const barraPt = p.partidas.find(pt => pt.estacion === 'barra');
    console.assert(barraPt.items.length === 1, 'barra debe tener la bebida');
    console.assert(barraPt.urgente === true, 'barra debe nacer urgente (adelantada)');
    console.assert(!p.partidas.find(pt => pt.estacion === 'cocina').urgente, 'cocina NO urgente');

    // Mozo confirma → ambas partidas pasan a confirmado
    const conf = await emitAck(mozo, 'mozo-pedido-confirmado', { id: p.id });
    console.log('tras confirmar:', conf.pedido.partidas.map(pt => `${pt.estacion}:${pt.estado}`).join(' '));

    // Cocina prepara SOLO su partida
    const mal = await emitAck(mozo, 'cocina-pedido-preparando', { id: p.id });
    console.log('cocina-preparando:', mal.pedido.partidas.map(pt => `${pt.estacion}:${pt.estado}`).join(' '));

    // Barra avanza sola
    await emitAck(mozo, 'barra-partida-preparando', { id: p.id });
    const listo = await emitAck(mozo, 'barra-partida-listo', { id: p.id });
    const agreg = listo.pedido.partidas.map(pt => `${pt.estacion}:${pt.estado}`).join(' ');
    console.log('tras barra listo:', agreg, '→ pedido:', listo.pedido.estado);
    console.assert(listo.pedido.estado === 'preparando', 'agregado debe ser preparando (cocina atrasada)');

    // Mozo entrega la bebida directo
    const ent = await emitAck(mozo, 'mozo-partida-entregado', { id: p.id, estacion: 'barra' });
    console.log('mozo entrega barra:', ent.pedido.partidas.map(pt => `${pt.estacion}:${pt.estado}`).join(' '));
    console.assert(ent.pedido.estado === 'preparando', 'pedido sigue en preparando');

    // Confirmación del cliente (control cruzado): rechaza si no entregó,
    // acepta cuando la partida ya está entregada
    const antes = await emitAck(mesa, 'cliente-partida-recibida', { mesa: 'm5', id: p.id, estacion: 'cocina' });
    console.assert(!antes.ok, 'no puede confirmar comida no entregada');
    const rec = await emitAck(mesa, 'cliente-partida-recibida', { mesa: 'm5', id: p.id, estacion: 'barra' });
    console.assert(rec.ok, 'cliente confirma recepción de la bebida');
    console.log('cliente confirmó barra: recibido =', rec && rec.ok);

    // Pedido 2: sin flag → adelantar en vivo desde Estado
    const res2 = await emitAck(mesa, 'cliente-pedido', {
        mesa: 'm5', cliente: 'Test2',
        items: [{ id: 'b2', variante: 'v2l', cantidad: 1 }]
    });
    const urg = await emitAck(mesa, 'cliente-adelanta-partida', { mesa: 'm5', id: res2.pedido.id, estacion: 'barra' });
    console.assert(urg.ok, 'adelantar en vivo debe funcionar');
    const dup = await emitAck(mesa, 'cliente-adelanta-partida', { mesa: 'm5', id: res2.pedido.id, estacion: 'barra' });
    console.assert(!dup.ok, 'adelantar dos veces debe fallar');
    console.log('adelantar en vivo OK (y duplicado rechazado)');

    // Pedido 2 sigue: confirmar + entregar → el mozo cierra la espera a mano
    await emitAck(mozo, 'mozo-pedido-confirmado', { id: res2.pedido.id });
    const ent2 = await emitAck(mozo, 'mozo-partida-entregado', { id: res2.pedido.id, estacion: 'barra' });
    console.assert(ent2.ok, 'mozo debe poder entregar la partida adelantada');
    const cierre = await emitAck(mozo, 'mozo-partida-cerrada', { id: res2.pedido.id, estacion: 'barra' });
    console.assert(cierre.ok, 'mozo debe poder cerrar la espera del cliente');
    const lista = await emitAck(mesa, 'pedidos-mesa', { mesa: 'm5' });
    const pt2 = lista.pedidos.find(x => x.id === res2.pedido.id).partidas[0];
    console.assert(pt2.recibido === true && pt2.recibidoPor === 'mozo', 'cierre por mozo marca recibido');
    console.log('cierre manual del mozo OK');

    // Pedido 3: entrega sin confirmación del cliente → autocierre por timeout
    // (requiere RECIBIDO_AUTO_MIN=0.01 y RECIBIDO_SWEEP_MS=500 en el server)
    const res3 = await emitAck(mesa, 'cliente-pedido', {
        mesa: 'm5', cliente: 'Test3',
        items: [{ id: 'b2', variante: 'v500', cantidad: 1 }]
    });
    await emitAck(mozo, 'mozo-pedido-confirmado', { id: res3.pedido.id });
    await emitAck(mozo, 'mozo-partida-entregado', { id: res3.pedido.id, estacion: 'barra' });
    await new Promise(r => setTimeout(r, 1500));
    const lista3 = await emitAck(mesa, 'pedidos-mesa', { mesa: 'm5' });
    const pt3 = lista3.pedidos.find(x => x.id === res3.pedido.id).partidas[0];
    console.assert(pt3.recibido === true && pt3.recibidoPor === 'auto', 'timeout debe autoconfirmar la recepción');
    console.log('autocierre por timeout OK');

    mozo.close(); mesa.close();
    console.log('✅ flujo por estaciones OK');
    process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
