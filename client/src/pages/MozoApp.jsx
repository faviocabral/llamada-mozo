import React, { useEffect, useState } from 'react';
import MesaApp from '../MesaApp.jsx';
import MozoPanel from './MozoPanel.jsx';

// App de staff — perfil mozo: Panel operativo (todas las mesas) +
// Tomar pedido (app del cliente a nombre de una mesa). Entra con
// ?key= (la misma del panel clásico); queda guardada para la app instalada.
export default function MozoApp() {
    const [key] = useState(() => {
        const k = new URLSearchParams(location.search).get('key');
        if (k) localStorage.setItem('mozoKey', k);
        return k || localStorage.getItem('mozoKey') || '';
    });
    const [vista, setVista] = useState('panel'); // 'panel' | 'pedido'
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [mesaSel, setMesaSel] = useState(null);

    useEffect(() => {
        if (vista !== 'pedido' || mesaSel) return;
        // Al volver al selector refresca los contadores de activos
        setData(null);
        fetch('/api/mozos/mesas?key=' + encodeURIComponent(key))
            .then(r => { if (!r.ok) throw new Error('bad'); return r.json(); })
            .then(setData)
            .catch(() => setError('Clave inválida o sin conexión.'));
    }, [key, vista, mesaSel]);

    // Mesa elegida: app del cliente en modo mozo (ocupa toda la pantalla)
    if (mesaSel) {
        return <MesaApp key={mesaSel.code} codeProp={mesaSel.code} esMozo
            onCambiarMesa={() => setMesaSel(null)}
            onPanel={() => { setMesaSel(null); setVista('panel'); }} />;
    }

    if (error) return <div className="centro"><div><h1>⚠️</h1><p>{error}</p></div></div>;

    return (
        <>
            {vista === 'panel' && <MozoPanel mozoKey={key}
                onTomarPedido={m => setMesaSel(m)} />}

            {vista === 'pedido' && (
                <div className="page">
                    <div className="topbar">
                        Tomar pedido
                        <small>{data ? data.sucursal : '…'} · Elegí la mesa</small>
                    </div>
                    <div className="page-inner mozo-mesas">
                        {!data && <div className="empty">Cargando mesas…</div>}
                        {data && data.mesas.map(m => (
                            <button key={m.code}
                                className={'mozo-mesa' + (m.activos ? ' ocupada' : '')}
                                onClick={() => setMesaSel(m)}>
                                Mesa {m.numero}
                                {m.activos > 0 && (
                                    <span className="mesa-activos">
                                        {m.activos} pedido{m.activos > 1 ? 's' : ''} activo{m.activos > 1 ? 's' : ''}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Navbar de staff: panel operativo + tomar pedido */}
            <nav className="staff-nav">
                <button className={vista === 'panel' ? 'on' : ''}
                    onClick={() => setVista('panel')}>
                    📋<span>Panel</span>
                </button>
                <button className={vista === 'pedido' ? 'on' : ''}
                    onClick={() => setVista('pedido')}>
                    🪑<span>Pedido</span>
                </button>
            </nav>
        </>
    );
}
