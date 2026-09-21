import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 愿望配图由后端托管，开发模式下同样要代理过去
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 精灵头像（星光值抽奖用）也是后端托管的
      '/spirits': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
