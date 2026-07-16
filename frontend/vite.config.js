import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
import path from 'path';
import svgLoader from 'vite-svg-loader';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd()); // ✅ 根据 --mode 自动加载正确的 .env 文件

  return {
  root: __dirname,
  // 根据环境变量 VITE_IS_CLIENT 决定使用哪个 base 
  base: env.VITE_IS_CLIENT === 'true' ? './' : '/', 
  build: {
    outDir: '../public', // Output to public directory where backend serves from
    emptyOutDir: true, // Clear old build files to prevent stale cache issues
    rollupOptions: {
      output: {
        // Add hash to filenames for cache busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  plugins: [
    vue(),
    svgLoader(),
    Components({
      resolvers: [
        AntDesignVueResolver({
          importStyle: 'less',
        }),
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~@': path.resolve(__dirname, 'src'),
    },
  },
  // FIX: stale optimize-deps cache caused 504 "Outdated Optimize Dep" on lazy-loaded
  // routes — Settings/My Assistant/Digital Twin buttons silently failed to navigate.
  // Force a fresh prebundle on each dev-server start (adds ~1-2s to boot, kills the bug).
  optimizeDeps: {
    force: true,
  },
  server: {
    port: 5005,  // HARDCODED: Frontend always on 5005
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: ['.ngrok-free.app', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',  // HARDCODED: Backend always on 3000
        protocol: 'http',
        changeOrigin: true,
        ws: true,
      },
    },
    },
  };
});
