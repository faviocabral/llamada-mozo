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

// Tab Estado: seguimiento en vivo de los pedidos ya hechos por la mesa
// + activación del aviso push "pedido listo".
export default function EstadoPage({ info, pedidos, pushEstado, onActivarPush, llamando, onToggleLlamado, onAgregarMas }) {
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
                            <Stepper estado={p.estado} />
                        )}
                        <div className="pedido-cliente">{p.cliente || 'Pedido'}</div>
                        <div className="pedido-items">
                            {p.items.map((i, idx) => (
                                <div className="ped-line" key={idx}>
                                    <span>{i.cantidad}× {i.nombre}</span>
                                    <span>{gs(i.precio * i.cantidad)}</span>
                                </div>
                            ))}
                        </div>
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

                {pushEstado === 'pendiente' && (
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
