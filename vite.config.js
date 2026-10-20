import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// 仅开发服务器注入不受 URL 限制的 Mapbox token；生产构建/静态部署不会包含它
function devMapboxToken(token) {
  return {
    name: 'dev-mapbox-token',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!token) return html;
      return {
        html,
        tags: [{
          tag: 'script',
          injectTo: 'head-prepend',
          children: `window.__DEV_MAPBOX_TOKEN__ = ${JSON.stringify(token)};`
        }]
      };
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue(), devMapboxToken(env.VITE_MAPBOX_TOKEN_DEV)],
    server: {
      host: '127.0.0.1',
      port: 3000,
      open: true,
      fs: {
        deny: [
          '**/data/auth.json',
          '**/cloudbase/cloudbaserc.json',
          '**/worker/.dev.vars',
          '**/.env.local'
        ]
      },
      proxy: {
        '/api': 'http://localhost:3001'
      }
    }
  };
});

