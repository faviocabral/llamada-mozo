import React from 'react';

// Ilustración del hero con movimiento sutil por CSS: vapor del plato,
// campana flotando, brillo en el check. (reemplazar por el arte final).
export default function Hero() {
    return (
        <svg className="hero" viewBox="0 0 200 160" aria-hidden="true">
            <ellipse cx="100" cy="128" rx="72" ry="14" fill="#0f8f84" opacity=".45" />
            {/* Vapor que sube del plato */}
            <g className="hero-vapor" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" fill="none">
                <path className="vapor v1" d="M78 96 q-4 -8 0 -15 q4 -8 0 -15" />
                <path className="vapor v2" d="M100 92 q-4 -8 0 -15 q4 -8 0 -15" />
                <path className="vapor v3" d="M122 96 q-4 -8 0 -15 q4 -8 0 -15" />
            </g>
            <g className="hero-cloche">
                <path d="M42 108 a58 58 0 0 1 116 0 Z" fill="#ffffff" />
                <rect x="96" y="38" width="8" height="12" rx="4" fill="#ffffff" />
                <circle cx="100" cy="36" r="8" fill="#ffffff" />
            </g>
            <rect x="30" y="106" width="140" height="9" rx="4.5" fill="#0f8f84" />
            <circle className="hero-fork" cx="52" cy="26" r="11" fill="#ffd166" />
            <text x="52" y="31" fontSize="12" textAnchor="middle" fill="#b27300">🍴</text>
            <rect className="hero-check" x="128" y="22" width="28" height="28" rx="7" fill="#ff6b9d" transform="rotate(14 142 36)" />
            <text x="142" y="42" fontSize="15" textAnchor="middle" fill="#fff">✓</text>
            <circle className="hero-dot d1" cx="160" cy="60" r="6" fill="#ffffff" opacity=".8" />
            <circle className="hero-dot d2" cx="36" cy="66" r="5" fill="#ffffff" opacity=".7" />
        </svg>
    );
}
