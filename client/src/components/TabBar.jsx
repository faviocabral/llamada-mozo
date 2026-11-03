import React from 'react';

const TABS = [
    { id: 'home', ico: '🏠', label: 'Inicio' },
    { id: 'menu', ico: '🍽️', label: 'Menú' },
    { id: 'pedido', ico: '🧾', label: 'Pedido' },
    { id: 'estado', ico: '📋', label: 'Estado' }
];

export default function TabBar({ tab, setTab, pedidoCount, estadoCount, esMozo, onPanel }) {
    const renderTab = (t) => (
        <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
        >
            <span className="ico">{t.ico}</span>
            {t.label}
            {t.id === 'pedido' && pedidoCount > 0 && (
                <span className="badge-count">{pedidoCount}</span>
            )}
            {t.id === 'estado' && estadoCount > 0 && (
                <span className="badge-count">{estadoCount}</span>
            )}
        </button>
    );

    return (
        <nav className="tabbar">
            {/* En modo mozo, el Panel va al centro como botón elevado:
                atajo directo al tablero operativo desde cualquier mesa */}
            {esMozo ? TABS.slice(0, 2).map(renderTab) : null}
            {esMozo && (
                <button className="tab tab-panel" onClick={onPanel}>
                    <span className="tab-panel-btn">📋</span>
                    Panel
                </button>
            )}
            {(esMozo ? TABS.slice(2) : TABS).map(renderTab)}
        </nav>
    );
}
