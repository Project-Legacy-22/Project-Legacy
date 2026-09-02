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
        },
    },
});
