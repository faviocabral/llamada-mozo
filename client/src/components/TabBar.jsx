import React from 'react';

const TABS = [
    { id: 'home', ico: '🏠', label: 'Inicio' },
    { id: 'menu', ico: '🍽️', label: 'Menú' },
    { id: 'pedido', ico: '🧾', label: 'Pedido' },
    { id: 'estado', ico: '📋', label: 'Estado' }
];

export default function TabBar({ tab, setTab, pedidoCount, estadoCount, esMozo, onPanel, onMesas }) {
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

    if (!esMozo) {
        return <nav className="tabbar">{TABS.map(renderTab)}</nav>;
    }

    // Modo mozo: Mesas (volver a la grilla) | Menú | Panel elevado | Pedido | Estado
    return (
        <nav className="tabbar">
            <button className="tab" onClick={onMesas}>
                <span className="ico">🪑</span>
                Mesas
            </button>
            {renderTab(TABS[1])}
            <button className="tab tab-panel" onClick={onPanel}>
                <span className="tab-panel-btn">📋</span>
                Panel
            </button>
            {TABS.slice(2).map(renderTab)}
        </nav>
    );
}
