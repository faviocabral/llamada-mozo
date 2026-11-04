import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const gs = (n) => 'Gs. ' + n.toLocaleString('es-PY');
const LBL_PT = { cocina: '🍽️ Comida', barra: '🥤 Bebidas' };
const CHIP = {
    nuevo: 'Nuevo', confirmado: 'En cola', preparando: 'Preparando',
    listo: 'Lista ✓', entregado: 'Entregada ✓', rechazado: 'Rechazada'
};
const FILTROS = [
    { id: 'todas', lbl: 'Todas', ico: '📋' },
    { id: 'confirmar', lbl: 'Por confirmar', ico: '⏳' },
    { id: 'cocina', lbl: 'En cocina', ico: '👨‍🍳' },
    { id: 'retirar', lbl: 'A retirar', ico: '🛎️' }
];
// Predicados del filtro: qué cuenta como "en cocina" y "a retirar"
const enMarcha = (p) => (p.partidas || []).some(pt => ['confirmado', 'preparando'].includes(pt.estado));
const paraRetirar = (p) => (p.partidas || []).some(pt => pt.estado === 'listo')
    || (p.estado === 'listo' && !(p.partidas || []).length);
const PRED = { confirmar: p => p.estado === 'nuevo', cocina: enMarcha, retirar: paraRetirar };

