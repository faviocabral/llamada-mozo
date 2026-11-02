import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const gs = (n) => 'Gs. ' + n.toLocaleString('es-PY');
const LBL_PT = { cocina: '🍽️ Comida', barra: '🥤 Bebidas' };
const CHIP = {
    nuevo: 'Nuevo', confirmado: 'En cola', preparando: 'Preparando',
    listo: 'Lista ✓', entregado: 'Entregada ✓', rechazado: 'Rechazada'
};

// Panel operativo del mozo dentro de /mozo-app: mismos eventos que
// public/mozo.html pero en React — llamados + pedidos de TODAS las mesas.
export default function MozoPanel({ mozoKey }) {
    const [llamados, setLlamados] = useState([]);
    const [pedidos, setPedidos] = useState([]);
    const socketRef = useRef(null);

    useEffect(() => {
        const socket = io({ auth: { role: 'mozo', key: mozoKey } });
        socketRef.current = socket;
        socket.on('llamados-pendientes', setLlamados);
        socket.on('llamado-nuevo', c => setLlamados(ls => [c, ...ls.filter(x => x.id !== c.id)]));
        socket.on('llamado-atendido', c => setLlamados(ls => ls.filter(x => x.id !== c.id)));
        socket.on('llamado-cancelado', d => setLlamados(ls => ls.filter(x => x.id !== d.id)));
        socket.on('llamado-revertido', c => setLlamados(ls => [c, ...ls.filter(x => x.id !== c.id)]));
        socket.on('pedidos-activos', setPedidos);
        socket.on('pedido-nuevo', p => setPedidos(ps => [p, ...ps.filter(x => x.id !== p.id)]));
        socket.on('pedido-actualizado', p =>
            setPedidos(ps => ps.map(x => x.id === p.id ? p : x)
                .filter(x => !['entregado', 'rechazado'].includes(x.estado)
                    || (x.partidas || []).some(pt => pt.estado === 'entregado' && !pt.recibido))));
        return () => socket.disconnect();
    }, [mozoKey]);

    const emit = (ev, data) => socketRef.current.emit(ev, data, () => {});

    // Acción primero: llamados arriba de todo; pedidos por confirmar primero
    const ordenados = [...pedidos].sort((a, b) =>
        (a.estado === 'nuevo' ? 0 : 1) - (b.estado === 'nuevo' ? 0 : 1)
        || new Date(a.hora) - new Date(b.hora));

    return (
        <div className="page">
            <div className="topbar">Panel del mozo<small>llamados y pedidos en vivo</small></div>
            <div className="page-inner">
                {llamados.map(c => (
                    <div className="panel-llamado" key={c.id}>
                        <div>
                            <b>🔔 Mesa {c.mesaNumero}</b>
                            <div className="panel-sub">pide al mozo</div>
                        </div>
                        <button className="panel-btn ok" onClick={() => emit('mozo-atendio-llamado', { id: c.id })}>
                            ✓ En camino
                        </button>
                    </div>
                ))}

                {ordenados.length === 0 && llamados.length === 0 && (
                    <div className="empty">Sin pedidos activos — tranquila la sala 🍃</div>
                )}

                {ordenados.map(p => (
                    <div className={'pedido-card' + (p.estado === 'nuevo' ? ' panel-nuevo' : '')} key={p.id}>
                        <div className="panel-head">
                            <b>Mesa {p.mesaNumero} · {p.cliente || 'Pedido'}</b>
                            <span className="pedido-hora">
                                {new Date(p.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        {(p.partidas || []).length ? (
                            p.partidas.map(pt => (
                                <div className="panel-partida" key={pt.id}>
                                    <div className="panel-partida-lbl">
                                        {LBL_PT[pt.estacion] || pt.estacion}
                                        {pt.urgente && pt.estado !== 'entregado' && ' 🔥'}
                                    </div>
                                    <div className="panel-items">
                                        {pt.items.map((i, idx) => (
                                            <div key={idx}>{i.cantidad}× {i.nombre}{i.variante ? ' · ' + i.variante : ''}</div>
                                        ))}
                                    </div>
                                    <div className="panel-acciones">
                                        {pt.estado === 'entregado' && !pt.recibido ? (
                                            <button className="panel-btn" onClick={() =>
                                                emit('mozo-partida-cerrada', { id: p.id, estacion: pt.estacion })}>
                                                ⏳ Espera cliente · Cerrar
                                            </button>
                                        ) : pt.estado === 'listo' || (pt.urgente && ['confirmado', 'preparando'].includes(pt.estado)) ? (
                                            <button className="panel-btn ok" onClick={() =>
                                                emit('mozo-partida-entregado', { id: p.id, estacion: pt.estacion })}>
                                                🛎️ Entregar
                                            </button>
                                        ) : (
                                            <span className="partida-chip">{CHIP[pt.estado] || pt.estado}</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="panel-items">
                                {p.items.map((i, idx) => (
                                    <div key={idx}>{i.cantidad}× {i.nombre}{i.variante ? ' · ' + i.variante : ''}</div>
                                ))}
                            </div>
                        )}
                        {p.nota && <div className="nota">“{p.nota}”</div>}
                        <div className="panel-head">
                            <span className="pedido-total">{gs(p.total)}</span>
                            {p.estado === 'nuevo' ? (
                                <span className="panel-acciones">
                                    <button className="panel-btn ok" onClick={() => emit('mozo-pedido-confirmado', { id: p.id })}>✓ Confirmar</button>
                                    <button className="panel-btn no" onClick={() => emit('mozo-pedido-rechazado', { id: p.id })}>✗ Rechazar</button>
                                </span>
                            ) : p.estado === 'listo' && !(p.partidas || []).length ? (
                                <button className="panel-btn ok" onClick={() => emit('mozo-pedido-entregado', { id: p.id })}>🛎️ Entregar</button>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
