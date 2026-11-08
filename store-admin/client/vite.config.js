import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const clientDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(clientDir, '..');
const localEnvPath = path.join(projectDir, 'server', '.env');
const exampleEnvPath = path.join(projectDir, 'server', '.env.example');
const localEnvironmentPath = existsSync(localEnvPath) ? localEnvPath : exampleEnvPath;
const localEnvironment = existsSync(localEnvironmentPath)
  ? dotenv.parse(readFileSync(localEnvironmentPath))
  : {};
const localUrlValue = String(localEnvironment.LOCAL_URL || '').trim();
if (!localUrlValue) {
  throw new Error('LOCAL_URL chưa được cấu hình trong server/.env hoặc server/.env.example.');
}
const localUrl = new URL(localUrlValue);
const localApiHost = String(localEnvironment.LOCAL_HOST || '').trim();
const localApiPort = Number(localEnvironment.PORT);
if (!localApiHost || !Number.isInteger(localApiPort) || localApiPort < 1 || localApiPort > 65535) {
  throw new Error('LOCAL_HOST và PORT phải được cấu hình hợp lệ trong server/.env hoặc server/.env.example.');
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep large optional libraries in independent chunks so the initial
        // storefront/auth bundle does not need to download them up front.
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'vendor-motion';
          if (/\/node_modules\/(recharts|victory-vendor|internmap|d3-[^/]+)\//.test(id)) return 'vendor-charts';
          if (/\/node_modules\/lucide-react\//.test(id)) return 'vendor-icons';
          if (/\/node_modules\/sweetalert2\//.test(id)) return 'vendor-alerts';
          if (/\/node_modules\/qrcode\//.test(id)) return 'vendor-qrcode';
          if (/\/node_modules\/(jspdf|jspdf-autotable|canvg|html2canvas|dompurify)\//.test(id)) return 'vendor-pdf';
          return undefined;
        },
      },
    },
  },
  server: {
    host: localUrl.hostname,
    port: Number(localUrl.port || 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://${localApiHost}:${localApiPort}`,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
