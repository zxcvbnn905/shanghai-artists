import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: true,
    fs: {
      deny: [
        '**/data/auth.json',
        '**/cloudbase/cloudbaserc.json',
        '**/worker/.dev.vars'
      ]
    },
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});

