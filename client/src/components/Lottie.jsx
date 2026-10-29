import { useEffect, useRef } from 'react';

// Wrapper mínimo de lottie-web con import diferido: la lib (~300KB) solo se
// descarga cuando una animación realmente se muestra, fuera del bundle base.
// Los JSONs viven en client/public/lottie/ (self-hosted, sin CDN).
export default function Lottie({ src, loop = false, size = 120, className, style }) {
    const ref = useRef(null);
    useEffect(() => {
        let anim;
        let cancelado = false;
        import('lottie-web').then(({ default: lottie }) => {
            if (cancelado || !ref.current) return;
            anim = lottie.loadAnimation({
                container: ref.current,
                renderer: 'svg',
                loop,
                autoplay: true,
                path: src
            });
        });
        return () => { cancelado = true; if (anim) anim.destroy(); };
    }, [src, loop]);
    return <div ref={ref} className={className} style={{ width: size, height: size, ...style }} />;
}
