import React from 'react';

// Ilustración placeholder estilo isométrico (reemplazar por el arte final).
export default function Hero() {
    return (
        <svg className="hero" viewBox="0 0 200 160" aria-hidden="true">
            <ellipse cx="100" cy="128" rx="72" ry="14" fill="#0f8f84" opacity=".45" />
            <path d="M42 108 a58 58 0 0 1 116 0 Z" fill="#ffffff" />
            <rect x="30" y="106" width="140" height="9" rx="4.5" fill="#0f8f84" />
            <rect x="96" y="38" width="8" height="12" rx="4" fill="#ffffff" />
            <circle cx="100" cy="36" r="8" fill="#ffffff" />
            <circle cx="52" cy="26" r="11" fill="#ffd166" />
            <text x="52" y="31" fontSize="12" textAnchor="middle" fill="#b27300">🍴</text>
            <rect x="128" y="14" width="28" height="28" rx="7" fill="#ff6b9d" transform="rotate(14 142 28)" />
            <text x="142" y="34" fontSize="15" textAnchor="middle" fill="#fff">✓</text>
            <circle cx="160" cy="60" r="6" fill="#ffffff" opacity=".8" />
            <circle cx="36" cy="66" r="5" fill="#ffffff" opacity=".7" />
        </svg>
    );
}