// Panel operativo del mozo dentro de /mozo-app: llamados + pedidos de
// TODAS las mesas en vivo, con filtros, total a cobrar y entregados.
export default function MozoPanel({ mozoKey, onTomarPedido }) {
    const [llamados, setLlamados] = useState([]);
    const [pedidos, setPedidos] = useState([]);
    const [filtro, setFiltro] = useState('todas');
    const [mesaFiltro, setMesaFiltro] = useState(null);
    const [mozo, setMozo] = useState(null); // {id, nombre, mesas} — identidad + zona
    const [mesasPanel, setMesasPanel] = useState([]);
    const [verTodas, setVerTodas] = useState(false); // salir de mi zona
    const [sheet, setSheet] = useState(null); // 'filtro' | 'cobrar' | 'zona'
    const socketRef = useRef(null);

    useEffect(() => {
        const socket = io({ auth: { role: 'mozo', key: mozoKey } });
        socketRef.current = socket;
        socket.on('mozo-identidad', setMozo);
        socket.on('mesas-panel', d => setMesasPanel(d.mesas || []));
        socket.on('llamados-pendientes', setLlamados);
        socket.on('llamado-nuevo', c => setLlamados(ls => [c, ...ls.filter(x => x.id !== c.id)]));
        socket.on('llamado-atendido', c => setLlamados(ls => ls.filter(x => x.id !== c.id)));
        socket.on('llamado-cancelado', d => setLlamados(ls => ls.filter(x => x.id !== d.id)));
        socket.on('llamado-revertido', c => setLlamados(ls => [c, ...ls.filter(x => x.id !== c.id)]));
        socket.on('pedidos-activos', setPedidos);
        socket.on('pedido-nuevo', p => setPedidos(ps => [p, ...ps.filter(x => x.id !== p.id)]));
        // Los entregados quedan en la lista para la sección "Entregados";
        // solo salen los rechazados
        socket.on('pedido-actualizado', p =>
            setPedidos(ps => ps.map(x => x.id === p.id ? p : x)
                .filter(x => x.estado !== 'rechazado')));
        return () => socket.disconnect();
    }, [mozoKey]);

    const emit = (ev, data) => socketRef.current.emit(ev, data, () => {});

    // Zona del mozo: mesas propias (vacío = todas). "Ver todas" sale de la zona.
    const enZona = (mesaCode) =>
        verTodas || !mozo || !mozo.mesas || !mozo.mesas.length || mozo.mesas.includes(mesaCode);

    const activos = pedidos.filter(p => p.estado !== 'entregado' && enZona(p.mesaCode));
    const entregados = pedidos.filter(p => p.estado === 'entregado' && enZona(p.mesaCode));
    const llamadosZona = llamados.filter(c => enZona(c.mesa));

    // Conteos por filtro (sobre activos)
    const cuenta = { todas: activos.length };
    ['confirmar', 'cocina', 'retirar'].forEach(f => {
        cuenta[f] = activos.filter(PRED[f]).length;
    });

    // Total a cobrar por mesa: suma todos los pedidos activos de esa mesa
    // (varios clientes de la misma mesa ordenando por separado = un total)
    const totalesMesa = {};
    activos.forEach(p => {
        totalesMesa[p.mesaNumero] = (totalesMesa[p.mesaNumero] || 0) + p.total;
    });
    const mesasConPedidos = [...new Set(activos.map(p => p.mesaCode))];

    const visibles = activos
        .filter(p => filtro === 'todas' || PRED[filtro](p))
        .filter(p => !mesaFiltro || p.mesaCode === mesaFiltro)
        .sort((a, b) =>
            (a.estado === 'nuevo' ? 0 : 1) - (b.estado === 'nuevo' ? 0 : 1)
            || new Date(a.hora) - new Date(b.hora));

    const botonPartida = (p, pt) => {
        if (pt.estado === 'entregado' && !pt.recibido) {
            return { ev: 'mozo-partida-cerrada', lbl: '⏳ Cerrar espera', cls: '' };
        }
        if (pt.estado === 'listo' || (pt.urgente && ['confirmado', 'preparando'].includes(pt.estado))) {
            return { ev: 'mozo-partida-entregado', lbl: `🔔 Entregar ${pt.estacion === 'barra' ? 'bebida' : 'comida'}`, cls: 'ok entregar' };
        }
        return null;
    };

    const toggleZona = (code) => {
        if (!mozo) return;
        const zona = mozo.mesas || [];
        const nueva = zona.includes(code) ? zona.filter(x => x !== code) : [...zona, code];
        socketRef.current.emit('mozo-asignar-zona', { mesas: nueva });
    };

    return (
        <div className="page">
            <div className="topbar">
                Panel{mozo ? ` · ${mozo.nombre}` : ' del mozo'}
                <small>llamados y pedidos en vivo</small>
            </div>

            {/* Barra estilo Loyverse: 3 bloques, cada uno abre su sheet */}
            <div className="panel-bar">
                <button className={'panel-blk' + (filtro !== 'todas' || mesaFiltro ? ' active' : '')}
                    onClick={() => setSheet('filtro')}>
                    <span className="panel-blk-lbl">Filtro</span>
                    <b>{FILTROS.find(f => f.id === filtro).lbl} · {visibles.length}</b>
                </button>
                <button className={'panel-blk' + (Object.keys(totalesMesa).length ? ' plata' : '')}
                    onClick={() => setSheet('cobrar')}>
                    <span className="panel-blk-lbl">A cobrar</span>
                    <b>{gs(Object.values(totalesMesa).reduce((a, b) => a + b, 0))}</b>
                </button>
                <button className={'panel-blk' + (mozo && (mozo.mesas || []).length && !verTodas ? ' active' : '')}
                    onClick={() => setSheet('zona')}>
                    <span className="panel-blk-lbl">Zona</span>
                    <b>{!mozo || !(mozo.mesas || []).length || verTodas ? 'Todas' : `${mozo.mesas.length} mesas`}</b>
                </button>
            </div>

            <div className="page-inner">

                {llamadosZona.map(c => (
                    <div className="panel-llamado" key={c.id}>
                        <div>
                            <b>🔔 Mesa {c.mesaNumero}</b>
                            <div className="panel-sub">pide al mozo</div>
                        </div>
                        <span className="panel-acciones">
                            {onTomarPedido && (
                                <button className="panel-btn" onClick={() => {
                                    const m = mesasPanel.find(x => x.id === c.mesa);
                                    onTomarPedido({ code: c.mesa, numero: m ? m.numero : c.mesaNumero });
                                }}>
                                    ✎ Tomar pedido
                                </button>
                            )}
                            <button className="panel-btn ok" onClick={() => emit('mozo-atendio-llamado', { id: c.id })}>
                                ✓ En camino
                            </button>
                        </span>
                    </div>
                ))}

                {visibles.length === 0 && llamados.length === 0 && (
                    <div className="empty">Sin pedidos activos — tranquila la sala 🍃</div>
                )}
                {visibles.length === 0 && llamados.length > 0 && (
                    <div className="empty">Nada en este filtro.</div>
                )}

                {visibles.map(p => (
                    <div className={'pedido-card' + (p.estado === 'nuevo' ? ' panel-nuevo' : '')
                        + (paraRetirar(p) ? ' panel-retirar' : '')} key={p.id}>
                        <div className="panel-head">
                            <b>Mesa {p.mesaNumero} · {p.cliente || 'Pedido'}</b>
                            <span className="pedido-hora">
                                {p.asignadoA && (
                                    <span className={'chip-asignado' + (mozo && p.asignadoA.id === mozo.id ? ' mio' : '')}>
                                        👤 {mozo && p.asignadoA.id === mozo.id ? 'Vos' : p.asignadoA.nombre}
                                    </span>
                                )}
                                {new Date(p.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        {(p.partidas || []).length ? (
                            p.partidas.map(pt => (
                                <div className="panel-partida" key={pt.id}>
                                    <div className="panel-partida-lbl">
                                        {LBL_PT[pt.estacion] || pt.estacion}
                                        {pt.urgente && pt.estado !== 'entregado' && ' 🔥'}
                                        <span className="partida-chip">{CHIP[pt.estado] || pt.estado}</span>
                                    </div>
                                    <div className="panel-items">
                                        {pt.items.map((i, idx) => (
                                            <div key={idx}>{i.cantidad}× {i.nombre}{i.variante ? ' · ' + i.variante : ''}</div>
                                        ))}
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

                        {/* Footer: total + acciones. El Entregar campanea */}
                        <div className="panel-foot">
                            <span className="pedido-total">{gs(p.total)}</span>
                            <span className="panel-acciones">
                                {p.estado === 'nuevo' && (
                                    <>
                                        <button className="panel-btn ok" onClick={() => emit('mozo-pedido-confirmado', { id: p.id })}>✓ Confirmar</button>
                                        <button className="panel-btn no" onClick={() => emit('mozo-pedido-rechazado', { id: p.id })}>✗</button>
                                    </>
                                )}
                                {(p.partidas || []).map(pt => {
                                    const b = botonPartida(p, pt);
                                    return b && (
                                        <button key={pt.id} className={'panel-btn ' + b.cls}
                                            onClick={() => emit(b.ev, { id: p.id, estacion: pt.estacion })}>
                                            {b.lbl}
                                        </button>
                                    );
                                })}
                                {p.estado === 'listo' && !(p.partidas || []).length && (
                                    <button className="panel-btn ok entregar"
                                        onClick={() => emit('mozo-pedido-entregado', { id: p.id })}>
                                        🔔 Entregar
                                    </button>
                                )}
                            </span>
                        </div>
                    </div>
                ))}

                {/* Entregados recientes: verificar qué se llevó a la mesa */}
                {entregados.length > 0 && (
                    <details className="panel-entregados">
                        <summary>✅ Entregados ({entregados.length}) — verificar qué se llevó</summary>
                        {entregados.slice(0, 10).map(p => (
                            <div className="pedido-card panel-entregado" key={p.id}>
                                <div className="panel-head">
                                    <b>Mesa {p.mesaNumero} · {p.cliente || 'Pedido'}</b>
                                    <span className="pedido-hora">
                                        {new Date(p.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                {(p.partidas || []).length ? p.partidas.map(pt => (
                                    <div className="panel-items" key={pt.id}>
                                        <b>{LBL_PT[pt.estacion] || pt.estacion}:</b>
                                        {pt.items.map((i, idx) => (
                                            <div key={idx}>{i.cantidad}× {i.nombre}{i.variante ? ' · ' + i.variante : ''}</div>
                                        ))}
                                    </div>
                                )) : (
                                    <div className="panel-items">
                                        {p.items.map((i, idx) => (
                                            <div key={idx}>{i.cantidad}× {i.nombre}{i.variante ? ' · ' + i.variante : ''}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </details>
                )}
            </div>

            {/* Sheet Filtro: estados + mesas con pedidos */}
            {sheet === 'filtro' && (
                <div className="sheet-overlay" onClick={() => setSheet(null)}>
                    <div className="sheet" onClick={e => e.stopPropagation()}>
                        <div className="sheet-head">
                            <div>
                                <div className="sheet-title">📋 Filtrar pedidos</div>
                                <div className="sheet-desc">Por estado o por mesa.</div>
                            </div>
                            <button className="sheet-cerrar" onClick={() => setSheet(null)}>✕</button>
                        </div>
                        <div className="sheet-opts">
                            {FILTROS.map(f => (
                                <button key={f.id}
                                    className={'sheet-opt' + (filtro === f.id ? ' sel' : '')}
                                    onClick={() => { setFiltro(f.id); setSheet(null); }}>
                                    <span>{f.ico} {f.lbl}</span><b>{cuenta[f.id]}</b>
                                </button>
                            ))}
                        </div>
                        {mesasConPedidos.length > 1 && (
                            <>
                                <div className="sheet-sub">Por mesa</div>
                                <div className="sheet-opts">
                                    <button className={'sheet-opt' + (!mesaFiltro ? ' sel' : '')}
                                        onClick={() => { setMesaFiltro(null); setSheet(null); }}>
                                        <span>Todas las mesas</span>
                                    </button>
                                    {mesasConPedidos.map(mc => {
                                        const p0 = activos.find(p => p.mesaCode === mc);
                                        return (
                                            <button key={mc}
                                                className={'sheet-opt' + (mesaFiltro === mc ? ' sel' : '')}
                                                onClick={() => { setMesaFiltro(mesaFiltro === mc ? null : mc); setSheet(null); }}>
                                                <span>Mesa {p0.mesaNumero}</span>
                                                <b>{activos.filter(p => p.mesaCode === mc).length}</b>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                        <button className="sheet-listo" onClick={() => setSheet(null)}>Listo</button>
                    </div>
                </div>
            )}

            {/* Sheet A cobrar: desglose por mesa */}
            {sheet === 'cobrar' && (
                <div className="sheet-overlay" onClick={() => setSheet(null)}>
                    <div className="sheet" onClick={e => e.stopPropagation()}>
                        <div className="sheet-head">
                            <div>
                                <div className="sheet-title">💰 A cobrar</div>
                                <div className="sheet-desc">Suma de los pedidos activos de cada mesa.</div>
                            </div>
                            <button className="sheet-cerrar" onClick={() => setSheet(null)}>✕</button>
                        </div>
                        <div className="sheet-opts">
                            {Object.keys(totalesMesa).length === 0 && (
                                <div className="empty">Nada para cobrar todavía.</div>
                            )}
                            {Object.entries(totalesMesa).map(([num, t]) => (
                                <div key={num} className="sheet-opt estatico">
                                    <span>Mesa {num}</span><b>{gs(t)}</b>
                                </div>
                            ))}
                            {Object.keys(totalesMesa).length > 1 && (
                                <div className="sheet-opt estatico total">
                                    <span>Total salón</span>
                                    <b>{gs(Object.values(totalesMesa).reduce((a, b) => a + b, 0))}</b>
                                </div>
                            )}
                        </div>
                        <button className="sheet-listo" onClick={() => setSheet(null)}>Listo</button>
                    </div>
                </div>
            )}

            {/* Sheet Mi zona: mesas del turno + ver todas */}
            {sheet === 'zona' && mozo && (
                <div className="sheet-overlay" onClick={() => setSheet(null)}>
                    <div className="sheet" onClick={e => e.stopPropagation()}>
                        <div className="sheet-head">
                            <div>
                                <div className="sheet-title">🗺️ Mi zona</div>
                                <div className="sheet-desc">
                                    Marcá las mesas que cubrís este turno — filtra tu panel y tus avisos. Sin marca = todas.
                                </div>
                            </div>
                            <button className="sheet-cerrar" onClick={() => setSheet(null)}>✕</button>
                        </div>
                        {(mozo.mesas || []).length > 0 && (
                            <button className={'sheet-opt' + (verTodas ? ' sel' : '')}
                                onClick={() => setVerTodas(!verTodas)}>
                                <span>🌐 Ver todas las mesas (salir de mi zona)</span>
                            </button>
                        )}
                        <div className="zona-grid">
                            {mesasPanel.map(m => (
                                <button key={m.id}
                                    className={'mozo-mesa' + ((mozo.mesas || []).includes(m.id) ? ' ocupada' : '')}
                                    onClick={() => toggleZona(m.id)}>
                                    Mesa {m.numero}
                                </button>
                            ))}
                        </div>
                        <button className="sheet-listo" onClick={() => setSheet(null)}>
                            Listo{mozo.mesas && mozo.mesas.length ? ` · ${mozo.mesas.length} mesas` : ' · todas'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
