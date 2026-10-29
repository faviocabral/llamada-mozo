import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import TabBar from './components/TabBar.jsx';
import Toast from './components/Toast.jsx';
import Lottie from './components/Lottie.jsx';
import Home from './pages/Home.jsx';
import MenuPage from './pages/MenuPage.jsx';
import PedidoPage from './pages/PedidoPage.jsx';
import EstadoPage from './pages/EstadoPage.jsx';

// Push del cliente: aviso "pedido listo" con la app en segundo plano.
const pushSoportado =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// iOS (16.4+): el push solo funciona si la app está instalada en la
// pantalla de inicio. En Safari normal PushManager no existe.
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
const iosSinInstalar = esIOS && !esStandalone;

const b64aUint8 = (str) => {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
};

// La suscripción queda inválida si cambiaron las llaves VAPID del servidor.
const mismaKey = (a, b) => {
    const x = new Uint8Array(a || []);
    const y = new Uint8Array(b || []);
    return x.length === y.length && x.every((v, i) => v === y[i]);
};

// Firma para detectar avances: estado agregado + estado de cada partida.
// El agregado solo no alcanza: cocina puede avanzar sin que cambie.
const firmaPedido = (p) =>
    p.estado + '|' + (p.partidas || []).map(pt => pt.estacion + ':' + pt.estado).join(',');

