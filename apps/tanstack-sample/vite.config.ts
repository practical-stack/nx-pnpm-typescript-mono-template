import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    conditions: ['@repo/source'],
  },
  plugins: [tailwindcss(), tsConfigPaths(), tanstackStart(), viteReact()],
})
