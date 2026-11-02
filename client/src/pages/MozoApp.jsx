import React, { useEffect, useState } from 'react';
import MesaApp from '../MesaApp.jsx';

// Modo mozo: el camarero toma pedidos a nombre de una mesa usando la
// misma app del cliente. Entra con ?key= (la misma del panel /mozo);
// la clave queda guardada para la app instalada (sin querystring).
export default function MozoApp() {
    const [key] = useState(() => {
        const k = new URLSearchParams(location.search).get('key');
        if (k) localStorage.setItem('mozoKey', k);
        return k || localStorage.getItem('mozoKey') || '';
    });
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [mesaSel, setMesaSel] = useState(null);

    useEffect(() => {
        fetch('/api/mozos/mesas?key=' + encodeURIComponent(key))
            .then(r => { if (!r.ok) throw new Error('bad'); return r.json(); })
            .then(setData)
            .catch(() => setError('Clave inválida o sin conexión.'));
    }, [key]);

    // Mesa elegida: la app del cliente en modo mozo (sin campana/push)
    if (mesaSel) {
        return <MesaApp key={mesaSel.code} codeProp={mesaSel.code} esMozo
            onCambiarMesa={() => setMesaSel(null)} />;
    }

    if (error) return <div className="centro"><div><h1>⚠️</h1><p>{error}</p></div></div>;
    if (!data) return <div className="centro"><p>Cargando mesas…</p></div>;

    return (
        <div className="page">
            <div className="topbar">
                Tomar pedido
                <small>{data.sucursal} · Elegí la mesa</small>
            </div>
            <div className="page-inner mozo-mesas">
                {data.mesas.map(m => (
                    <button key={m.code} className="mozo-mesa" onClick={() => setMesaSel(m)}>
                        Mesa {m.numero}
                    </button>
                ))}
            </div>
        </div>
    );
}
