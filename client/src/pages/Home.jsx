import React from 'react';
import Hero from '../components/Hero.jsx';

// Pantalla 1 del mock: hero + nombre del local + activación de avisos
// como primer paso. El acceso al menú es por la navbar inferior.
export default function Home({ info, pushEstado, onActivarPush, iosSinInstalar, installEvt, onInstalar, esMozo, onCambiarMesa }) {
    return (
        <div className="home">
            <h1>{(info.tenant && info.tenant.nombre || 'BIENVENIDO').toUpperCase()}</h1>
            <div className="sub">{info.sucursal && info.sucursal.nombre} · Mesa {info.mesa.numero}</div>
            <Hero />
            <p>{esMozo
                ? 'Tomás el pedido a nombre de la mesa — se envía a cocina como si lo pidiera el cliente.'
                : 'Hacé tu pedido desde la mesa, seguí su estado en vivo y llamá al mozo cuando lo necesites.'}</p>
            {esMozo && (
                <button className="home-push" onClick={onCambiarMesa}>
                    🔙 Elegir otra mesa
                </button>
            )}
            {!esMozo && (iosSinInstalar ? (
                <div className="home-push">
                    📲 Para recibir avisos: <b>Compartir</b> → <b>“Agregar a pantalla de inicio”</b>
                </div>
            ) : (
                <>
                    {pushEstado === 'pendiente' && (
                        <button className="home-push" onClick={onActivarPush}>
                            🔔 Activá los avisos y te avisamos cuando esté listo
                        </button>
                    )}
                    {pushEstado === 'denegado' && (
                        <div className="home-push">
                            🔕 Avisos bloqueados: habilitalos en <b>Ajustes → Apps → Notificaciones</b> de esta app.
                        </div>
                    )}
                    {installEvt && (
                        <button className="home-push" onClick={onInstalar}>
                            📲 Instalar la app
                        </button>
                    )}
                </>
            ))}
        </div>
    );
}
