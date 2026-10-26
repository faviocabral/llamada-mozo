// Menú de ejemplo realista: ítem base + variantes (estilo Loyverse/Square).
// Un ítem con `variantes` no usa `precio` propio: cada variante lleva su precio.
// El seed (store.js) y el data.json local cargan este mismo listado.

const PZ = (id, nombre, descripcion, [m, g, x]) => ({
    id, sucursalId: 's1', categoria: 'Pizzas', nombre, descripcion, disponible: true,
    variantes: [
        { id: 'mediana', nombre: 'Mediana', precio: m },
        { id: 'grande', nombre: 'Grande', precio: g },
        { id: 'xl', nombre: 'Extra grande', precio: x }
    ]
});

const GAS = (id, nombre, precios) => ({
    id, sucursalId: 's1', categoria: 'Bebidas', nombre, descripcion: 'Gaseosa', disponible: true,
    variantes: [
        { id: 'v500', nombre: '500ml', precio: precios[0] },
        { id: 'v1l', nombre: '1 litro', precio: precios[1] },
        { id: 'v2l', nombre: '2 litros', precio: precios[2] }
    ]
});

const CERV = (id, nombre, [lata, botella]) => ({
    id, sucursalId: 's1', categoria: 'Bebidas', nombre, descripcion: 'Cerveza', disponible: true,
    variantes: [
        { id: 'lata', nombre: 'Lata 350ml', precio: lata },
        { id: 'bot1l', nombre: 'Botella 1L', precio: botella }
    ]
});

module.exports = [
    // ---------- Empanadas ----------
    {
        id: 'e1', sucursalId: 's1', categoria: 'Empanadas', nombre: 'Empanada',
        descripcion: 'Fritas, relleno casero', disponible: true,
        variantes: [
            { id: 'carne', nombre: 'Carne', precio: 5000 },
            { id: 'jyq', nombre: 'Jamón y queso', precio: 5000 },
            { id: 'choclo', nombre: 'Choclo', precio: 5000 },
            { id: 'pollo', nombre: 'Pollo catupiry', precio: 6000 },
            { id: 'chilena', nombre: 'Chilena', precio: 6000 }
        ]
    },

    // ---------- Lomitos ----------
    {
        id: 'l1', sucursalId: 's1', categoria: 'Lomitos', nombre: 'Lomito Árabe',
        descripcion: 'En pan árabe, con papas fritas', disponible: true,
        variantes: [
            { id: 'carne', nombre: 'Carne', precio: 38000 },
            { id: 'pollo', nombre: 'Pollo', precio: 36000 },
            { id: 'mixto', nombre: 'Mixto', precio: 38000 }
        ]
    },
    {
        id: 'l2', sucursalId: 's1', categoria: 'Lomitos', nombre: 'Lomito Sándwich',
        descripcion: 'Pan de lomito, con papas fritas', disponible: true,
        variantes: [
            { id: 'carne', nombre: 'Carne', precio: 32000 },
            { id: 'pollo', nombre: 'Pollo', precio: 30000 }
        ]
    },

    // ---------- Hamburguesas ----------
    {
        id: 'h1', sucursalId: 's1', categoria: 'Hamburguesas', nombre: 'Hamburguesa',
        descripcion: 'Con papas fritas', disponible: true,
        variantes: [
            { id: 'simple', nombre: 'Simple', precio: 25000 },
            { id: 'completa', nombre: 'Completa', precio: 32000 }
        ]
    },

    // ---------- Pizzas (sabor × tamaño) ----------
    PZ('pz1', 'Pizza Muzzarella', 'Salsa, muzza y orégano', [28000, 35000, 42000]),
    PZ('pz2', 'Pizza Napolitana', 'Muzza, tomate y ajo', [32000, 40000, 48000]),
    PZ('pz3', 'Pizza Choclo', 'Muzza y choclo cremoso', [32000, 40000, 48000]),
    PZ('pz4', 'Pizza Pepperoni', 'Muzza y pepperoni', [35000, 42000, 50000]),
    PZ('pz5', 'Pizza Palmitos', 'Muzza, palmitos y salsa golf', [35000, 42000, 50000]),
    PZ('pz6', 'Pizza Margarita', 'Muzza, tomate y albahaca', [30000, 38000, 45000]),

    // ---------- Minutas ----------
    { id: 'm1', sucursalId: 's1', categoria: 'Minutas', nombre: "Sopa so'o", descripcion: 'Sopa paraguaya casera', precio: 18000, disponible: true },
    { id: 'm2', sucursalId: 's1', categoria: 'Minutas', nombre: 'Tarta de jamón y queso', descripcion: 'Porción con ensalada', precio: 22000, disponible: true },
    {
        id: 'm3', sucursalId: 's1', categoria: 'Minutas', nombre: 'Sándwich de milanesa',
        descripcion: 'Con papas fritas', disponible: true,
        variantes: [
            { id: 'carne', nombre: 'Carne', precio: 28000 },
            { id: 'pollo', nombre: 'Pollo', precio: 26000 }
        ]
    },
    { id: 'm4', sucursalId: 's1', categoria: 'Minutas', nombre: 'Croqueta', descripcion: 'Orden de 6 unidades', precio: 20000, disponible: true },

    // ---------- Bebidas: gaseosas (marca × tamaño) ----------
    GAS('b1', 'Coca Cola', [8000, 12000, 16000]),
    GAS('b2', 'Pepsi', [7000, 11000, 15000]),
    GAS('b3', 'Fanta Naranja', [7000, 11000, 15000]),
    GAS('b4', 'Sprite', [7000, 11000, 15000]),
    GAS('b5', 'Mirinda Guaraná', [7000, 11000, 15000]),

    // ---------- Bebidas: cervezas (marca × presentación) ----------
    CERV('c1', 'Pilsen', [6000, 14000]),
    CERV('c2', 'Coronita', [8000, 18000]),
    CERV('c3', 'Brahma', [6000, 14000]),
    CERV('c4', 'Heineken', [9000, 20000]),

    { id: 'b9', sucursalId: 's1', categoria: 'Bebidas', nombre: 'Agua mineral', descripcion: 'Con o sin gas, 500ml', precio: 6000, disponible: true },

    // ---------- Postres ----------
    { id: 'd1', sucursalId: 's1', categoria: 'Postres', nombre: 'Flan casero', descripcion: 'Con dulce de leche y crema', precio: 14000, disponible: true }
];
