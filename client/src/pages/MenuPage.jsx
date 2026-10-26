import React, { useState } from 'react';

const gs = (n) => 'Gs. ' + n.toLocaleString('es-PY');

// Icono por categoría (palabras clave, pensado para fast food)
const ICONOS_CAT = [
    [/hamburguesa|burger|lomito|sandwich|s[aá]nguche|milanesa|minuta/i, '🍔'],
    [/empanada/i, '🥟'],
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
export default function MenuPage({ info, cart, sumar, restar, goPedido, llamando, onToggleLlamado }) {
    const [catSel, setCatSel] = useState(null); // null = todas
    const [sheetItem, setSheetItem] = useState(null); // ítem con variantes abierto

    const porCat = {};
    (info.menu || []).forEach(i => { (porCat[i.categoria] = porCat[i.categoria] || []).push(i); });
    const cats = Object.keys(porCat);
    const visibles = catSel && porCat[catSel] ? [catSel] : cats;

    // Cantidad total del ítem en el carrito (sumando todas sus variantes)
    const qtyItem = (item) => item.variantes && item.variantes.length
        ? item.variantes.reduce((s, v) => s + (cart[item.id + '|' + v.id] || 0), 0)
        : (cart[item.id] || 0);

    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    // Total por línea de carrito: "itemId" o "itemId|varianteId" (precio de la variante)
    const porId = new Map((info.menu || []).map(i => [i.id, i]));
    const total = Object.entries(cart).reduce((s, [key, cant]) => {
        const [id, vid] = key.split('|');
        const item = porId.get(id);
        if (!item) return s;
        const v = vid && item.variantes ? item.variantes.find(x => x.id === vid) : null;
        return s + cant * (v ? v.precio : (item.precio || 0));
    }, 0);

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
                        {porCat[cat].map(item => {
                            const conVariantes = item.variantes && item.variantes.length > 0;
                            const qty = qtyItem(item);
                            return (
                                <div className={'item-row' + (qty ? ' sel' : '')} key={item.id}>
                                    <div className="item-info">
                                        <div className="item-name">{item.nombre}</div>
                                        <div className="item-desc">{item.descripcion}</div>
                                        <div className="item-price">
                                            {conVariantes
                                                ? gs(Math.min(...item.variantes.map(v => v.precio))) + ' +'
                                                : gs(item.precio)}
                                        </div>
                                    </div>
                                    {conVariantes ? (
                                        <button className="var-btn" onClick={() => setSheetItem(item)}>
                                            {qty > 0 ? `${qty} · Elegir` : '+ Elegir'}
                                        </button>
                                    ) : (
                                        <div className="stepper">
                                            {qty > 0 && (
                                                <>
                                                    <button onClick={() => restar(item.id)} aria-label="quitar">−</button>
                                                    <span className="qty">{qty}</span>
                                                </>
                                            )}
                                            <button onClick={() => sumar(item.id)} aria-label="agregar">+</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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

            {/* Hoja de variantes: stepper por tamaño/sabor, tipo Loyverse */}
            {sheetItem && (
                <div className="sheet-overlay" onClick={() => setSheetItem(null)}>
                    <div className="sheet" onClick={e => e.stopPropagation()}>
                        <div className="sheet-head">
                            <div>
                                <div className="sheet-title">{sheetItem.nombre}</div>
                                <div className="sheet-desc">{sheetItem.descripcion}</div>
                            </div>
                            <button className="sheet-cerrar" onClick={() => setSheetItem(null)}>✕</button>
                        </div>
                        {sheetItem.variantes.map(v => {
                            const key = sheetItem.id + '|' + v.id;
                            const q = cart[key] || 0;
                            return (
                                <div className="variante-row" key={v.id}>
                                    <div className="variante-info">
                                        <div className="variante-nombre">{v.nombre}</div>
                                        <div className="variante-precio">{gs(v.precio)}</div>
                                    </div>
                                    <div className="stepper">
                                        {q > 0 && (
                                            <>
                                                <button onClick={() => restar(key)} aria-label="quitar">−</button>
                                                <span className="qty">{q}</span>
                                            </>
                                        )}
                                        <button onClick={() => sumar(key)} aria-label="agregar">+</button>
                                    </div>
                                </div>
                            );
                        })}
                        <button className="sheet-listo" onClick={() => setSheetItem(null)}>
                            Listo{qtyItem(sheetItem) > 0 ? ` · ${qtyItem(sheetItem)} agregados` : ''}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
