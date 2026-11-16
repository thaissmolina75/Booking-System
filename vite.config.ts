import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // Lets the dev server be opened through a tunnel or cloud preview, where the
    // browser cannot reach 127.0.0.1:54321 itself. With VITE_SUPABASE_URL set to
    // "same-origin" the app calls its own address and these rules forward the
    // calls to the local Supabase stack. Not used in production builds.
    allowedHosts: process.env.VITE_SUPABASE_URL === 'same-origin' ? true : undefined,
    proxy: Object.fromEntries(
      ['/auth/v1', '/rest/v1', '/realtime/v1', '/storage/v1'].map((prefix) => [
        prefix,
        { target: 'http://127.0.0.1:54321', changeOrigin: true, ws: true },
      ]),
    ),
  },
})
