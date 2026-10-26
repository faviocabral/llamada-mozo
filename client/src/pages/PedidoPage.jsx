import React, { useState } from 'react';

const gs = (n) => 'Gs. ' + n.toLocaleString('es-PY');
const CAT_BEBIDA = /bebida|drink|refresco|gaseosa|cerveza|trago|jugo|agua|caf[eé]/i;

// Tab Pedido: carrito editable + envío. El seguimiento de pedidos ya hechos
// vive en la pestaña Estado.
export default function PedidoPage({ info, cart, sumar, restar, enviarPedido, llamando, onToggleLlamado }) {
    const [cliente, setCliente] = useState(localStorage.getItem('mesaCliente') || '');
    const [nota, setNota] = useState('');
    const [adelantar, setAdelantar] = useState(false);

    const items = (info.menu || []).filter(i => cart[i.id]);
    const count = items.reduce((s, i) => s + cart[i.id], 0);
    const total = items.reduce((s, i) => s + cart[i.id] * i.precio, 0);
    const hayBebida = items.some(i => CAT_BEBIDA.test(i.categoria || ''));

    const enviar = () => {
        localStorage.setItem('mesaCliente', cliente.trim());
        enviarPedido(cliente.trim(), nota.trim(), adelantar && hayBebida);
        setNota('');
        setAdelantar(false);
    };

    return (
        <div className="page">
            <div className="topbar">
                Tu pedido
                <small>Mesa {info.mesa.numero}</small>
                <button
                    className={'bell-top' + (llamando ? ' pendiente' : '')}
                    onClick={onToggleLlamado}
                    title={llamando ? 'Cancelar llamado' : 'Llamar al mozo'}
                >{llamando ? '✕ Cancelar' : '🔔 Mozo'}</button>
            </div>
            <div className="page-inner">
                {count === 0 && (
                    <div className="empty">Todavía no agregaste nada.<br />Andá a la pestaña Menú 🍽️</div>
                )}

                {count > 0 && (
                    <>
                        <div className="sec-title">Carrito</div>
                        {items.map(item => (
                            <div className="item-row" key={item.id}>
                                <div className="item-info">
                                    <div className="item-name">{item.nombre}</div>
                                    <div className="item-price">{gs(item.precio)} c/u</div>
                                </div>
                                <div className="stepper">
                                    <button onClick={() => restar(item.id)}>−</button>
                                    <span className="qty">{cart[item.id]}</span>
                                    <button onClick={() => sumar(item.id)}>+</button>
                                </div>
                            </div>
                        ))}
                        <div className="field">
                            <label>¿Para quién es? (opcional — si pide cada uno, poné tu nombre)</label>
                            <input
                                value={cliente}
                                onChange={e => setCliente(e.target.value)}
                                placeholder="Ej: Juan, mesa ventana…"
                                maxLength={30}
                            />
                        </div>
                        <div className="field">
                            <label>Nota para cocina (opcional)</label>
                            <textarea
                                value={nota}
                                onChange={e => setNota(e.target.value)}
                                placeholder="Sin cebolla, punto medio…"
                                maxLength={200}
                            />
                        </div>
                        {hayBebida && (
                            <label className="check-adelantar">
                                <input
                                    type="checkbox"
                                    checked={adelantar}
                                    onChange={e => setAdelantar(e.target.checked)}
                                />
                                🥤 Traeme la bebida primero, mientras se cocina la comida
                            </label>
                        )}
                        <button className="big-btn" onClick={enviar}>
                            ENVIAR PEDIDO · {gs(total)}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
