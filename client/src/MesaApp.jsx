import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import TabBar from './components/TabBar.jsx';
import Toast from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import MenuPage from './pages/MenuPage.jsx';
import PedidoPage from './pages/PedidoPage.jsx';
import EstadoPage from './pages/EstadoPage.jsx';

// Push del cliente: aviso "pedido listo" con la app en segundo plano.
const pushSoportado =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

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

export default function MesaApp() {
    const { code } = useParams();
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('home');
    const [cart, setCart] = useState({});
    const [pedidos, setPedidos] = useState([]);
    const [llamando, setLlamando] = useState(false);
    const [toast, setToast] = useState(null);
    const [pushEstado, setPushEstado] = useState('pendiente');
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
                    res.pedidos.forEach(p => estadosPrevios.current.set(p.id, p.estado));
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
            estadosPrevios.current.set(pedido.id, pedido.estado);
            // Ding en cada avance: confirmado, preparando, listo, rechazado
            if (pedido.estado !== previo && previo !== undefined) {
                sonarAviso();
            }
            if (pedido.estado === 'listo' && previo !== 'listo') {
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
                body: JSON.stringify(sub)
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

    const enviarPedido = (cliente, nota) => {
        const items = Object.entries(cart).map(([id, cantidad]) => ({ id, cantidad }));
        socketRef.current.emit('cliente-pedido', { mesa: code, cliente, nota, items }, (res) => {
            if (res && res.ok) {
                setCart({});
                setTab('estado');
                avisar('🍽️ ¡Pedido enviado a cocina!', 'ok');
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
            {tab === 'home' && <Home info={info} onVerMenu={() => setTab('menu')} />}
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
                <EstadoPage info={info} pedidos={pedidos}
                    pushEstado={pushEstado} onActivarPush={activarPush}
                    llamando={llamando} onToggleLlamado={toggleLlamado}
                    onAgregarMas={() => setTab('menu')} />
            )}

            {/* En las tabs con topbar la campana va dentro de la barra;
                en Inicio queda como FAB flotante */}
            {tab === 'home' && (
                <button
                    className={'fab' + (llamando ? ' pendiente' : '')}
                    onClick={toggleLlamado}
                    title={llamando ? 'Cancelar llamado' : 'Llamar al mozo'}
                >
                    {llamando ? '✕ Cancelar' : '🔔 Mozo'}
                </button>
            )}

            <TabBar tab={tab} setTab={setTab} pedidoCount={cartCount}
                estadoCount={pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'rechazado').length} />
            <Toast toast={toast} />
        </>
    );
}