export default function MesaApp() {
    const { code } = useParams();
    // Identidad por dispositivo: los avisos de pedido llegan solo a quien ordenó
    const [clienteId] = useState(() => {
        let id = localStorage.getItem('mesaClienteId');
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID()
                : Date.now() + '-' + Math.random().toString(16).slice(2);
            localStorage.setItem('mesaClienteId', id);
        }
        return id;
    });
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('home');
    // Carrito persistido por mesa: un refresh accidental no borra lo elegido
    const [cart, setCart] = useState(() => {
        try { return JSON.parse(localStorage.getItem('cart:' + code) || '{}'); }
        catch { return {}; }
    });
    useEffect(() => {
        localStorage.setItem('cart:' + code, JSON.stringify(cart));
    }, [cart, code]);
    const [pedidos, setPedidos] = useState([]);
    const [enviado, setEnviado] = useState(false); // overlay de éxito post-envío
    const [llamando, setLlamando] = useState(false);
    const [toast, setToast] = useState(null);
    const [pushEstado, setPushEstado] = useState(() =>
        !pushSoportado ? 'no-soportado'
            : Notification.permission === 'denied' ? 'denegado'
                : 'pendiente');
    // Chrome lo dispara cuando la PWA es instalable: lo guardamos para
    // mostrar nuestro propio botón "Instalar app" (el del menú desaparece)
    const [installEvt, setInstallEvt] = useState(null);
    const socketRef = useRef(null);
    const toastTimer = useRef(null);
    const estadosPrevios = useRef(new Map());
    const audioRef = useRef(null);

    // Chime suave tipo notificación (no alarma): suena con la app abierta.
    // El navegador lo habilita recién tras la primera interacción del usuario.
    const sonarAviso = () => {
        try {
            if (!audioRef.current) {
                audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioRef.current;
            if (ctx.state === 'suspended') ctx.resume();
            [880, 1174].forEach((freq, i) => {   // ding-ding agudo y corto
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = freq;
                o.connect(g);
                g.connect(ctx.destination);
                const t = ctx.currentTime + i * 0.15;
                g.gain.setValueAtTime(0.001, t);
                g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
                o.start(t);
                o.stop(t + 0.45);
            });
        } catch (e) { /* audio bloqueado hasta que el usuario interactúe */ }
    };

    // Sonido de "llamando": tono de timbre telefónico corto (dos pulsos),
    // para confirmarle al cliente que el llamado salió.
    const sonarLlamando = () => {
        try {
            if (!audioRef.current) {
                audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioRef.current;
            if (ctx.state === 'suspended') ctx.resume();
            [0, 0.35].forEach((offset) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = 440;   // tono de línea telefónica
                o.connect(g);
                g.connect(ctx.destination);
                const t = ctx.currentTime + offset;
                g.gain.setValueAtTime(0.001, t);
                g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
                g.gain.setValueAtTime(0.25, t + 0.28);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
                o.start(t);
                o.stop(t + 0.32);
            });
        } catch (e) {}
    };

    const avisar = (msg, tipo = '') => {
        clearTimeout(toastTimer.current);
        setToast({ msg, tipo });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const upsertPedido = (lista, pedido) => {
        const i = lista.findIndex(p => p.id === pedido.id);
        const nueva = i === -1 ? [pedido, ...lista] : lista.map(p => p.id === pedido.id ? pedido : p);
        return nueva.sort((a, b) => new Date(b.hora) - new Date(a.hora));
    };

    useEffect(() => {
        // Datos de la mesa y menú
        fetch(`/api/mesa/${encodeURIComponent(code)}`)
            .then(r => { if (!r.ok) throw new Error('QR inválido'); return r.json(); })
            .then(setInfo)
            .catch(() => setError('Este código QR no corresponde a una mesa válida.'));

        // Precalienta el chunk de lottie-web en background: cuando el
        // overlay de éxito o la señal del mozo lo necesitan, ya está en caché
        // y dibuja al instante (sin esperar 300KB de descarga).
        import('lottie-web').catch(() => {});

        // Socket: sala de la mesa + eventos en vivo
        const socket = io();
        socketRef.current = socket;
        socket.on('connect', () => {
            socket.emit('unirse-mesa', code);
            socket.emit('pedidos-mesa', { mesa: code }, (res) => {
                if (res && res.ok) {
                    setPedidos(res.pedidos);
                    // Sin esto el primer pedido-actualizado sonaría sin base:
                    // hay que conocer el estado anterior para detectar el avance
                    res.pedidos.forEach(p => estadosPrevios.current.set(p.id, firmaPedido(p)));
                }
            });
            // Reenvía la suscripción si el permiso ya estaba dado: el server
            // puede haber perdido las subs tras un restart (fs efímero en Render).
            if (pushSoportado && Notification.permission === 'granted') suscribirPush();
        });
        socket.on('mozo-en-camino', () => {
            setLlamando(false);
            avisar('✅ ¡El mozo vio tu llamado y está en camino!', 'ok');
            sonarAviso();
            if ('vibrate' in navigator) navigator.vibrate([200]);
        });
        socket.on('llamado-reactivado', () => {
            setLlamando(true);
            avisar('⏳ Tu llamado sigue pendiente — el mozo aún no llegó.');
            sonarAviso();
        });
        socket.on('pedido-actualizado', (pedido) => {
            const previo = estadosPrevios.current.get(pedido.id);
            const firma = firmaPedido(pedido);
            estadosPrevios.current.set(pedido.id, firma);
            const previoEstado = previo ? previo.split('|')[0] : undefined;
            // Ding en cada avance (incluye avances por partida aunque el
            // estado agregado no cambie, p.ej. cocina avanza y barra sigue)
            if (firma !== previo && previo !== undefined) {
                sonarAviso();
            }
            if (pedido.estado === 'listo' && previoEstado !== 'listo') {
                avisar('🎉 ¡Tu pedido está listo!', 'ok');
                if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            }
            setPedidos(lista => upsertPedido(lista, pedido));
        });
        // El audio queda habilitado desde la primera interacción del usuario
        const desbloquearAudio = () => {
            try {
                if (!audioRef.current) {
                    audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioRef.current.state === 'suspended') audioRef.current.resume();
            } catch (e) {}
        };
        document.addEventListener('pointerdown', desbloquearAudio);
        return () => {
            document.removeEventListener('pointerdown', desbloquearAudio);
            socket.disconnect();
        };
    }, [code]);

    // Captura el prompt de instalación PWA (Android/Chrome) para ofrecer
    // "Instalar app" desde la Home; en iOS se guía por texto.
    useEffect(() => {
        const onInstallable = (e) => { e.preventDefault(); setInstallEvt(e); };
        const onInstalled = () => setInstallEvt(null);
        window.addEventListener('beforeinstallprompt', onInstallable);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onInstallable);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const instalarApp = async () => {
        if (!installEvt) return;
        installEvt.prompt();
        await installEvt.userChoice.catch(() => null);
        setInstallEvt(null);
    };

    // ---------- Push "pedido listo" ----------
    const suscribirPush = async () => {
        if (!pushSoportado || !info || !info.vapidKey) return false;
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const appKey = b64aUint8(info.vapidKey);
            let sub = await reg.pushManager.getSubscription();
            if (sub && !mismaKey(sub.options.applicationServerKey, appKey)) {
                await sub.unsubscribe();
                sub = null;
            }
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: appKey
                });
            }
            const res = await fetch(`/api/mesa/${encodeURIComponent(code)}/push-sub`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...sub.toJSON(), clienteId })
            });
            setPushEstado(res.ok ? 'activo' : 'pendiente');
            return res.ok;
        } catch (e) {
            console.error(e);
            setPushEstado('pendiente');
            return false;
        }
    };

    // Gesto del usuario → pedir permiso y suscribir
    const activarPush = async () => {
        if (!pushSoportado) return setPushEstado('no-soportado');
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') return setPushEstado('denegado');
        if (await suscribirPush()) avisar('🔔 Te avisamos cuando tu pedido esté listo', 'ok');
    };

    // Si el permiso ya estaba dado (visita anterior), re-suscribe en silencio
    useEffect(() => {
        if (info && pushSoportado && Notification.permission === 'granted') {
            suscribirPush();
        }
    }, [info]);

    // ---------- Carrito ----------
    const sumar = (id) => setCart(c => ({ ...c, [id]: Math.min(20, (c[id] || 0) + 1) }));
    const restar = (id) => setCart(c => {
        const n = { ...c };
        if (n[id] > 1) n[id]--; else delete n[id];
        return n;
    });
    const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

    // "Adelantar ya la bebida": prioriza la partida de su pedido (aviso al mozo)
    // `pt` puede ser la partida (objeto) o el nombre de la estación (string)
    const refPartida = (pt) => (typeof pt === 'object' && pt ? (pt.estacion || pt.id) : pt);

    const adelantarPartida = (pedidoId, pt) => {
        socketRef.current.emit('cliente-adelanta-partida',
            { mesa: code, id: pedidoId, estacion: refPartida(pt) }, (res) => {
                if (res && res.ok) avisar('🔥 Pedida ya — el mozo la trae enseguida', 'ok');
                else avisar('❌ ' + ((res && res.error) || 'No se pudo'), 'err');
            });
    };

    // Control cruzado: el cliente confirma que recibió una partida
    const confirmarEntrega = (pedidoId, pt) => {
        socketRef.current.emit('cliente-partida-recibida',
            { mesa: code, id: pedidoId, estacion: refPartida(pt) }, (res) => {
                if (res && res.ok) avisar('✓ Recibo confirmado', 'ok');
            });
    };

    const enviarPedido = (cliente, nota, adelantarBebida) => {
        // Claves del carrito: "itemId" o "itemId|varianteId"
        const items = Object.entries(cart).map(([key, cantidad]) => {
            const [id, variante] = key.split('|');
            return { id, variante: variante || undefined, cantidad };
        });
        socketRef.current.emit('cliente-pedido', {
            mesa: code, cliente, clienteId, nota, items,
            adelantar: adelantarBebida ? 'barra' : undefined
        }, (res) => {
            if (res && res.ok) {
                setCart({});
                // Check animado un instante antes de saltar a Estado:
                // confirma visualmente que el pedido salió, sin que el
                // cliente se pregunte si el toque registró algo
                setEnviado(true);
                setTimeout(() => { setEnviado(false); setTab('estado'); }, 1500);
            } else {
                avisar('❌ ' + ((res && res.error) || 'No se pudo enviar'), 'err');
            }
        });
    };

    // ---------- Llamado al mozo ----------
    const toggleLlamado = () => {
        const socket = socketRef.current;
        if (!llamando) {
            socket.emit('cliente-llama', { mesa: code }, (res) => {
                if (res && (res.ok || res.yaPendiente)) {
                    setLlamando(true);
                    sonarLlamando();
                    avisar('⏳ Llamando al mozo… tocá de nuevo para cancelar.');
                } else {
                    avisar('❌ ' + ((res && res.error) || 'No se pudo llamar'), 'err');
                }
            });
        } else {
            socket.emit('cliente-cancela', { mesa: code }, () => {
                setLlamando(false);
                avisar('Llamado cancelado.');
            });
        }
    };

    if (error) return <div className="centro"><div><h1>⚠️</h1><p>{error}</p></div></div>;
    if (!info) return <div className="centro"><p>Cargando menú…</p></div>;

    return (
        <>
            {tab === 'home' && (
                <Home info={info} pushEstado={pushEstado}
                    onActivarPush={activarPush} iosSinInstalar={iosSinInstalar}
                    installEvt={installEvt} onInstalar={instalarApp} />
            )}
            {tab === 'menu' && (
                <MenuPage info={info} cart={cart} sumar={sumar} restar={restar}
                    goPedido={() => setTab('pedido')}
                    llamando={llamando} onToggleLlamado={toggleLlamado} />
            )}
            {tab === 'pedido' && (
                <PedidoPage info={info} cart={cart} sumar={sumar} restar={restar}
                    enviarPedido={enviarPedido}
                    llamando={llamando} onToggleLlamado={toggleLlamado} />
            )}
            {tab === 'estado' && (
                <EstadoPage info={info} pedidos={pedidos} clienteId={clienteId}
                    pushEstado={pushEstado} onActivarPush={activarPush}
                    iosSinInstalar={iosSinInstalar}
                    llamando={llamando} onToggleLlamado={toggleLlamado}
                    onAgregarMas={() => setTab('menu')}
                    onAdelantaPartida={adelantarPartida}
                    onConfirmaEntrega={confirmarEntrega} />
            )}

            {/* En las tabs con topbar la campana va dentro de la barra;
                en Inicio queda como FAB flotante */}
            {tab === 'home' && (
                <button
                    className={'fab' + (llamando ? ' pendiente' : '')}
                    onClick={toggleLlamado}
                    title={llamando ? 'Cancelar llamado' : 'Llamar al mozo'}
                >
                    {llamando
                        ? <><Lottie src="/lottie/signal.json" loop size={22} className="fab-signal" /> Cancelar</>
                        : '🔔 Mozo'}
                </button>
            )}

            {/* Éxito del envío: check animado a pantalla completa */}
            {enviado && (
                <div className="lottie-overlay">
                    <Lottie src="/lottie/success.json" size={170} />
                    <div className="lottie-overlay-txt">¡Pedido enviado a cocina!</div>
                </div>
            )}

            <TabBar tab={tab} setTab={setTab} pedidoCount={cartCount}
                estadoCount={pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'rechazado').length} />
            <Toast toast={toast} />
        </>
    );
}
