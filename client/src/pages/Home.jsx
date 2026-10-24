import React from 'react';
import Hero from '../components/Hero.jsx';

// Pantalla 1 del mock: hero + nombre del local. El acceso al menú
// es por la navbar inferior.
export default function Home({ info }) {
    return (
        <div className="home">
            <h1>{(info.tenant && info.tenant.nombre || 'BIENVENIDO').toUpperCase()}</h1>
            <div className="sub">{info.sucursal && info.sucursal.nombre} · Mesa {info.mesa.numero}</div>
            <Hero />
            <p>Hacé tu pedido desde la mesa, seguí su estado en vivo y llamá al mozo cuando lo necesites.</p>
        </div>
    );
}
