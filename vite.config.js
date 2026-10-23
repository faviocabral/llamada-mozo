import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La app React vive en client/ y compila a client/dist (servido por Express).
// En desarrollo: npx vite → puerto 5173 con proxy al backend en 3010.
// En producción: npm run build && npm start → todo en el puerto 3010.
export default defineConfig({
    root: 'client',
    plugins: [react()],
    build: { outDir: 'dist', emptyOutDir: true },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3010',
            '/socket.io': { target: 'http://localhost:3010', ws: true }
        }
    }
});
