import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  envPrefix: 'NEXUS_PUBLIC_',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../../packages/contracts/dist/', import.meta.url))],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.nexus/**', '**/*.{sqlite,sqlite-wal,sqlite-shm,db,db-wal,db-shm}'],
    },
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
})
