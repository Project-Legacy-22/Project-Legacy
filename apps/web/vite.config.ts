import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    build: {
        // The API serves this directory in production. Source files remain
        // owned by apps/web; only generated assets cross that boundary.
        outDir: '../api/dist/static',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/items': 'http://localhost:3000',
            // Served from the same origin as the app, so the browser carries
            // the session cookie by itself. Calling the API on another origin
            // would put that cookie out of reach and push the token back into
            // JavaScript, which is exactly what httpOnly exists to prevent.
            '/auth': 'http://localhost:3000',
        },
    },
});
