import React, { useState, useEffect } from 'react';

const gs = (n) => 'Gs. ' + n.toLocaleString('es-PY');

// Icono por categoría (palabras clave, pensado para fast food)
const ICONOS_CAT = [
    [/hamburguesa|burger|lomito|sandwich|s[aá]nguche/i, '🍔'],
    [/pizza/i, '🍕'],
    [/papa|frita|nugget/i, '🍟'],
    [/pancho|hot.?dog|chorip/i, '🌭'],
    [/pollo|broaster|alita/i, '🍗'],
    [/entrada|tapeo|picada|aperitivo/i, '🥟'],
    [/ensalada|verdura|veggie|vegetar/i, '🥗'],
    [/parrilla|asado|carne|costilla/i, '🥩'],
    [/pasta|fideo|[ñn]oqui|lasagna/i, '🍝'],
    [/pescado|marisco/i, '🐟'],
    [/bebida|drink|refresco|gaseosa|cerveza|trago|jugo|agua|caf[eé]/i, '🥤'],
    [/postre|dulce|helado|flan|torta/i, '🍰'],
    [/combo|promo/i, '🎁'],
    [/desayuno|merienda/i, '🥐'],
    [/kids|ni[ñn]/i, '🧒'],
    [/extra|adicional|acompa/i, '➕']
];
const iconoCat = (cat) => (ICONOS_CAT.find(([re]) => re.test(cat)) || [null, '🍴'])[1];

// Pantalla 2 del mock: lista por categorías con stepper a la derecha
// y barra de acción fija arriba del tab bar.
// Carrusel de chips arriba para filtrar por categoría.
const CAT_BEBIDA = /bebida|drink|refresco|gaseosa|cerveza|trago|jugo|agua|caf[eé]/i;

export default function MenuPage({ info, cart, sumar, restar, goPedido, llamando, onToggleLlamado, catInicial, onCatUsada }) {
    const porCat = {};
    (info.menu || []).forEach(i => { (porCat[i.categoria] = porCat[i.categoria] || []).push(i); });
    const cats = Object.keys(porCat);

    // '__bebidas' = atajo desde Estado: abre el menú ya filtrado a bebidas
    const [catSel, setCatSel] = useState(() =>
        catInicial === '__bebidas' ? (cats.find(c => CAT_BEBIDA.test(c)) || null)
            : (catInicial && cats.includes(catInicial) ? catInicial : null));
    useEffect(() => { if (catInicial) onCatUsada && onCatUsada(); }, []);

    const visibles = catSel && porCat[catSel] ? [catSel] : cats;

    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    const total = (info.menu || []).reduce((s, i) => s + (cart[i.id] || 0) * i.precio, 0);

    return (
        <div className="page">
            <div className="menu-head">
                <div className="topbar">
                    Menú
                    <small>{info.sucursal && info.sucursal.nombre} · Mesa {info.mesa.numero}</small>
                    <button
                        className={'bell-top' + (llamando ? ' pendiente' : '')}
                        onClick={onToggleLlamado}
                        title={llamando ? 'Cancelar llamado' : 'Llamar al mozo'}
                    >{llamando ? '✕ Cancelar' : '🔔 Mozo'}</button>
                </div>
                <div className="cat-carousel">
                    <button
                        className={'chip' + (!catSel ? ' active' : '')}
                        onClick={() => setCatSel(null)}
                    >✨ Todas</button>
                    {cats.map(c => (
                        <button
                            key={c}
                            className={'chip' + (catSel === c ? ' active' : '')}
                            onClick={() => setCatSel(catSel === c ? null : c)}
                        >{iconoCat(c)} {c}</button>
                    ))}
                </div>
            </div>
            <div className="page-inner">
                {visibles.map(cat => (
                    <div key={cat}>
                        <div className="cat-title">{iconoCat(cat)} {cat}</div>
                        {porCat[cat].map(item => (
                            <div className={'item-row' + (cart[item.id] ? ' sel' : '')} key={item.id}>
                                <div className="item-info">
                                    <div className="item-name">{item.nombre}</div>
                                    <div className="item-desc">{item.descripcion}</div>
                                    <div className="item-price">{gs(item.precio)}</div>
                                </div>
                                <div className="stepper">
                                    {(cart[item.id] || 0) > 0 && (
                                        <>
                                            <button onClick={() => restar(item.id)} aria-label="quitar">−</button>
                                            <span className="qty">{cart[item.id]}</span>
                                        </>
                                    )}
                                    <button onClick={() => sumar(item.id)} aria-label="agregar">+</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
                {count > 0 && <div className="cart-spacer" />}
            </div>
            {count > 0 && (
                <button className="cart-bar" onClick={goPedido}>
                    <span>Ver pedido · {count} {count === 1 ? 'item' : 'items'}</span>
                    <span>{gs(total)}</span>
                </button>
            )}
        </div>
    );
}
