import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/baseball-scorekeeper/', // 👈 確保這裡跟你的 GitHub 倉庫名稱一致
})