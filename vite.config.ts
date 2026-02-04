import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'src/main/index.ts',
        onclean: (options) => {
          if (process.env.NODE_ENV === 'production') {
            options.clean()
          }
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['sqlite3', 'mysql2', 'pg', 'redis'],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onclean: (options) => {
          if (process.env.NODE_ENV === 'production') {
            options.clean()
          }
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
          },
        },
      },
    ]),
    renderer({
      nodeIntegration: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
