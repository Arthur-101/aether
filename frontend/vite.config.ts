import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 1420,
    strictPort: true,
    open: false,
    // The overlay is a full-window modal, and Aether's window covers the
    // whole desktop. A transform error would blank the user's screen, so
    // errors go to the console and the terminal instead.
    hmr: {
      overlay: false,
    },
  },
})
