import { useEffect, useRef } from 'react';

// Wrapper de lottie-web con import diferido: la lib (~300KB) solo se baja
// cuando una animación se muestra. El export CJS puede venir como default,
// named o colgado de window — cubrimos las tres formas.
export default function Lottie({ src, loop = false, size = 120, className, style }) {
    const ref = useRef(null);
    useEffect(() => {
        let anim;
        let cancelado = false;
        (async () => {
            try {
                const [m, data] = await Promise.all([
                    import('lottie-web'),
                    fetch(src).then(r => r.json())
                ]);
                const lottie = m.default || m.lottie || window.lottie;
                if (cancelado || !ref.current || !lottie) return;
                anim = lottie.loadAnimation({
                    container: ref.current,
                    renderer: 'svg',
                    loop,
                    autoplay: true,
                    animationData: data
                });
            } catch (e) { /* sin lib o sin JSON: queda vacío, no rompe la vista */ }
        })();
        return () => { cancelado = true; if (anim) anim.destroy(); };
    }, [src, loop]);
    return <div ref={ref} className={className} style={{ width: size, height: size, ...style }} />;
}
