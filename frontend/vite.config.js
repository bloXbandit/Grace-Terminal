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
    emptyOutDir: false
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
  server: {
    port: 5005,  // HARDCODED: Frontend always on 5005
    host: '0.0.0.0',
    strictPort: true,
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
