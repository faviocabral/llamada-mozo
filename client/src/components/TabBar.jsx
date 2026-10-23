import React from 'react';

const TABS = [
    { id: 'home', ico: '🏠', label: 'Inicio' },
    { id: 'menu', ico: '🍽️', label: 'Menú' },
    { id: 'pedido', ico: '🧾', label: 'Pedido' },
    { id: 'estado', ico: '📋', label: 'Estado' }
];

export default function TabBar({ tab, setTab, pedidoCount, estadoCount }) {
    return (
        <nav className="tabbar">
            {TABS.map(t => (
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
            ))}
        </nav>
    );
}
