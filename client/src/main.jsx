import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MesaApp from './MesaApp.jsx';
import MozoApp from './pages/MozoApp.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <Routes>
            <Route path="/m/:code" element={<MesaApp />} />
            {/* Modo mozo: tomar pedidos a nombre de una mesa (?key=) */}
            <Route path="/mozo-app" element={<MozoApp />} />
            <Route path="*" element={
                <div className="centro">
                    <div>
                        <h1>🍽️</h1>
                        <p>Escaneá el código QR de tu mesa para empezar.</p>
                    </div>
                </div>
            } />
        </Routes>
    </BrowserRouter>
);
