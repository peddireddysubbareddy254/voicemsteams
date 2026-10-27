import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Teams tabs must be served over HTTPS.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    // Allow dev tunnels / ngrok hostnames.
    allowedHosts: true,
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: true,
  },
})
