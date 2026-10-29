import React from 'react';

const gs = (n) => 'Gs. ' + n.toLocaleString('es-PY');
const ESTADOS = {
    nuevo: 'Pendiente',
    confirmado: 'Confirmado ✓',
    preparando: 'Preparando 👨‍🍳',
    listo: 'Listo ✓',
    entregado: 'Entregado',
    rechazado: 'Rechazado'
};

// Pasos del seguimiento (tipo tracking de envío)
const PASOS = [
    { id: 'nuevo', ico: '🧾', label: 'Pendiente' },
    { id: 'confirmado', ico: '✓', label: 'Confirmado' },
    { id: 'preparando', ico: '👨‍🍳', label: 'Preparando' },
    { id: 'listo', ico: '🛎️', label: 'Listo' },
    { id: 'entregado', ico: '🍽️', label: 'Entregado' }
];
const ORDEN = PASOS.map(p => p.id);

function Stepper({ estado }) {
    const idx = ORDEN.indexOf(estado);
    return (
        <div className="steps">
            {PASOS.map((s, i) => (
                <React.Fragment key={s.id}>
                    {i > 0 && <div className={'step-line' + (i <= idx ? ' done' : '')} />}
                    <div className={'step' + (i <= idx ? ' done' : '') + (i === idx ? ' current' : '')}>
                        <span className="step-ico">{s.ico}</span>
                        <span className="step-label">{s.label}</span>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
}

const PARTIDA_LBL = {
    cocina: { ico: '🍽️', nombre: 'Comida' },
    barra: { ico: '🥤', nombre: 'Bebidas' }
};

// Estados compactos para partidas simples (bebidas): chip en vez de stepper
const ESTADO_COMPACTO = {
    nuevo: 'Pendiente', confirmado: 'En cola', preparando: 'Preparando',
    listo: 'Lista ✓', entregado: 'Entregada ✓', rechazado: 'Rechazada'
};

// Partidas dentro de la card: solo título + items. El estado de la comida
// lo muestra el stepper principal de la card; las demás estaciones llevan
// un chip compacto (bebidas, etc). Cuando el mozo marca una partida como
// entregada, el cliente confirma la recepción (control cruzado).
function FilaPartida({ pt, primera, onConfirma, onAdelanta }) {
    const lbl = PARTIDA_LBL[pt.estacion] || PARTIDA_LBL.cocina;
    return (
        <div className={'partida-block' + (primera ? ' primera' : '')}>
            <div className="partida-head">
                <span className="partida-titulo">{lbl.ico} {lbl.nombre}</span>
                {pt.estado === 'entregado' ? (
                    pt.recibido
                        ? <span className="partida-chip done">Recibida ✓✓</span>
                        : <button className="partida-chip confirmar"
                            onClick={() => onConfirma(pt)}>¿Ya la recibiste? Tocá ✓</button>
                ) : pt.estacion !== 'cocina' &&
                    // Chip solo cuando hay algo que reportar: urgente o ya en
                    // marcha. "Pendiente"/"En cola" no dice nada al cliente.
                    (pt.urgente || !['nuevo', 'confirmado'].includes(pt.estado)) && (
                    <span className={'partida-chip' + (pt.urgente && pt.estado !== 'listo' ? ' urgente' : '')}>
                        {pt.urgente && pt.estado !== 'listo' ? '🔥 Pedida ya' : (ESTADO_COMPACTO[pt.estado] || pt.estado)}
                    </span>
                )}
            </div>
            <ItemsPartida items={pt.items} />
            {/* Adelantar: solo partidas de bebidas aún activas y no urgentes */}
            {pt.estacion !== 'cocina' && !pt.urgente && onAdelanta &&
                !['entregado', 'rechazado'].includes(pt.estado) && (
                    <button className="adelantar-btn" onClick={() => onAdelanta(pt)}>
                        🔥 Adelantar ya la bebida
                    </button>
                )}
        </div>
    );
}

function ItemsPartida({ items }) {
    return (
        <div className="pedido-items">
            {items.map((i, idx) => (
                <div className="ped-line" key={idx}>
                    <span>{i.cantidad}× {i.nombre}{i.variante ? ' · ' + i.variante : ''}</span>
                    <span>{gs(i.precio * i.cantidad)}</span>
                </div>
            ))}
        </div>
    );
}

// Tab Estado: seguimiento en vivo de los pedidos ya hechos por la mesa
// + activación del aviso push "pedido listo".
export default function EstadoPage({ info, pedidos, clienteId, pushEstado, onActivarPush, iosSinInstalar, llamando, onToggleLlamado, onAgregarMas, onAdelantaPartida, onConfirmaEntrega }) {
    return (
        <div className="page">
            <div className="topbar">
                Pedidos de la mesa
                <small>Mesa {info.mesa.numero} · se actualizan en vivo</small>
                <button
                    className={'bell-top' + (llamando ? ' pendiente' : '')}
                    onClick={onToggleLlamado}
                    title={llamando ? 'Cancelar llamado' : 'Llamar al mozo'}
                >{llamando ? '✕ Cancelar' : '🔔 Mozo'}</button>
            </div>
            <div className="page-inner">
                {pedidos.length === 0 && (
                    <div className="empty">Todavía no hay pedidos en esta mesa.</div>
                )}

                {pedidos.map(p => (
                    <div className="pedido-card" key={p.id}>
                        {p.estado === 'rechazado' ? (
                            <div className="pedido-head">
                                <span className="quien">{p.cliente || 'Pedido'}</span>
                                <span className="estado-chip estado-rechazado">{ESTADOS.rechazado}</span>
                            </div>
                        ) : (
                            <>
                                <div className="pedido-cliente">
                                    {p.cliente || 'Pedido'}
                                    {p.clienteId && p.clienteId === clienteId &&
                                        <span className="chip-mio">Tu pedido</span>}
                                </div>
                                {(!(p.partidas || []).length || p.partidas.some(pt => pt.estacion === 'cocina')) &&
                                    // El stepper sigue a la comida; el agregado quedaría
                                    // frenado por una bebida aún pendiente
                                    <Stepper estado={(p.partidas || []).find(pt => pt.estacion === 'cocina')?.estado || p.estado} />}
                            </>
                        )}
                        {/* Una fila por partida: título + items + chip/botón
                            de confirmar recepción cuando el mozo entregó */}
                        {p.estado !== 'rechazado' && (p.partidas || []).length ? (
                            p.partidas.map((pt, i) => (
                                <FilaPartida pt={pt} key={pt.id} primera={i === 0}
                                    onConfirma={(x) => onConfirmaEntrega(p.id, x)}
                                    onAdelanta={(x) => onAdelantaPartida(p.id, x)} />
                            ))
                        ) : (
                            <ItemsPartida items={p.items} />
                        )}
                        {p.nota && <div className="nota">“{p.nota}”</div>}
                        <div className="pedido-foot">
                            <span className="pedido-hora">
                                {new Date(p.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="pedido-total">{gs(p.total)}</span>
                        </div>
                    </div>
                ))}

                {pedidos.length > 0 && (
                    <button className="push-btn" onClick={onAgregarMas}>
                        ➕ ¿Querés agregar algo más? Armá otro pedido desde el Menú
                    </button>
                )}

                {iosSinInstalar && pushEstado !== 'activo' && (
                    <div className="push-info">
                        📲 En iPhone los avisos requieren instalar la app:
                        tocá <b>Compartir</b> → <b>“Agregar a pantalla de inicio”</b>
                        y abrila desde el ícono.
                    </div>
                )}
                {!iosSinInstalar && pushEstado === 'pendiente' && (
                    <button className="push-btn" onClick={onActivarPush}>
                        🔔 Avisame cuando mi pedido esté listo
                    </button>
                )}
                {pushEstado === 'activo' && (
                    <div className="push-info">🔔 Avisos activados: te llega una notificación aunque cierres la app.</div>
                )}
                {pushEstado === 'denegado' && (
                    <div className="push-info">Los avisos están bloqueados en el navegador. Habilitalos desde la configuración del sitio.</div>
                )}
            </div>
        </div>
    );
}
